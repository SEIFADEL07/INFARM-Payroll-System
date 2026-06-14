// Excel sheet parser using SheetJS (XLSX)
const ExcelParser = {
    // Standard field keys we need for our HR Calculations
    fields: {
        employeeId: { label: 'الرقم الوظيفي', synonyms: ['الرقم الوظيفي', 'رقم الموظف', 'كود الموظف', 'الكود', 'كود', 'رقم', 'id', 'emp id', 'employee id', 'code'] },
        name: { label: 'اسم الموظف', synonyms: ['الاسم', 'اسم الموظف', 'اسم', 'employee name', 'name', 'emp name', 'الموظف'] },
        department: { label: 'القسم', synonyms: ['القسم', 'الإدارة', 'الادارة', 'department', 'dept', 'قسم'] },
        basicSalary: {
            label: 'الراتب الأساسي', synonyms: [
                // Standard variants
                'الراتب الأساسي', 'الراتب الاساسي', 'الأساسي', 'الاساسي', 'راتب اساسي', 'الراتب',
                // Egyptian Arabic variants (المرتب)
                'المرتب الاساسى', 'المرتب الأساسي', 'المرتب الأساسى', 'المرتب الاساسي',
                'المرتب', 'مرتب اساسي', 'مرتب أساسي',
                // Ajr variants
                'الأجر الأساسي', 'الاجر الأساسي', 'الأجر الاساسى', 'الاجر الاساسى',
                'الأجر', 'الاجر',
                // Short forms
                'اساسي', 'أساسي',
                // English
                'basic salary', 'salary base', 'base salary', 'basic', 'salary'
            ]
        },
        allowances: { label: 'البدلات', synonyms: ['البدلات', 'إجمالي البدلات', 'بدلات', 'سكن', 'انتقال', 'بدل', 'allowances', 'allowance', 'total allowances', 'allow'] },
        deductions: { label: 'الاستقطاعات', synonyms: ['الاستقطاعات', 'الخصومات', 'خصومات', 'استقطاعات', 'غياب', 'جزاءات', 'deductions', 'deduction', 'total deductions', 'deduct'] },
        socialSecurity: { label: 'التأمينات الاجتماعية', synonyms: ['التأمينات', 'تأمينات اجتماعية', 'التأمينات الاجتماعية', 'تأمينات', 'التامينات', 'social security', 'gosi', 'ss', 'insurance'] },
        taxes: { label: 'الضرائب', synonyms: ['الضرائب', 'ضريبة', 'الضريبة', 'tax', 'taxes', 'taxation'] },
        netSalary: { label: 'صافي الراتب (في الملف)', synonyms: ['الصافي', 'صافي الراتب', 'صافي راتب', 'الراتب الصافي', 'إجمالي الصافي', 'net salary', 'net', 'net pay', 'total net'] },
        attendanceDeductions: { label: 'خصم حضور وغياب (ح/ الموظف)', synonyms: ['ح/ الموظف', 'ح/الموظف', 'حسم الموظف', 'غياب الموظف', 'خصم الموظف', 'حسم الحضور', 'خصم الغياب', 'حسم حضور وغياب', 'حضور وغياب'] },
        overtime: {
            label: 'العمل الإضافي (ص/ الموظف)', synonyms: [
                'ص/ الموظف', 'ص/الموظف', 'صرف الموظف', 'إضافي الموظف', 'العمل الإضافي',
                'الاضافي', 'اضافي', 'إضافي',
                // Variants with alef maqsura (اضافى)
                'اضافى ص', 'اضافى م', 'اضافى',
                'الاضافى', 'الإضافى',
                // Short form
                'صرف'
            ]
        }
    },

    // Read the Excel file and return an object with sheet names and their records
    parseWorkbook: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const result = {};

                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        // Convert sheet to json array including raw values
                        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                        if (json.length > 0) {
                            result[sheetName] = this.processRawSheet(json);
                        }
                    });

                    // Automatically check for Salaries ("المرتبات") and Adjustments ("المؤثرات") sheets
                    let salariesSheetName = null;
                    let adjustmentsSheetName = null;

                    workbook.SheetNames.forEach(name => {
                        const cleanName = name.trim();
                        if (cleanName === 'المرتبات' || cleanName.includes('المرتبات') || cleanName.includes('الرواتب') || cleanName.toLowerCase().includes('salary') || cleanName.toLowerCase().includes('payroll')) {
                            salariesSheetName = name;
                        }
                        if (cleanName === 'المؤثرات' || cleanName.includes('المؤثرات') || cleanName.includes('المتغيرات') || cleanName.toLowerCase().includes('adjustment') || cleanName.toLowerCase().includes('variable')) {
                            adjustmentsSheetName = name;
                        }
                    });

                    // Fallback to first/second sheets if exact names are missing but there are exactly 2 sheets
                    if (!salariesSheetName && !adjustmentsSheetName && workbook.SheetNames.length === 2) {
                        salariesSheetName = workbook.SheetNames[0];
                        adjustmentsSheetName = workbook.SheetNames[1];
                    }

                    if (salariesSheetName && adjustmentsSheetName) {
                        const salariesSheet = result[salariesSheetName];
                        const adjustmentsSheet = result[adjustmentsSheetName];

                        if (salariesSheet && adjustmentsSheet) {
                            // Detect and aggregate daily attendance sheets before merging
                            let adjSheetToMerge = adjustmentsSheet;
                            if (this.isAttendanceSheet(adjSheetToMerge)) {
                                console.log('[HR] parseWorkbook - كشف حضور يومي مكتشف → جاري التجميع...');
                                adjSheetToMerge = this.aggregateAttendanceSheet(adjSheetToMerge);
                                result[adjustmentsSheetName] = adjSheetToMerge;
                                console.log('[HR] parseWorkbook - عدد الموظفين بعد التجميع:', adjSheetToMerge.employees.length);
                            }
                            const mergedEmployees = this.mergeSalariesAndAdjustments(salariesSheet, adjSheetToMerge);
                            console.log('[HR] parseWorkbook - عدد الموظفين المدمجين:', mergedEmployees.length);
                            result['مسير الرواتب المدمج'] = {
                                headers: salariesSheet.headers,
                                mappings: salariesSheet.mappings,
                                employees: mergedEmployees,
                                isMerged: true,
                                salariesName: salariesSheetName,
                                adjustmentsName: adjustmentsSheetName
                            };
                        }
                    }

                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    },

    // Process a raw sheet (array of arrays)
    processRawSheet: function (rawRows) {
        // 1. Find the header row (typically the first row with several columns, or the row containing name/salary indicators)
        let headerRowIndex = 0;
        let maxScore = -1;

        // Check first 10 rows to find which one is likely the header row
        for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
            let score = 0;
            const cells = rawRows[r] || [];
            cells.forEach(cell => {
                if (cell) {
                    const str = String(cell).toLowerCase().trim();
                    // Check against synonyms
                    Object.values(this.fields).forEach(field => {
                        if (field.synonyms.some(syn => str.includes(syn))) {
                            score++;
                        }
                    });
                }
            });
            if (score > maxScore && cells.length > 2) {
                maxScore = score;
                headerRowIndex = r;
            }
        }

        const headers = (rawRows[headerRowIndex] || []).map(h => String(h || '').trim());
        const dataRows = rawRows.slice(headerRowIndex + 1);

        // 2. Perform automatic column detection
        const mappings = {};
        Object.keys(this.fields).forEach(fieldKey => {
            mappings[fieldKey] = this.findBestColumnMatch(fieldKey, headers);
        });

        // --- DEBUG: detailed column mapping diagnostics ---
        console.group(`[PARSER] ══ تخطيط الأعمدة ══ (صف الرأس: ${headerRowIndex})`);
        console.log('[PARSER] جميع أعمدة الورقة:', headers.map((h, i) => `[${i}] "${h}"`).join(' | '));
        console.log('[PARSER] أعمدة الورقة (normalized):', headers.map((h, i) => `[${i}] "${this._normalizeForMatch(h)}"`).join(' | '));
        console.log('---');
        // Log each field individually as requested
        const fieldsToLog = ['employeeId', 'name', 'department', 'basicSalary', 'insurance', 'deductions', 'allowances'];
        const fieldAliases = { insurance: 'socialSecurity' }; // insurance is displayed name for socialSecurity
        fieldsToLog.forEach(displayKey => {
            const actualKey = fieldAliases[displayKey] || displayKey;
            const colIdx = mappings[actualKey] !== undefined ? mappings[actualKey] : -1;
            const headerVal = (colIdx !== -1 && headers[colIdx]) ? headers[colIdx] : '(غير محدد)';
            console.log(`[PARSER] ${displayKey.padEnd(16)} → عمود ${String(colIdx).padStart(2)} = "${headerVal}"`);
        });
        console.log('---');
        // Full mapping dump for all fields
        Object.keys(mappings).forEach(key => {
            const colIdx = mappings[key];
            console.log(`[PARSER]   ${key} → عمود ${colIdx} = "${colIdx !== -1 ? headers[colIdx] : '(غير محدد)'}"`);
        });
        // Explicit basicSalary diagnostic
        console.log('[PARSER] basicSalary mapping index:', mappings.basicSalary);
        console.log('[PARSER] salary column header:', mappings.basicSalary !== -1 ? headers[mappings.basicSalary] : '⚠ NOT FOUND');
        if (mappings.basicSalary === -1) {
            console.warn('[PARSER] ⚠ عمود الراتب الأساسي لم يُكتشف تلقائياً! تحقق من أسماء أعمدة الملف.');
        }
        console.groupEnd();

        // Show UI warning if basicSalary column is not detected
        if (mappings.basicSalary === -1) {
            // Use a short setTimeout so the DOM is ready
            setTimeout(() => {
                if (window.App && typeof App.showToast === 'function') {
                    App.showToast('⚠ تحذير: عمود الراتب الأساسي (Basic Salary) لم يُكتشف في الملف — يرجى تعيين العمود يدوياً من إعدادات الأعمدة', 'warning');
                }
            }, 800);
        }

        // 3. Normalize employee records
        const employees = [];
        dataRows.forEach((row, index) => {
            // Skip empty rows or rows where the employee name field is empty
            const nameCol = mappings['name'];
            if (nameCol === -1 || !row[nameCol]) return;

            const emp = {
                id: index + 1,
                rowNumber: headerRowIndex + index + 2, // Excel spreadsheet line counter
                employeeId: mappings['employeeId'] !== -1 && row[mappings['employeeId']] ? String(row[mappings['employeeId']]).trim() : '',
                name: String(row[nameCol]).trim(),
                department: mappings['department'] !== -1 && row[mappings['department']] ? String(row[mappings['department']]).trim() : 'غير محدد',
                basicSalary: this.parseNumeric(row[mappings['basicSalary']]),
                allowances: this.parseNumeric(row[mappings['allowances']]),
                deductions: this.parseNumeric(row[mappings['deductions']]),
                socialSecurity: this.parseNumeric(row[mappings['socialSecurity']]),
                taxes: this.parseNumeric(row[mappings['taxes']]),
                attendanceDeductions: mappings['attendanceDeductions'] !== -1 ? this.parseAttendanceValue(row[mappings['attendanceDeductions']], 'ح/الموظف', index) : 0,
                overtime: mappings['overtime'] !== -1 ? this.parseAttendanceValue(row[mappings['overtime']], 'ص/الموظف', index) : 0,
                originalNetSalary: mappings['netSalary'] !== -1 ? this.parseNumeric(row[mappings['netSalary']]) : null,
                // Keep the raw values for custom usage / re-exports
                rawRow: row
            };

            employees.push(emp);
        });

        // --- DEBUG: print first parsed employee to verify field mapping ---
        if (employees.length > 0) {
            const first = employees[0];
            console.group('[PARSER] أول موظف بعد التحليل (للتحقق من الحقول)');
            console.log('  الاسم           :', first.name);
            console.log('  الرقم الوظيفي   :', first.employeeId);
            console.log('  القسم           :', first.department);
            console.log('  الراتب الأساسي  :', first.basicSalary);
            console.log('  التأمينات       :', first.socialSecurity);
            console.log('  الاستقطاعات     :', first.deductions);
            console.log('  البدلات         :', first.allowances);
            console.log('  العمل الإضافي   :', first.overtime);
            console.log('  خصم الحضور      :', first.attendanceDeductions);
            console.groupEnd();
        }

        return {
            headers: headers,
            mappings: mappings,
            employees: employees
        };
    },

    // Dynamic synonym search helper — returns column index, or -1 if not found
    findBestColumnMatch: function (fieldKey, headers) {
        const fieldInfo = this.fields[fieldKey];
        let bestIndex = -1;
        let bestScore = Infinity; // lower = better (exact match = synonym index, partial = index + 100)

        headers.forEach((header, colIdx) => {
            // Normalize both header and synonym: lowercase + strip Arabic diacritics + unify alef forms + ta-marbuta
            const normHeader = this._normalizeForMatch(header);
            if (!normHeader) return;

            fieldInfo.synonyms.forEach((synonym, synIdx) => {
                const normSyn = this._normalizeForMatch(synonym);
                if (!normSyn) return;

                if (normHeader === normSyn) {
                    // Exact match: score = synonym position (lower synonym index = higher priority)
                    const score = synIdx;
                    if (score < bestScore) {
                        bestScore = score;
                        bestIndex = colIdx;
                    }
                } else if (normHeader.includes(normSyn) || normSyn.includes(normHeader)) {
                    // Partial match: penalise by 100 so any exact match always wins
                    const score = synIdx + 100;
                    if (score < bestScore) {
                        bestScore = score;
                        bestIndex = colIdx;
                    }
                }
            });
        });

        return bestIndex;
    },

    // Normalize a string for fuzzy Arabic column matching:
    // - lowercase
    // - unify alef forms (أ إ آ ا → ا)
    // - unify ya/alef-maqsura (ى → ي)
    // - unify ta-marbuta (ة → ه)
    // - strip all Arabic diacritics (tashkeel)
    // - collapse whitespace
    _normalizeForMatch: function (str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')  // strip tashkeel/diacritics
            .replace(/[أإآا]/g, 'ا')                 // unify alef
            .replace(/ى/g, 'ي')                       // alef maqsura → ya
            .replace(/ة/g, 'ه')                       // ta marbuta → ha
            .replace(/[\s\t]+/g, ' ')                 // collapse whitespace
            .trim();
    },

    // Helper to normalize Arabic names for comparison
    normalizeArabicName: function (name) {
        if (!name) return '';
        return String(name)
            .trim()
            .toLowerCase()
            .replace(/[\s\t\n\r]+/g, ' ')
            .replace(/[أإآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[ًٌٍَُِّْ]/g, '');
    },

    // Detect whether a parsed sheet looks like a daily attendance sheet
    // (i.e. the same employee name/ID appears more than once)
    isAttendanceSheet: function (sheetData) {
        const employees = sheetData.employees;
        if (!employees || employees.length === 0) return false;

        // Count unique names/IDs
        const idSet = new Set();
        const nameSet = new Set();
        let idDupes = 0;
        let nameDupes = 0;

        employees.forEach(emp => {
            const idKey = emp.employeeId ? String(emp.employeeId).trim() : '';
            const nameKey = this.normalizeArabicName(emp.name);

            if (idKey) {
                if (idSet.has(idKey)) idDupes++;
                idSet.add(idKey);
            }
            if (nameKey) {
                if (nameSet.has(nameKey)) nameDupes++;
                nameSet.add(nameKey);
            }
        });

        // Consider it an attendance sheet when duplicates exceed 20 % of rows
        const threshold = Math.max(1, Math.floor(employees.length * 0.2));
        const isDuplicate = idDupes >= threshold || nameDupes >= threshold;

        console.log(
            `[PARSER] isAttendanceSheet → صفوف: ${employees.length}` +
            ` | تكرار الرقم: ${idDupes} | تكرار الاسم: ${nameDupes}` +
            ` | نتيجة: ${isDuplicate ? 'كشف حضور ✓' : 'مؤثرات عادية'}`
        );
        return isDuplicate;
    },

    // Aggregate a daily-attendance sheet into one record per employee.
    // ح/ الموظف → attendanceLateMinutes   (clock-in time  = arrival minutes — time metric only)
    // ص/ الموظف → attendanceOvertimeMinutes (clock-out time = departure minutes — time metric only)
    // The monetary fields overtime/attendanceDeductions are intentionally set to 0 here;
    // conversion to SAR happens in calculator.js only when explicit per-minute rates are configured.
    aggregateAttendanceSheet: function (sheetData) {
        const employees = sheetData.employees;
        const rawRowCount = employees.length;

        console.log(`[PARSER] aggregateAttendanceSheet → عدد صفوف الحضور المكتشفة: ${rawRowCount}`);

        // Map: normalizedKey → aggregated record
        const empMap = new Map();
        // Keep insertion order for stable output
        const empOrder = [];

        employees.forEach(emp => {
            // Build a stable key: prefer employee ID, fall back to normalised name
            const idKey = emp.employeeId ? String(emp.employeeId).trim() : '';
            const nameKey = this.normalizeArabicName(emp.name);
            const key = idKey || nameKey;
            if (!key) return;

            if (!empMap.has(key)) {
                empMap.set(key, {
                    id: emp.id,
                    employeeId: emp.employeeId || '',
                    rowNumber: emp.rowNumber,
                    name: emp.name,
                    department: emp.department,
                    // Attendance sheets rarely carry salary data — keep as 0
                    basicSalary: emp.basicSalary || 0,
                    allowances: emp.allowances || 0,
                    deductions: emp.deductions || 0,
                    socialSecurity: emp.socialSecurity || 0,
                    taxes: emp.taxes || 0,
                    // TIME metrics (minutes) — accumulated across daily rows
                    attendanceLateMinutes: 0,      // ح/ الموظف  — total arrival clock minutes
                    attendanceOvertimeMinutes: 0,  // ص/ الموظف  — total departure clock minutes
                    // Monetary fields — ALWAYS 0 from attendance; set by calculator if rules exist
                    attendanceDeductions: 0,
                    overtime: 0,
                    originalNetSalary: emp.originalNetSalary,
                    rawRow: emp.rawRow
                });
                empOrder.push(key);
            }

            const agg = empMap.get(key);
            // emp.attendanceDeductions holds parsed minutes from ح/ الموظف
            // emp.overtime holds parsed minutes from ص/ الموظف
            const prevLate = agg.attendanceLateMinutes;
            const prevOT   = agg.attendanceOvertimeMinutes;
            agg.attendanceLateMinutes     += (emp.attendanceDeductions || 0);
            agg.attendanceOvertimeMinutes += (emp.overtime || 0);

            // DEBUG: log every accumulation step (cap at first 5 unique employees)
            if (empOrder.indexOf(key) < 5) {
                console.log(
                    `[AGG] ${emp.name}` +
                    ` | ح/الموظف(دقائق): ${prevLate} + ${emp.attendanceDeductions} = ${agg.attendanceLateMinutes}` +
                    ` | ص/الموظف(دقائق): ${prevOT} + ${emp.overtime} = ${agg.attendanceOvertimeMinutes}`
                );
            }
        });

        const aggregated = empOrder.map((key, idx) => {
            const rec = empMap.get(key);
            rec.id = idx + 1; // Re-assign sequential IDs
            return rec;
        });

        console.log(`[PARSER] aggregateAttendanceSheet → عدد الموظفين بعد التجميع: ${aggregated.length}`);
        // Summary: log final time metrics for all employees
        console.group('[AGG] ملخص دقائق الحضور المجمّعة (وحدة: دقيقة — ليست ريال)');
        aggregated.forEach(rec => {
            console.log(
                `  ${rec.name}:` +
                ` ح(دقيقة)=${rec.attendanceLateMinutes}` +
                ` | ص(دقيقة)=${rec.attendanceOvertimeMinutes}` +
                ` | overtime_SAR=${rec.overtime}` +
                ` | attendanceDed_SAR=${rec.attendanceDeductions}`
            );
        });
        console.groupEnd();

        return {
            headers: sheetData.headers,
            mappings: sheetData.mappings,
            employees: aggregated
        };
    },

    // Merge logic combining Salaries and Adjustments
    mergeSalariesAndAdjustments: function (salariesSheet, adjustmentsSheet) {
        const salariesEmps = salariesSheet.employees;
        const adjustmentsEmps = adjustmentsSheet.employees;

        const salariesById = {};
        const salariesByName = {};

        salariesEmps.forEach(emp => {
            const empIdVal = emp.employeeId ? String(emp.employeeId).trim() : '';
            if (empIdVal) {
                salariesById[empIdVal] = emp;
            }
            const normName = this.normalizeArabicName(emp.name);
            if (normName) {
                salariesByName[normName] = emp;
            }
        });

        const mergedEmployees = [];
        const matchedSalaries = new Set();

        adjustmentsEmps.forEach((adjEmp, index) => {
            let matchedEmp = null;

            // Match by employee ID first
            const adjIdVal = adjEmp.employeeId ? String(adjEmp.employeeId).trim() : '';
            if (adjIdVal && salariesById[adjIdVal]) {
                matchedEmp = salariesById[adjIdVal];
            }

            // Match by name second if ID is missing or not matched
            if (!matchedEmp) {
                const normName = this.normalizeArabicName(adjEmp.name);
                if (normName && salariesByName[normName]) {
                    matchedEmp = salariesByName[normName];
                }
            }

            if (matchedEmp) {
                matchedSalaries.add(matchedEmp.id);
                mergedEmployees.push({
                    id: matchedEmp.id,
                    employeeId: matchedEmp.employeeId || adjEmp.employeeId || '',
                    rowNumber: matchedEmp.rowNumber,
                    name: matchedEmp.name,
                    department: matchedEmp.department,
                    basicSalary: matchedEmp.basicSalary,
                    allowances: matchedEmp.allowances,
                    deductions: matchedEmp.deductions,
                    socialSecurity: matchedEmp.socialSecurity,
                    taxes: matchedEmp.taxes,

                    // Add variables from adjustments
                    attendanceDeductions: adjEmp.attendanceDeductions || 0,
                    overtime: adjEmp.overtime || 0,

                    originalNetSalary: matchedEmp.originalNetSalary,
                    rawRow: matchedEmp.rawRow,
                    adjRawRow: adjEmp.rawRow
                });
            } else {
                // Unmatched employee in adjustments: do NOT ignore!
                mergedEmployees.push({
                    id: 'adj_' + (index + 1),
                    employeeId: adjEmp.employeeId || '',
                    rowNumber: adjEmp.rowNumber,
                    name: adjEmp.name,
                    department: 'غير محدد (مؤثرات فقط)',
                    basicSalary: 0,
                    allowances: 0,
                    deductions: 0,
                    socialSecurity: 0,
                    taxes: 0,

                    // Add variables from adjustments
                    attendanceDeductions: adjEmp.attendanceDeductions || 0,
                    overtime: adjEmp.overtime || 0,

                    originalNetSalary: null,
                    rawRow: adjEmp.rawRow,
                    adjRawRow: adjEmp.rawRow
                });
            }
        });

        // Add remaining employees from salaries who didn't have adjustments
        salariesEmps.forEach(salEmp => {
            if (!matchedSalaries.has(salEmp.id)) {
                mergedEmployees.push({
                    id: salEmp.id,
                    employeeId: salEmp.employeeId || '',
                    rowNumber: salEmp.rowNumber,
                    name: salEmp.name,
                    department: salEmp.department,
                    basicSalary: salEmp.basicSalary,
                    allowances: salEmp.allowances,
                    deductions: salEmp.deductions,
                    socialSecurity: salEmp.socialSecurity,
                    taxes: salEmp.taxes,

                    // No adjustments
                    attendanceDeductions: 0,
                    overtime: 0,

                    originalNetSalary: salEmp.originalNetSalary,
                    rawRow: salEmp.rawRow,
                    adjRawRow: null
                });
            }
        });

        return mergedEmployees;
    },

    // Convert raw cells into number formats safely — handles Arabic-Indic digits, commas, currency text
    parseNumeric: function (val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let str = String(val);
        // Convert Arabic-Indic digits (\u0660-\u0669) to Western digits
        str = str.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660);
        // Remove thousands separators and any non-numeric characters except dot and minus
        str = str.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
        if (!str) return 0;
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    },

    // Parse an attendance cell (overtime / attendance-deduction) with unit detection.
    // Attendance columns can contain:
    //   a) Excel time serial  (0 < val < 1)  e.g. 0.020833 = 00:30  → convert to minutes
    //   b) HH:MM string       e.g. "1:30"                           → convert to minutes
    //   c) Plain minutes      e.g. 45, 120                          → use as-is
    //   d) Currency / money   e.g. 250.00                           → use as-is (money column)
    // Strategy: if the raw numeric value is strictly between 0 and 1 it MUST be a time serial.
    // If it is an integer-looking value we assume it is already in the correct unit (minutes or money)
    // and pass it through unchanged.
    parseAttendanceValue: function (val, fieldLabel, rowIndex) {
        // --- Log the raw Excel value so the developer can see what arrives ---
        const MAX_RAW_LOG_ROWS = 10; // only log the first N rows to avoid console flooding
        const shouldLog = (rowIndex === undefined || rowIndex < MAX_RAW_LOG_ROWS);

        if (val === undefined || val === null || val === '') {
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw=<empty> → 0`);
            return 0;
        }

        // If SheetJS already gave us a number (most common case)
        if (typeof val === 'number') {
            if (isNaN(val)) {
                if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw=${val} → NaN → 0`);
                return 0;
            }

            // Excel time serial: a fraction between 0 and 1
            // e.g. 00:30 is stored as 0.020833…, 01:15 as 0.052083…
            if (val > 0 && val < 1) {
                const minutes = Math.round(val * 24 * 60);
                if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw=${val} → TYPE=Excel_time_serial → ${minutes} minutes`);
                return minutes;
            }

            // Plain number (minutes or money) — pass through
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw=${val} → TYPE=plain_number → ${val}`);
            return val;
        }

        // String value — may be "HH:MM" or a numeric string
        let str = String(val).trim();

        // Convert Arabic-Indic digits
        str = str.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660);

        // Detect "HH:MM" or "H:MM" time format (e.g. "1:30", "01:30")
        const timeMatch = str.match(/^(\d{1,3}):(\d{2})$/);
        if (timeMatch) {
            const minutes = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw="${val}" → TYPE=HH:MM_string → ${minutes} minutes`);
            return minutes;
        }

        // Plain numeric string
        str = str.replace(/,/g, '').replace(/[^\d.-]/g, '');
        if (!str) {
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw="${val}" → non-numeric → 0`);
            return 0;
        }
        const num = parseFloat(str);
        if (isNaN(num)) {
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw="${val}" → parseFloat=NaN → 0`);
            return 0;
        }

        // Same serial-fraction check for strings that somehow came through as "0.02083"
        if (num > 0 && num < 1) {
            const minutes = Math.round(num * 24 * 60);
            if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw="${val}" → TYPE=serial_fraction_string → ${minutes} minutes`);
            return minutes;
        }

        if (shouldLog) console.log(`[ATT] row${rowIndex ?? '?'} ${fieldLabel}: raw="${val}" → TYPE=plain_string → ${num}`);
        return num;
    },

    // Parse a single Excel file and return its first non-empty sheet data
    parseWorkbookFromFile: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetResult = {};

                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        if (json.length > 0) {
                            sheetResult[sheetName] = this.processRawSheet(json);
                        }
                    });

                    resolve({
                        fileName: file.name,
                        sheets: sheetResult,
                        sheetNames: Object.keys(sheetResult)
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    },

    // Parse two separate files (salaries + adjustments) and merge them
    parseTwoFiles: function (salariesFile, adjustmentsFile) {
        const salariesPromise = this.parseWorkbookFromFile(salariesFile);
        // adjustmentsFile is optional
        const adjustmentsPromise = adjustmentsFile
            ? this.parseWorkbookFromFile(adjustmentsFile)
            : Promise.resolve(null);

        return Promise.all([salariesPromise, adjustmentsPromise]).then(([salariesWb, adjustmentsWb]) => {
            const result = {};

            // Merge all individual sheets into result
            if (salariesWb) {
                Object.assign(result, salariesWb.sheets);
            }
            if (adjustmentsWb) {
                Object.assign(result, adjustmentsWb.sheets);
            }

            // Pick the primary salaries sheet (first sheet from salaries workbook)
            let salariesSheetData = null;
            let salariesSheetName = '';
            if (salariesWb && salariesWb.sheetNames.length > 0) {
                salariesSheetName = salariesWb.sheetNames[0];
                salariesSheetData = salariesWb.sheets[salariesSheetName];
            }

            // Pick the primary adjustments sheet (first sheet from adjustments workbook)
            let adjustmentsSheetData = null;
            let adjustmentsSheetName = '';
            if (adjustmentsWb && adjustmentsWb.sheetNames.length > 0) {
                adjustmentsSheetName = adjustmentsWb.sheetNames[0];
                adjustmentsSheetData = adjustmentsWb.sheets[adjustmentsSheetName];
            }

            console.log('[HR] parseTwoFiles - ورقة المرتبات:', salariesSheetName, '| موظفون:', salariesSheetData ? salariesSheetData.employees.length : 0);
            console.log('[HR] parseTwoFiles - ورقة المؤثرات:', adjustmentsSheetName, '| موظفون (قبل التجميع):', adjustmentsSheetData ? adjustmentsSheetData.employees.length : 0);

            // Detect and aggregate daily attendance sheets before merging
            if (adjustmentsSheetData && this.isAttendanceSheet(adjustmentsSheetData)) {
                console.log('[HR] parseTwoFiles - كشف حضور يومي مكتشف → جاري التجميع...');
                adjustmentsSheetData = this.aggregateAttendanceSheet(adjustmentsSheetData);
                // Update the stored sheet in result so the tab also shows aggregated data
                if (adjustmentsSheetName) result[adjustmentsSheetName] = adjustmentsSheetData;
                console.log('[HR] parseTwoFiles - عدد الموظفين بعد التجميع:', adjustmentsSheetData.employees.length);
            }

            // Build merged dataset
            if (salariesSheetData && adjustmentsSheetData) {
                const mergedEmployees = this.mergeSalariesAndAdjustments(salariesSheetData, adjustmentsSheetData);
                result['مسير الرواتب المدمج'] = {
                    headers: salariesSheetData.headers,
                    mappings: salariesSheetData.mappings,
                    employees: mergedEmployees,
                    isMerged: true,
                    salariesName: salariesSheetName,
                    adjustmentsName: adjustmentsSheetName
                };
                console.log('[HR] parseTwoFiles - عدد الموظفين المدمجين:', mergedEmployees.length);
            } else if (salariesSheetData) {
                // Only salaries file provided
                result['مسير الرواتب المدمج'] = {
                    ...salariesSheetData,
                    isMerged: false,
                    salariesName: salariesSheetName,
                    adjustmentsName: ''
                };
                console.log('[HR] parseTwoFiles - ملف المؤثرات غير متاح، تم استخدام المرتبات فقط');
            }

            return result;
        });
    }
};
