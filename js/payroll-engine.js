// ==========================================
//  PAYROLL ENGINE
//  Salary Slip, Archive, History, Bulk PDF,
//  Validation, Fast Search Index, API Hooks
// ==========================================

const PayrollEngine = {

    // ─── Constants ──────────────────────────────────────────────────────────
    STORAGE_HISTORY_KEY: 'hr_payroll_history',
    STORAGE_ARCHIVE_KEY: 'hr_pdf_archive',
    STORAGE_CONTACTS_KEY: 'hr_employee_contacts',

    // ─── Fast O(1) search indices (rebuilt on each import) ──────────────────
    _codeIndex: new Map(),   // employeeCode → employee record
    _nameIndex: new Map(),   // normalized name → [employee records]

    // ─── Payroll Month Helpers ───────────────────────────────────────────────
    getCurrentPayrollMonth: function() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },

    getMonthLabel: function(monthKey) {
        if (!monthKey) return 'غير محدد';
        const [y, m] = monthKey.split('-');
        const months = [
            'يناير','فبراير','مارس','أبريل','مايو','يونيو',
            'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
        ];
        return `${months[parseInt(m) - 1] || m} ${y}`;
    },

    // ─── Search Index ────────────────────────────────────────────────────────
    buildSearchIndex: function(employees) {
        this._codeIndex = new Map();
        this._nameIndex = new Map();

        employees.forEach(emp => {
            // Index by code (exact, case-insensitive)
            const codeKey = String(emp.employeeId || '').trim().toLowerCase();
            if (codeKey) {
                this._codeIndex.set(codeKey, emp);
            }

            // Index by normalized name
            const nameKey = this._normalizeName(emp.name || '');
            if (nameKey) {
                if (!this._nameIndex.has(nameKey)) this._nameIndex.set(nameKey, []);
                this._nameIndex.get(nameKey).push(emp);
            }
        });

        console.log(`[PayrollEngine] Built search index: ${this._codeIndex.size} codes, ${this._nameIndex.size} unique names`);
    },

    _normalizeName: function(name) {
        if (!name) return '';
        return String(name)
            .trim()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/\s+/g, ' ')
            .toLowerCase();
    },

    /**
     * Fast search by code, exact name, or partial name.
     * Priority: exact code > partial code > exact name > partial name.
     * Never merges similar names — returns separate records.
     */
    searchEmployees: function(query, employees) {
        if (!query || !query.trim()) return employees;

        const q = query.trim();
        const qLower = q.toLowerCase();
        const qNorm = this._normalizeName(q);

        const results = [];
        const seen = new Set();

        // Pass 1: Exact code match
        if (this._codeIndex.has(qLower)) {
            const emp = this._codeIndex.get(qLower);
            if (!seen.has(emp.id)) { seen.add(emp.id); results.push({ emp, score: 1 }); }
        }

        // Pass 2: Partial code match
        for (const [code, emp] of this._codeIndex.entries()) {
            if (!seen.has(emp.id) && code.includes(qLower)) {
                seen.add(emp.id);
                results.push({ emp, score: 2 });
            }
        }

        // Pass 3: Exact normalized name match
        if (this._nameIndex.has(qNorm)) {
            for (const emp of this._nameIndex.get(qNorm)) {
                if (!seen.has(emp.id)) {
                    seen.add(emp.id);
                    results.push({ emp, score: 3 });
                }
            }
        }

        // Pass 4: Partial normalized name match — iterate full list to preserve identity
        employees.forEach(emp => {
            if (!seen.has(emp.id)) {
                const nameNorm = this._normalizeName(emp.name);
                if (nameNorm.includes(qNorm)) {
                    seen.add(emp.id);
                    results.push({ emp, score: 4 });
                }
            }
        });

        return results.sort((a, b) => a.score - b.score).map(r => r.emp);
    },

    // ─── Payroll Validation (Requirement 8) ─────────────────────────────────
    validatePayrollBeforePDF: function(employees) {
        const errors = [];
        const warnings = [];
        const codeSeen = new Map();

        employees.forEach((emp, idx) => {
            const label = emp.name || `الصف ${idx + 1}`;

            // Missing employee code
            if (!emp.employeeId || String(emp.employeeId).trim() === '') {
                warnings.push({ type: 'missing_code', message: `⚠️ ${label}: كود الموظف مفقود` });
            } else {
                const codeStr = String(emp.employeeId).trim();
                if (codeSeen.has(codeStr)) {
                    errors.push({ type: 'duplicate_code', message: `❌ الكود "${codeStr}" مكرر (${label} و ${codeSeen.get(codeStr)})` });
                } else {
                    codeSeen.set(codeStr, label);
                }
            }

            // Missing employee name
            if (!emp.name || String(emp.name).trim() === '') {
                errors.push({ type: 'missing_name', message: `❌ الصف ${idx + 1}: اسم الموظف مفقود` });
            }

            // Missing or zero salary values
            if (!emp.basicSalary || emp.basicSalary === 0) {
                warnings.push({ type: 'missing_salary', message: `⚠️ ${label}: الراتب الأساسي صفر أو مفقود` });
            }

            // Negative salaries
            if (emp.basicSalary < 0) {
                errors.push({ type: 'negative_salary', message: `❌ ${label}: الراتب الأساسي سالب (${emp.basicSalary})` });
            }
            if (emp.calculatedNet < 0) {
                warnings.push({ type: 'negative_net', message: `⚠️ ${label}: صافي الراتب سالب (${emp.calculatedNet.toFixed(2)})` });
            }
        });

        return { errors, warnings, isValid: errors.length === 0 };
    },

    // ─── Payroll History ─────────────────────────────────────────────────────
    getPayrollHistory: function() {
        try {
            const stored = localStorage.getItem(this.STORAGE_HISTORY_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    },

    savePayrollSnapshot: function(monthKey, employees, companyName, sheetName) {
        const history = this.getPayrollHistory();
        const snapshot = {
            monthKey,
            monthLabel: this.getMonthLabel(monthKey),
            companyName,
            sheetName,
            savedAt: new Date().toISOString(),
            employeeCount: employees.length,
            totalNet: employees.reduce((s, e) => s + (e.calculatedNet || 0), 0),
            employees: employees.map(emp => ({
                id: emp.id,
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.department,
                basicSalary: emp.basicSalary,
                allowances: emp.allowances,
                overtime: emp.overtime || 0,
                attendanceDeductions: emp.attendanceDeductions || 0,
                attendanceOvertimeMinutes: emp.attendanceOvertimeMinutes || 0,
                attendanceLateMinutes: emp.attendanceLateMinutes || 0,
                deductions: emp.deductions,
                calculatedSocialSecurity: emp.calculatedSocialSecurity,
                calculatedTaxes: emp.calculatedTaxes,
                calculatedDeductions: emp.calculatedDeductions,
                calculatedNet: emp.calculatedNet,
                grossSalary: emp.grossSalary,
                validationStatus: emp.validationStatus,
                validationAlerts: emp.validationAlerts || []
            }))
        };
        history[monthKey] = snapshot;
        try {
            localStorage.setItem(this.STORAGE_HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('[PayrollEngine] Failed to save history snapshot:', e);
        }
        console.log(`[PayrollEngine] Saved payroll snapshot for ${monthKey}: ${employees.length} employees`);
        return snapshot;
    },

    getSnapshotMonths: function() {
        const history = this.getPayrollHistory();
        return Object.keys(history).sort().reverse(); // newest first
    },

    getSnapshot: function(monthKey) {
        const history = this.getPayrollHistory();
        return history[monthKey] || null;
    },

    deleteSnapshot: function(monthKey) {
        const history = this.getPayrollHistory();
        delete history[monthKey];
        localStorage.setItem(this.STORAGE_HISTORY_KEY, JSON.stringify(history));
    },

    // ─── PDF Archive ──────────────────────────────────────────────────────────
    getPDFArchive: function() {
        try {
            const stored = localStorage.getItem(this.STORAGE_ARCHIVE_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    },

    recordPDFGenerated: function(monthKey, employeeCode, employeeName) {
        const archive = this.getPDFArchive();
        if (!archive[monthKey]) archive[monthKey] = {};
        archive[monthKey][String(employeeCode)] = {
            employeeCode: String(employeeCode),
            employeeName,
            generatedAt: new Date().toISOString(),
            filename: `${monthKey}/${employeeCode}.pdf`
        };
        try {
            localStorage.setItem(this.STORAGE_ARCHIVE_KEY, JSON.stringify(archive));
        } catch (e) {
            console.error('[PayrollEngine] Failed to save PDF archive:', e);
        }
    },

    getPDFsForEmployee: function(employeeCode) {
        const archive = this.getPDFArchive();
        const result = [];
        Object.keys(archive).forEach(month => {
            const rec = archive[month][String(employeeCode)];
            if (rec) result.push({ month, ...rec });
        });
        return result.sort((a, b) => b.month.localeCompare(a.month));
    },

    getPDFsForMonth: function(monthKey) {
        const archive = this.getPDFArchive();
        return archive[monthKey] || {};
    },

    // ─── Employee Contact Registry (Requirement 7) ───────────────────────────
    getContactRegistry: function() {
        try {
            const stored = localStorage.getItem(this.STORAGE_CONTACTS_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    },

    saveContact: function(employeeCode, contactData) {
        const contacts = this.getContactRegistry();
        contacts[String(employeeCode)] = {
            ...contacts[String(employeeCode)],
            ...contactData,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(this.STORAGE_CONTACTS_KEY, JSON.stringify(contacts));
    },

    getContact: function(employeeCode) {
        const contacts = this.getContactRegistry();
        return contacts[String(employeeCode)] || {
            whatsappNumber: '',
            alternativeNumber: '',
            notes: '',
            lastSentMonth: '',
            lastSentStatus: '',
            pendingPDF: false
        };
    },

    // ─── WhatsApp Preparation (Requirement 6) ───────────────────────────────
    prepareWhatsAppPayload: function(employeeCode, monthKey) {
        const contact = this.getContact(employeeCode);
        const archive = this.getPDFArchive();
        const pdfRecord = (archive[monthKey] || {})[String(employeeCode)] || null;

        return {
            employeeCode: String(employeeCode),
            whatsappNumber: contact.whatsappNumber || '',
            alternativeNumber: contact.alternativeNumber || '',
            monthKey: monthKey || this.getCurrentPayrollMonth(),
            pendingPDF: pdfRecord ? pdfRecord.filename : null,
            lastSentMonth: contact.lastSentMonth || '',
            lastSentStatus: contact.lastSentStatus || 'pending',
            generatedAt: pdfRecord ? pdfRecord.generatedAt : null,
            ready: !!(contact.whatsappNumber && pdfRecord)
        };
    },

    // ─── Future API Integration Hooks (Requirement 10) ──────────────────────

    /**
     * HOOK ONLY — No API call yet.
     * Called when salary slip is ready to send.
     */
    sendSalarySlip: async function(employeeCode, monthKey) {
        const payload = this.prepareWhatsAppPayload(employeeCode, monthKey);
        console.log('[PayrollEngine] sendSalarySlip (HOOK)', payload);
        // TODO: Replace with actual API call
        // await fetch('/api/send-salary-slip', { method: 'POST', body: JSON.stringify(payload) });
        return { status: 'hook_only', payload };
    },

    /**
     * HOOK ONLY — No API call yet.
     * Called to send via WhatsApp Business API.
     */
    sendWhatsAppDocument: async function(employeeCode, monthKey) {
        const payload = this.prepareWhatsAppPayload(employeeCode, monthKey);
        console.log('[PayrollEngine] sendWhatsAppDocument (HOOK)', payload);
        // TODO: Replace with actual WhatsApp Business API call
        return { status: 'hook_only', payload };
    },

    /**
     * HOOK ONLY — No API call yet.
     * Called to send via email.
     */
    sendEmailSalarySlip: async function(employeeCode, monthKey, emailAddress) {
        const payload = this.prepareWhatsAppPayload(employeeCode, monthKey);
        console.log('[PayrollEngine] sendEmailSalarySlip (HOOK)', { ...payload, emailAddress });
        // TODO: Replace with actual email API call
        return { status: 'hook_only', payload };
    },

    // ─── Individual Salary Slip PDF Generation (Requirement 1) ─────────────
    
        generateSlipHTML: async function(emp, companyName, monthKey) {
            // Guard against null/undefined employee objects
            if (!emp) {
                console.warn('[PayrollEngine] generateSlipHTML called with null employee');
                return '';
            }

            const monthLabel = this.getMonthLabel(monthKey);
            const logoUrl = await Exporter.getLogoDataUrl();

            // Compute earnings and deductions from source data (no hard‑coded values)
            const basic = Number(emp.basicSalary) || 0;
            const allowances = Number(emp.allowances) || 0;
            const overtime = Number(emp.overtime) || 0;
            const otherEarnings = Number(emp.otherEarnings) || 0;
            const totalEarnings = basic + allowances + overtime + otherEarnings;

            const attendance = Number(emp.attendanceDeductions) || 0;
            const otherDeductions = Number(emp.otherDeductions) || 0;
            const social = Number(emp.calculatedSocialSecurity) || 0;
            const taxes = Number(emp.calculatedTaxes) || 0;
            const deductions = Number(emp.deductions) || 0;
            const totalDeductions = attendance + otherDeductions + social + taxes + deductions;

            const netSalary = totalEarnings - totalDeductions;
            // Use computed netSalary for display, ensuring formula consistency
            const displayedNet = netSalary.toFixed(2);

            // Compact styling – reduce paddings, use flex layout, avoid page breaks
            const containerStyle = "font-family:'Cairo',Arial,sans-serif;padding:6px;background:#fff;color:#1e293b;width:100%;box-sizing:border-box;margin:0 auto;max-width:650px;page-break-inside:avoid;";
            const headerFlexStyle = "display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;";
            const innerBoxStyle = "padding:8px;box-sizing:border-box;";
            const titleRowStyle = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";

        const infoGridStyle = "display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px;margin-bottom:8px;font-size:0.75rem;box-sizing:border-box;";
        const sectionHeaderStyle = "background:#ecfdf5;font-weight:bold;";
        const rowStyleEven = "background:#f8fafc;";
        const cellStyle = "padding:4px 6px;border:1px solid #e2e8f0;";
        const cellBoldStyle = "font-weight:bold;";
        const totalRowStyle = "font-weight:bold;border-top:2px solid #cbd5e1;background:#e2e8f0;";
        const totalDeductionRowStyle = "font-weight:bold;background:#fee2e2;border-top:2px solid #cbd5e1;";
        const netRowStyle = "font-weight:bold;font-size:1rem;border-top:3px solid #10b981;";

        return `
        <div dir="rtl" style="${containerStyle}">
            <div style="${innerBoxStyle}">
                <div style="${headerFlexStyle}">
                    <div><span style="font-size:1.4rem;font-weight:900;color:#059669;">${HtmlSafety.escape(companyName || 'INFARM')}</span></div>
                    <div style="height:30px;display:flex;align-items:center;">${logoUrl ? `<img src="${logoUrl}" style="max-height:30px;width:auto;object-fit:contain;"/>` : ''}</div>
                </div>
                <div style="border-bottom:2px solid #10b981;margin-bottom:8px;"></div>
                <div style="${titleRowStyle}">
                    <h2 style="color:#1e293b;font-size:0.95rem;font-weight:700;margin:0;">قسيمة راتب الموظف</h2>
                    <p style="color:#64748b;font-size:0.75rem;margin:0;">شهر: ${monthLabel}</p>
                </div>
                <div style="${infoGridStyle}">
                    <div><strong>الرقم الوظيفي:</strong> ${HtmlSafety.escape(emp.employeeId || '#EMP' + String(emp.id).padStart(4, '0'))}</div>
                    <div><strong>اسم الموظف:</strong> ${HtmlSafety.escape(emp.name)}</div>
                </div>

                <table style="width:100%;border-collapse:collapse;margin-bottom:8px;text-align:right;font-size:0.75rem;box-sizing:border-box;">
                    <thead>
                        <tr style="${sectionHeaderStyle}">
                            <th style="${cellStyle} line-height:1.2;">البند /<br>تفاصيل</th>
                            <th style="${cellStyle} text-align:left;">المبلغ (SAR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background:#f8fafc;"><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#059669;">(+) البدلات والمزايا</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#059669;">${emp.allowances.toFixed(2)}</td></tr>
                        <tr style="background:#f8fafc;"><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#059669;">(+) العمل الإضافي</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#059669;">${(emp.overtime||0).toFixed(2)}</td></tr>
                        <tr style="font-weight:bold; border-top:1px solid #cbd5e1;"><td style="padding:10px 12px; border:1px solid #cbd5e1; background:#e2e8f0;">إجمالي الراتب الإجمالي (Gross)</td><td style="padding:10px 12px; border:1px solid #cbd5e1; text-align:left; background:#e2e8f0;">${emp.grossSalary.toFixed(2)}</td></tr>
                        <tr><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#ef4444;">(-) التأمينات الاجتماعية GOSI</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#ef4444;">${emp.calculatedSocialSecurity.toFixed(2)}</td></tr>
                        <tr style="background:#f8fafc;"><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#ef4444;">(-) خصم حضور وغياب</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#ef4444;">${(emp.attendanceDeductions||0).toFixed(2)}</td></tr>
                        <tr><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#ef4444;">(-) استقطاعات وخصومات أخرى</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#ef4444;">${emp.deductions.toFixed(2)}</td></tr>
                        <tr><td style="padding:10px 12px; border:1px solid #e2e8f0; color:#ef4444;">(-) الضرائب المستقطعة</td><td style="padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#ef4444;">${emp.calculatedTaxes.toFixed(2)}</td></tr>
                        <tr style="font-weight:bold; font-size:1.1rem; border-top:2px solid #10b981;">
                            <td style="padding:12px; border:1px solid #10b981; background:#ecfdf5; color:#047857;">صافي الراتب المستحق الدفع (Net)</td>
                            <td style="padding:12px; border:1px solid #10b981; text-align:left; background:#ecfdf5; color:#047857;">${displayedNet} SAR</td>
                        </tr>
                    </tbody>
                </table>

                ${emp.validationAlerts && emp.validationAlerts.length > 0 ? `
                <div style="background:#fdf2f2; border:1px solid #fde8e8; border-radius:8px; padding:12px; margin-bottom:24px; font-size:0.85rem; color:#9b1c1c;">
                    <strong>ملاحظات وتنبيهات التدقيق:</strong>
                    <ul style="margin:6px 18px 0 0; padding:0;">
                        ${emp.validationAlerts.map(a => `<li>${HtmlSafety.escape(a.message)}</li>`).join('')}
                    </ul>
                </div>` : ''}

                <div style="margin-top:40px; display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; font-size:0.85rem;">
                    <div>
                        <p style="margin-bottom:40px; color:#475569; font-weight:bold;">توقيع واعتماد الموارد البشرية</p>
                        <div style="border-top:1px dashed #94a3b8; width:80%; margin:0 auto;"></div>
                    </div>
                    <div>
                        <p style="margin-bottom:40px; color:#475569; font-weight:bold;">توقيع واستلام الموظف</p>
                        <div style="border-top:1px dashed #94a3b8; width:80%; margin:0 auto;"></div>
                    </div>
                </div>

                <div style="margin-top:30px; border-top:1px dashed #cbd5e1; padding-top:12px; text-align:center; font-size:0.75rem; color:#94a3b8;">
                    تم إنشاء هذه القسيمة إلكترونياً وهي موثقة وصالحة للاستخدام الإداري.
                </div>
            </div>
        </div>`;
    },

    /**
     * Generate & download a single PDF salary slip.
     * Records to archive.
     */
    generateSingleSlip: async function(emp, companyName, monthKey) {
        // Guard against null/undefined employee objects; provide default empty employee to ensure slip generation
        if (!emp) {
            console.warn('[PayrollEngine] generateSingleSlip received null employee, using defaults');
            emp = {
                employeeId: '',
                id: '',
                name: '',
                basicSalary: 0,
                allowances: 0,
                overtime: 0,
                otherEarnings: 0,
                attendanceDeductions: 0,
                otherDeductions: 0,
                calculatedSocialSecurity: 0,
                calculatedTaxes: 0,
                deductions: 0,
                calculatedNet: 0,
                grossSalary: 0,
                validationAlerts: []
            };
        }
        monthKey = monthKey || this.getCurrentPayrollMonth();
        const html = await this.generateSlipHTML(emp, companyName, monthKey);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        document.body.appendChild(tempDiv);

        const empCode = emp.employeeId || String(emp.id);
        const safeCode = String(empCode).replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
        const safeName = String(emp.name || '').replace(/\s+/g, '_');
        const opt = {
            margin: 8,
            filename: `قسيمة_${safeCode}_${safeName}_${monthKey}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        return html2pdf().from(tempDiv).set(opt).save().then(() => {
            document.body.removeChild(tempDiv);
            this.recordPDFGenerated(monthKey, empCode, emp.name);
        });
    },

    /**
     * Bulk PDF generation for all employees.
     * Calls onProgress(current, total) between slips.
     * Performance: sequential to avoid browser OOM on 5000+ employees.
     */
    generateAllSlips: async function(employees, companyName, monthKey, onProgress, signal) {
        monthKey = monthKey || this.getCurrentPayrollMonth();
        const total = employees.length;
        let generated = 0;
        let failed = 0;

        for (let i = 0; i < total; i++) {
            if (signal && signal.aborted) break;

            const emp = employees[i];
            try {
                await this.generateSingleSlip(emp, companyName, monthKey);
                generated++;
            } catch (err) {
                console.error(`[PayrollEngine] Failed to generate slip for ${emp.name}:`, err);
                failed++;
            }

            if (onProgress) onProgress(i + 1, total, emp.name, failed);

            // Yield to browser every 5 slips to prevent UI freeze
            if ((i + 1) % 5 === 0) {
                await new Promise(r => setTimeout(r, 10));
            }
        }

        return { generated, failed, total, monthKey };
    },

    // ─── Employee Profile Builder ─────────────────────────────────────────────
    buildEmployeeProfile: function(employeeCode, employees, history, archive) {
        // Find current month record
        const current = employees.find(e =>
            String(e.employeeId).trim().toLowerCase() === String(employeeCode).trim().toLowerCase()
        );

        // Build payroll history across all months
        const hist = this.getPayrollHistory();
        const monthlyData = [];
        Object.keys(hist).sort().forEach(monthKey => {
            const snap = hist[monthKey];
            const rec = snap.employees.find(e =>
                String(e.employeeId).trim().toLowerCase() === String(employeeCode).trim().toLowerCase()
            );
            if (rec) {
                monthlyData.push({
                    monthKey,
                    monthLabel: this.getMonthLabel(monthKey),
                    basicSalary: rec.basicSalary,
                    allowances: rec.allowances,
                    overtime: rec.overtime || 0,
                    deductions: rec.calculatedDeductions,
                    net: rec.calculatedNet
                });
            }
        });

        // PDF history
        const pdfHistory = this.getPDFsForEmployee(employeeCode);

        // Contact info
        const contact = this.getContact(employeeCode);

        return {
            current,
            monthlyData,
            pdfHistory,
            contact
        };
    }
};

// Expose globally
window.PayrollEngine = PayrollEngine;
