// Exporter for PDF and Excel reports
const Exporter = {
    // Generate and download a PDF salary slip for a single employee
    getLogoDataUrl: function() {
        if (this._logoDataUrl !== undefined) {
            return Promise.resolve(this._logoDataUrl);
        }
        
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    this._logoDataUrl = canvas.toDataURL('image/jpeg');
                    resolve(this._logoDataUrl);
                } catch (e) {
                    console.error('[EXPORTER] Failed to convert logo to data url:', e);
                    this._logoDataUrl = null;
                    resolve(null);
                }
            };
            img.onerror = () => {
                // Try logo.png if logo.jpg fails
                const imgPng = new Image();
                imgPng.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgPng.naturalWidth;
                        canvas.height = imgPng.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(imgPng, 0, 0);
                        this._logoDataUrl = canvas.toDataURL('image/png');
                        resolve(this._logoDataUrl);
                    } catch (e) {
                        console.error('[EXPORTER] Failed to convert png logo to data url:', e);
                        this._logoDataUrl = null;
                        resolve(null);
                    }
                };
                imgPng.onerror = () => {
                    this._logoDataUrl = null;
                    resolve(null);
                };
                imgPng.src = 'logo.png';
            };
            img.src = 'logo.jpg';
        });
    },

    // Generate and download a PDF salary slip for a single employee
    exportSalarySlipPDF: async function(employee, companyName = 'INFARM') {
        const tempDiv = document.createElement('div');
        tempDiv.dir = 'rtl';
        tempDiv.style.fontFamily = 'Cairo, sans-serif';
        tempDiv.style.padding = '30px';
        tempDiv.style.background = '#ffffff';
        tempDiv.style.color = '#1e293b';

        // Get date string in Hijri or Gregorian Arabic style
        const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
        const logoUrl = await this.getLogoDataUrl();

        tempDiv.innerHTML = `
            <div style="border: 2px solid #10b981; border-radius: 16px; padding: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <!-- Brand Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px;">
                    <!-- Top Right Corner: Company Name (in RTL, first child goes to right) -->
                    <div style="text-align: right;">
                        <span style="font-family: 'Cairo', sans-serif; font-size: 1.8rem; font-weight: 900; color: #059669; letter-spacing: 1px;">INFARM</span>
                    </div>
                    <!-- Top Left Corner: Logo (in RTL, second child goes to left) -->
                    <div style="display: flex; align-items: center; justify-content: flex-end; height: 50px;">
                        ${logoUrl ? `<img src="${logoUrl}" style="max-height: 50px; width: auto; object-fit: contain;" />` : ''}
                    </div>
                </div>

                <!-- Horizontal Divider Line -->
                <div style="border-bottom: 2px solid #10b981; margin-bottom: 20px;"></div>

                <!-- Document Details -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <h2 style="color: #1e293b; font-size: 1.2rem; font-weight: 700; margin: 0;">قسيمة راتب الموظف</h2>
                    </div>
                    <div style="text-align: left;">
                        <p style="color: #64748b; font-size: 0.9rem; margin: 0;">لفترة: ${dateStr}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 0.9rem;">
                    <div><strong>اسم الموظف:</strong> ${HtmlSafety.escape(employee.name)}</div>
                    <div><strong>القسم / الإدارة:</strong> ${HtmlSafety.escape(employee.department)}</div>
                    <div><strong>الرقم المرجعي:</strong> ${HtmlSafety.escape(employee.employeeId || '#EMP' + String(employee.id).padStart(4, '0'))}</div>
                    <div><strong>حالة التدقيق:</strong> <span style="font-weight: bold; color: ${employee.validationStatus === 'valid' ? '#10b981' : employee.validationStatus === 'warning' ? '#f59e0b' : '#ef4444'}">${employee.validationStatus === 'valid' ? 'مطابق' : employee.validationStatus === 'warning' ? 'تحذير' : 'خطأ في الحساب'}</span></div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; text-align: right; font-size: 0.9rem;">
                    <thead>
                        <tr style="background: #10b981; color: white;">
                            <th style="padding: 10px 12px; border: 1px solid #10b981; font-weight: 700;">البند / تفاصيل الراتب</th>
                            <th style="padding: 10px 12px; border: 1px solid #10b981; font-weight: 700; text-align: left;">المبلغ (SAR)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0;">الراتب الأساسي</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left;">${employee.basicSalary.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f8fafc;">
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #059669;">(+) البدلات والمزايا</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #059669;">${employee.allowances.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f8fafc;">
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #059669;">(+) العمل الإضافي</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #059669;">${(employee.overtime || 0).toFixed(2)}</td>
                        </tr>
                        <tr style="font-weight: bold; border-top: 1px solid #cbd5e1;">
                            <td style="padding: 10px 12px; border: 1px solid #cbd5e1; background: #e2e8f0;">إجمالي الراتب الإجمالي (Gross)</td>
                            <td style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: left; background: #e2e8f0;">${employee.grossSalary.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #ef4444;">(-) التأمينات الاجتماعية (GOSI)</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #ef4444;">${employee.calculatedSocialSecurity.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f8fafc;">
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #ef4444;">(-) خصم حضور وغياب</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #ef4444;">${(employee.attendanceDeductions || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #ef4444;">(-) استقطاعات وخصومات أخرى</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #ef4444;">${employee.deductions.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #ef4444;">(-) الضرائب المستقطعة</td>
                            <td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; color: #ef4444;">${employee.calculatedTaxes.toFixed(2)}</td>
                        </tr>
                        <tr style="font-weight: bold; font-size: 1.1rem; border-top: 2px solid #10b981;">
                            <td style="padding: 12px; border: 1px solid #10b981; background: #ecfdf5; color: #047857;">صافي الراتب المستحق الدفع (Net)</td>
                            <td style="padding: 12px; border: 1px solid #10b981; text-align: left; background: #ecfdf5; color: #047857;">${employee.calculatedNet.toFixed(2)} SAR</td>
                        </tr>
                    </tbody>
                </table>

                ${employee.validationAlerts.length > 0 ? `
                    <div style="background: #fdf2f2; border: 1px solid #fde8e8; border-radius: 8px; padding: 12px; margin-bottom: 24px; font-size: 0.85rem; color: #9b1c1c;">
                        <strong>ملاحظات وتنبيهات التدقيق:</strong>
                        <ul style="margin: 6px 18px 0 0; padding: 0;">
                            ${employee.validationAlerts.map(a => `<li>${HtmlSafety.escape(a.message)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 0.85rem;">
                    <div>
                        <p style="margin-bottom: 40px; color: #475569; font-weight: bold;">توقيع واعتماد الموارد البشرية</p>
                        <div style="border-top: 1px dashed #94a3b8; width: 80%; margin: 0 auto;"></div>
                    </div>
                    <div>
                        <p style="margin-bottom: 40px; color: #475569; font-weight: bold;">توقيع واستلام الموظف</p>
                        <div style="border-top: 1px dashed #94a3b8; width: 80%; margin: 0 auto;"></div>
                    </div>
                </div>

                <div style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 12px; text-align: center; font-size: 0.75rem; color: #94a3b8;">
                    تم إنشاء هذه القسيمة إلكترونياً وهي موثقة وصالحة للاستخدام الإداري.
                </div>
            </div>
        `;

        document.body.appendChild(tempDiv);
        
        const opt = {
            margin: 10,
            filename: `قسيمة_راتب_${employee.name.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        return html2pdf().from(tempDiv).set(opt).save().then(() => {
            document.body.removeChild(tempDiv);
        });
    },

    // Export the full report/summary of employees payroll table to a PDF report
    exportPayrollReportPDF: async function(employees, sheetName = 'عام', companyName = 'INFARM') {
        const tempDiv = document.createElement('div');
        tempDiv.dir = 'rtl';
        tempDiv.style.fontFamily = 'Cairo, sans-serif';
        tempDiv.style.padding = '30px';
        tempDiv.style.background = '#ffffff';
        tempDiv.style.color = '#1e293b';

        const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // Calculate dynamic payroll sums
        const totalBasic = employees.reduce((s, e) => s + e.basicSalary, 0);
        const totalAllowances = employees.reduce((s, e) => s + e.allowances, 0);
        const totalOvertime = employees.reduce((s, e) => s + (e.overtime || 0), 0);
        const totalAttendanceDeductions = employees.reduce((s, e) => s + (e.attendanceDeductions || 0), 0);
        const totalDeductions = employees.reduce((s, e) => s + e.calculatedDeductions, 0);
        const totalNet = employees.reduce((s, e) => s + e.calculatedNet, 0);

        let tableRows = '';
        employees.forEach((emp, index) => {
            tableRows += `
                <tr style="${index % 2 === 0 ? 'background: #f8fafc;' : ''}">
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">${HtmlSafety.escape(emp.employeeId || index + 1)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1;">${HtmlSafety.escape(emp.name)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">${HtmlSafety.escape(emp.department)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left;">${emp.basicSalary.toFixed(2)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left;">${emp.allowances.toFixed(2)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; color: #059669;">${(emp.overtime || 0).toFixed(2)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; color: #ef4444;">${(emp.attendanceDeductions || 0).toFixed(2)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; color: #ef4444;">${emp.calculatedDeductions.toFixed(2)}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; color: #059669;">${emp.calculatedNet.toFixed(2)}</td>
                </tr>
            `;
        });

        const logoUrl = await this.getLogoDataUrl();

        tempDiv.innerHTML = `
            <div style="border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px;">
                <!-- Brand Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px;">
                    <!-- Top Right Corner: Company Name (in RTL, first child goes to right) -->
                    <div style="text-align: right;">
                        <span style="font-family: 'Cairo', sans-serif; font-size: 1.8rem; font-weight: 900; color: #059669; letter-spacing: 1px;">INFARM</span>
                    </div>
                    <!-- Top Left Corner: Logo (in RTL, second child goes to left) -->
                    <div style="display: flex; align-items: center; justify-content: flex-end; height: 50px;">
                        ${logoUrl ? `<img src="${logoUrl}" style="max-height: 50px; width: auto; object-fit: contain;" />` : ''}
                    </div>
                </div>

                <!-- Horizontal Divider Line -->
                <div style="border-bottom: 2px solid #059669; margin-bottom: 20px;"></div>

                <!-- Document Details -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 1.2rem; color: #475569; font-weight: 700;">تقرير مسيرات الرواتب الإجمالي (المجموعة: ${HtmlSafety.escape(sheetName)})</h2>
                    <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #64748b;">تاريخ استخراج التقرير: ${dateStr}</p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; text-align: center;">
                    <div style="background: #f1f5f9; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.8rem; color: #64748b;">عدد الموظفين</span>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #1e293b; margin-top: 4px;">${employees.length}</div>
                    </div>
                    <div style="background: #f1f5f9; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.8rem; color: #64748b;">إجمالي الأساسي</span>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #1e293b; margin-top: 4px;">${totalBasic.toFixed(2)}</div>
                    </div>
                    <div style="background: #f1f5f9; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.8rem; color: #64748b;">إجمالي الإضافي</span>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #059669; margin-top: 4px;">${totalOvertime.toFixed(2)}</div>
                    </div>
                    <div style="background: #f1f5f9; padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.8rem; color: #64748b;">إجمالي الاستقطاعات</span>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #ef4444; margin-top: 4px;">${totalDeductions.toFixed(2)}</div>
                    </div>
                    <div style="background: #ecfdf5; padding: 10px; border-radius: 8px; border: 1px solid #a7f3d0;">
                        <span style="font-size: 0.8rem; color: #047857;">صافي الرواتب الإجمالي</span>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #059669; margin-top: 4px;">${totalNet.toFixed(2)}</div>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 0.75rem;">
                    <thead>
                        <tr style="background: #059669; color: white;">
                            <th style="padding: 8px; border: 1px solid #059669; text-align: center; width: 80px;">الرقم<br>الوظيفي</th>
                            <th style="padding: 8px; border: 1px solid #059669;">اسم<br>الموظف</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:center;">القسم</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">الأساسي</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">البدلات</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">الإضافي</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">خصم<br>غيب</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">الاستقطاعات<br>الإجمالية</th>
                            <th style="padding: 8px; border: 1px solid #059669; text-align:left;">صافي<br>الراتب</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                        <tr style="background: #e2e8f0; font-weight: bold;">
                            <td colspan="3" style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">المجموع الكلي</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">${totalBasic.toFixed(2)}</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">${totalAllowances.toFixed(2)}</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; color: #059669;">${totalOvertime.toFixed(2)}</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; color: #ef4444;">${totalAttendanceDeductions.toFixed(2)}</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; color: #ef4444;">${totalDeductions.toFixed(2)}</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; color: #059669;">${totalNet.toFixed(2)} SAR</td>
                        </tr>
                    </tbody>
                </table>

                <div style="margin-top: 40px; font-size: 0.8rem; display: flex; justify-content: space-between; color: #64748b;">
                    <div>التدقيق المالي: __________________</div>
                    <div>الاعتماد الإداري: __________________</div>
                </div>
            </div>
        `;

        document.body.appendChild(tempDiv);

        const opt = {
            margin: 10,
            filename: `تقرير_مسيرات_رواتب_${sheetName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        return html2pdf().from(tempDiv).set(opt).save().then(() => {
            document.body.removeChild(tempDiv);
        });
    },

    // Export current active employee list to an Excel workbook
    exportPayrollToExcel: function(employees, sheetName = 'الرواتب_المدققة') {
        // Prepare rows for Excel formatting
        const rows = employees.map((emp, index) => {
            return {
                'الرقم الوظيفي': emp.employeeId || `EMP${String(emp.id).padStart(4, '0')}`,
                'اسم الموظف': emp.name,
                'القسم': emp.department,
                'الراتب الأساسي': emp.basicSalary,
                'البدلات': emp.allowances,
                'العمل الإضافي': emp.overtime || 0,
                'خصم حضور وغياب': emp.attendanceDeductions || 0,
                'استقطاعات وخصومات أخرى': emp.deductions,
                'التأمينات الاجتماعية GOSI': emp.calculatedSocialSecurity,
                'الضرائب والرسوم': emp.calculatedTaxes,
                'إجمالي الخصومات المستقطعة': emp.calculatedDeductions,
                'صافي الراتب المستحق': emp.calculatedNet,
                'حالة التدقيق': emp.validationStatus === 'valid' ? 'مطابق وموثق' : emp.validationStatus === 'warning' ? 'ملاحظة/تحذير' : 'غير مطابق/خطأ',
                'ملاحظات التدقيق': emp.validationAlerts.map(a => a.message).join(' | ')
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Adjust column widths to look organized
        const maxLens = {};
        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                const val = String(row[key] || '');
                maxLens[key] = Math.max(maxLens[key] || 10, val.length + 4);
            });
        });
        
        const colWidths = Object.keys(maxLens).map(key => ({ wch: maxLens[key] }));
        worksheet['!cols'] = colWidths;

        // Force RTL rendering flag inside worksheet structure (Excel feature)
        if (!worksheet['!views']) worksheet['!views'] = [];
        worksheet['!views'].push({ RTL: true });

        XLSX.writeFile(workbook, `مسير_رواتب_${sheetName}_معدل.xlsx`);
    }
};
