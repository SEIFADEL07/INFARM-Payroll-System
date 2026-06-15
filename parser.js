// parser.js — Excel parsing and merging utilities
// Restored and simplified parser implementation to replace truncated code.
// Exposes ExcelParser with parseFile and parseTwoFiles.

const ExcelParser = (function() {
    // Helper: read File as ArrayBuffer
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    // Helper: parse workbook buffer using SheetJS (XLSX)
    function parseWorkbook(buffer) {
        // XLSX is loaded from CDN in index.html
        return XLSX.read(buffer, { type: 'array' });
    }

    // Normalize header names to simple keys
    function normalizeKey(k) {
        if (!k && k !== 0) return '';
        const s = String(k).trim().toLowerCase();
        // remove diacritics/spaces and non-word
        return s.replace(/[^\w\u0600-\u06FF]+/g, '').toLowerCase();
    }

    // Map incoming row keys to expected employee fields
    function mapRowToEmployee(row) {
        const emp = {};
        Object.keys(row).forEach(origKey => {
            const v = row[origKey];
            const key = normalizeKey(origKey);

            // Common mappings (Arabic + English heuristics)
            if (/^(id|employeeid|empid|رقم|رقمالوظيفة|الرقمالوظيفي|الرقمالوظيفي|الرقم)$/i.test(key)) {
                emp.employeeId = v;
                return;
            }

            if (/^(name|fullname|employee|الاسم|اسم|اسمالموظف)$/i.test(key)) {
                emp.name = v;
                return;
            }

            if (/^(basic|basicsalary|salary|الاساسي|الراتبالاساسي|الراتبالأساسي)$/i.test(key)) {
                emp.basicSalary = v;
                return;
            }

            if (/^(allowance|allowances|benefits|البدلات|بدلات|البدل)$/i.test(key)) {
                emp.allowances = v;
                return;
            }

            if (/^(deduction|deductions|استقطاعات|خصم|خصومات|الخصومات)$/i.test(key)) {
                emp.deductions = v;
                return;
            }

            if (/^(social|gosi|socialsecurity|تأمينات|التأمينات|تأمين)$/i.test(key)) {
                emp.socialSecurity = v;
                return;
            }

            if (/^(tax|taxes|ضريبة|الضرائب)$/i.test(key)) {
                emp.taxes = v;
                return;
            }

            if (/^(overtime|overtimereq|العملالاضافي|العملالإضافي|العملالاضافيريال)$/i.test(key)) {
                emp.overtime = v;
                return;
            }

            if (/^(overtimeminutes|overtimemin|صدقيقة|ص_دقيقة|overtime_minutes|overtime_mins)$/i.test(key)) {
                emp.attendanceOvertimeMinutes = v;
                return;
            }

            if (/^(lateminutes|late_minutes|تأخر|تأخيرات|ح_دقيقة|حدقيقة)$/i.test(key)) {
                emp.attendanceLateMinutes = v;
                return;
            }

            if (/^(attendanceDeduction|attendanceDeductions|attendance_deductions|خصمحضور|خصم_حضور)$/i.test(key)) {
                emp.attendanceDeductions = v;
                return;
            }

            if (/^(net|netsalary|الصافي|صافي)$/i.test(key)) {
                emp.originalNetSalary = v;
                return;
            }

            if (/^(department|dept|القسم|الإدارة|ادارة|قسم)$/i.test(key)) {
                emp.department = v;
                return;
            }

            // Fallback: preserve other columns under rawRow
            if (!emp._rawRow) emp._rawRow = {};
            emp._rawRow[origKey] = v;
        });

        return emp;
    }

    // Convert sheet to normalized array of employee-like objects
    function sheetToEmployees(sheet) {
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const employees = raw.map(r => mapRowToEmployee(r));
        return employees;
    }

    // Merge adjustments into salaries by employeeId (fallback: by name)
    function mergeSalariesAndAdjustments(salaries, adjustments) {
        const mapById = new Map();

        function keyFor(e) {
            if (e.employeeId && String(e.employeeId).toString().trim() !== '') return String(e.employeeId).trim();
            if (e.name && String(e.name).toLowerCase().trim() !== '') return `name:${String(e.name).toLowerCase().trim()}`;
            return null;
        }

        // preload salaries
        salaries.forEach(s => {
            const k = keyFor(s) || `row_${Math.random().toString(36).slice(2,8)}`;
            mapById.set(k, Object.assign({}, s));
        });

        // apply adjustments
        adjustments.forEach(a => {
            const k = keyFor(a);
            if (k && mapById.has(k)) {
                const tgt = mapById.get(k);
                // merge adjustment fields into salary record without overwriting core salary fields
                // fields: overtime, attendanceOvertimeMinutes, attendanceLateMinutes, attendanceDeductions, deductions
                if (a.overtime) tgt.overtime = a.overtime;
                if (a.attendanceOvertimeMinutes) tgt.attendanceOvertimeMinutes = a.attendanceOvertimeMinutes;
                if (a.attendanceLateMinutes) tgt.attendanceLateMinutes = a.attendanceLateMinutes;
                if (a.attendanceDeductions) tgt.attendanceDeductions = a.attendanceDeductions;
                if (a.deductions) {
                    // if both exist, add adjustment deductions to existing deductions
                    const prev = typeof tgt.deductions === 'number' ? tgt.deductions : tgt.deductions || 0;
                    try { tgt.deductions = (parseFloat(prev) || 0) + (parseFloat(a.deductions) || 0); } catch (e) { tgt.deductions = a.deductions; }
                }
                tgt.adjRawRow = a._rawRow || a;
                mapById.set(k, tgt);
            } else {
                // no matching salary row: create an adjustments-only record
                const record = Object.assign({}, a);
                record.department = record.department || 'غير محدد (مؤثرات فقط)';
                record.adjRawRow = a._rawRow || a;
                const newKey = k || `adj_${Math.random().toString(36).slice(2,8)}`;
                mapById.set(newKey, record);
            }
        });

        // Convert map to array
        const merged = Array.from(mapById.values());
        return merged;
    }

    // Public API
    return {
        // Parse a single File -> Promise resolving { workbook, sheetNames, employeesBySheet }
        parseFile: async function(file) {
            if (!file) return Promise.reject(new Error('No file provided'));
            const buffer = await readFileAsArrayBuffer(file);
            const wb = parseWorkbook(buffer);
            const sheetNames = wb.SheetNames.slice();
            const employeesBySheet = {};
            sheetNames.forEach(name => {
                const sheet = wb.Sheets[name];
                employeesBySheet[name] = sheetToEmployees(sheet);
            });
            return { workbook: wb, sheetNames, employeesBySheet };
        },

        // Parse two files (salaries + adjustments) and merge them.
        // Returns Promise resolving an object { employees, salariesSheets, adjustmentsSheets, salariesRaw, adjustmentsRaw }
        parseTwoFiles: async function(salariesFile, adjustmentsFile) {
            if (!salariesFile && !adjustmentsFile) return Promise.reject(new Error('No files provided'));

            // parse files in parallel
            const [sRes, aRes] = await Promise.all([
                salariesFile ? this.parseFile(salariesFile).catch(err => ({ error: err })) : Promise.resolve(null),
                adjustmentsFile ? this.parseFile(adjustmentsFile).catch(err => ({ error: err })) : Promise.resolve(null)
            ]);

            if (sRes && sRes.error) return Promise.reject(sRes.error);
            if (aRes && aRes.error) return Promise.reject(aRes.error);

            // pick first sheet of each file as primary
            const salariesSheetName = sRes && sRes.sheetNames && sRes.sheetNames[0];
            const adjustmentsSheetName = aRes && aRes.sheetNames && aRes.sheetNames[0];

            const salariesRows = (sRes && salariesSheetName) ? sRes.employeesBySheet[salariesSheetName] : [];
            const adjustmentsRows = (aRes && adjustmentsSheetName) ? aRes.employeesBySheet[adjustmentsSheetName] : [];

            const merged = mergeSalariesAndAdjustments(salariesRows, adjustmentsRows);

            return {
                employees: merged,
                merged: merged,
                salariesSheets: { name: salariesSheetName, rows: salariesRows },
                adjustmentsSheets: { name: adjustmentsSheetName, rows: adjustmentsRows },
                salariesRaw: sRes ? sRes.workbook : null,
                adjustmentsRaw: aRes ? aRes.workbook : null
            };
        }
    };
})();

// Expose globally for legacy code expectations
if (typeof window !== 'undefined') window.ExcelParser = ExcelParser;
