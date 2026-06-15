// ============================================================
//  WhatsApp Preparation Layer — Architecture Only (No Sends)
//  All functions are HOOKS for future API integration.
// ============================================================

/**
 * Prepare WhatsApp payload for an employee.
 * Uses PayrollEngine for contact and archive lookup.
 * @param {string} employeeCode
 * @param {string} [monthKey]
 * @returns {object}
 */
function prepareWhatsAppPayload(employeeCode, monthKey) {
    return PayrollEngine.prepareWhatsAppPayload(employeeCode, monthKey);
}

/**
 * HOOK ONLY — Generate employee PDF slip (no download, for future API).
 * @param {string} employeeCode
 * @param {string} [monthKey]
 * @returns {Promise<object>}
 */
function generateEmployeePDF(employeeCode, monthKey) {
    console.log(`[WhatsApp Prep] generateEmployeePDF HOOK: code=${employeeCode}, month=${monthKey}`);
    return PayrollEngine.sendSalarySlip(employeeCode, monthKey || PayrollEngine.getCurrentPayrollMonth());
}

/**
 * HOOK ONLY — Send employee salary slip via WhatsApp Business API.
 * @param {string} employeeCode
 * @param {string} [monthKey]
 * @returns {Promise<boolean>}
 */
function sendEmployeeWhatsApp(employeeCode, monthKey) {
    console.log(`[WhatsApp Prep] sendEmployeeWhatsApp HOOK: code=${employeeCode}`);
    return PayrollEngine.sendWhatsAppDocument(employeeCode, monthKey || PayrollEngine.getCurrentPayrollMonth())
        .then(result => {
            // Update contact status in registry (status tracking only)
            const contact = PayrollEngine.getContact(employeeCode);
            contact.lastSentMonth = monthKey || PayrollEngine.getCurrentPayrollMonth();
            contact.lastSentStatus = 'hook_triggered';
            PayrollEngine.saveContact(employeeCode, contact);

            // Also update legacy registry if available
            if (typeof ExcelParser !== 'undefined') {
                const registry = ExcelParser.getEmployeeRegistry();
                const entry = registry.find(r => String(r.EmployeeCode).trim() === String(employeeCode).trim());
                if (entry) {
                    entry.WhatsAppStatus = 'Prepared';
                    entry.LastSentDate = new Date().toISOString();
                    ExcelParser.saveEmployeeRegistry(registry);
                }
            }
            return true;
        });
}

/**
 * HOOK ONLY — Send salary slip via email.
 * @param {string} employeeCode
 * @param {string} emailAddress
 * @param {string} [monthKey]
 * @returns {Promise<object>}
 */
function sendEmailSalarySlip(employeeCode, emailAddress, monthKey) {
    console.log(`[WhatsApp Prep] sendEmailSalarySlip HOOK: code=${employeeCode}, email=${emailAddress}`);
    return PayrollEngine.sendEmailSalarySlip(employeeCode, monthKey || PayrollEngine.getCurrentPayrollMonth(), emailAddress);
}

/**
 * Get WhatsApp readiness status for all employees in current month.
 * @param {Array} employees
 * @returns {object} { ready: [], pending: [], noContact: [] }
 */
function getWhatsAppReadinessReport(employees) {
    const monthKey = PayrollEngine.getCurrentPayrollMonth();
    const ready = [];
    const pending = [];
    const noContact = [];

    employees.forEach(emp => {
        const code = emp.employeeId || '';
        if (!code) { noContact.push(emp); return; }

        const payload = PayrollEngine.prepareWhatsAppPayload(code, monthKey);
        if (payload.ready) {
            ready.push({ emp, payload });
        } else if (payload.whatsappNumber) {
            pending.push({ emp, payload, reason: payload.pendingPDF ? 'pdf_missing' : 'no_pdf' });
        } else {
            noContact.push(emp);
        }
    });

    return { ready, pending, noContact, monthKey };
}

// Expose globally
window.prepareWhatsAppPayload = prepareWhatsAppPayload;
window.generateEmployeePDF = generateEmployeePDF;
window.sendEmployeeWhatsApp = sendEmployeeWhatsApp;
window.sendEmailSalarySlip = sendEmailSalarySlip;
window.getWhatsAppReadinessReport = getWhatsAppReadinessReport;
