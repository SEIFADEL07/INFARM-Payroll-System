// Salary calculations and data validation engine
const SalaryCalculator = {
    // Default system rules/settings
    defaultRules: {
        calculateGOSI: false,           // If true, calculate social security as a % of basic instead of using sheet values
        gosiRate: 9,                    // % GOSI deduction rate for employee
        calculateTax: false,            // If true, calculate tax as a % of basic instead of using sheet values
        taxRate: 5,                     // % tax rate
        allowanceMultiplier: 1.0,       // multiplier for allowances (e.g. for temporary bonus override)
        deductionMultiplier: 1.0,       // multiplier for deductions
        // Attendance time-to-money conversion rules
        // Default 0 = disabled. Attendance minutes are NEVER used as money unless a positive rate is set.
        overtimePerMinute: 0,           // SAR per minute of overtime (ص/ الموظف)
        lateDeductionPerMinute: 0       // SAR per minute of lateness/early-leave (ح/ الموظف)
    },

    // Safe numeric coercion: handles Arabic-Indic digits, comma-separated thousands, currency suffixes
    safeNum: function(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let str = String(val);
        // Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits
        str = str.replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660);
        // Remove thousands separators and currency text
        str = str.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    },

    // Compute net salary and perform audit validations for a single employee
    calculateEmployeeSalary: function(emp, rules) {
        const activeRules = { ...this.defaultRules, ...rules };

        // 1. Ensure all fields are proper numbers (guard against restored-from-localStorage strings)
        const basic              = this.safeNum(emp.basicSalary);
        const rawAllowances      = this.safeNum(emp.allowances);
        const rawDeductions      = this.safeNum(emp.deductions);
        const rawSocialSecurity  = this.safeNum(emp.socialSecurity);
        const rawTaxes           = this.safeNum(emp.taxes);

        // 2. Attendance TIME metrics (minutes) — never used directly as money
        const overtimeMinutes    = this.safeNum(emp.attendanceOvertimeMinutes);  // ص/ الموظف
        const lateMinutes        = this.safeNum(emp.attendanceLateMinutes);      // ح/ الموظف

        // 3. Convert minutes → SAR only when a positive rate rule is configured
        //    If rate = 0 (default), the monetary value is ALWAYS 0.
        const overtimeSAR        = activeRules.overtimePerMinute > 0
            ? overtimeMinutes * activeRules.overtimePerMinute
            : this.safeNum(emp.overtime);           // fallback: use explicit monetary value from payroll file
        const lateDeductionSAR   = activeRules.lateDeductionPerMinute > 0
            ? lateMinutes * activeRules.lateDeductionPerMinute
            : this.safeNum(emp.attendanceDeductions); // fallback: use explicit monetary value from payroll file

        // 4. Apply multipliers
        const allowances = rawAllowances * activeRules.allowanceMultiplier;

        // 5. GOSI / Social Security
        let socialSecurity = rawSocialSecurity;
        if (activeRules.calculateGOSI) {
            socialSecurity = basic * (activeRules.gosiRate / 100);
        }

        // 6. Tax
        let taxes = rawTaxes;
        if (activeRules.calculateTax) {
            taxes = basic * (activeRules.taxRate / 100);
        }

        // 7. Apply deduction multiplier only to the "other deductions" field
        const masterDeductions = rawDeductions * activeRules.deductionMultiplier;

        // 8. Total deductions
        const totalDeductions = masterDeductions + lateDeductionSAR + socialSecurity + taxes;

        // 9. Gross Salary = basic + allowances + overtimeSAR
        const grossSalary = basic + allowances + overtimeSAR;

        // 10. Net Salary
        const calculatedNet = Math.max(0, grossSalary - totalDeductions);

        // --- PER-EMPLOYEE DEBUG LOG ---
        console.log(
            `[CALC] ${emp.name || '(بدون اسم)'} |` +
            ` أساسي=${basic} | بدلات=${rawAllowances} |` +
            ` [حضور] ح_دقيقة=${lateMinutes} | ص_دقيقة=${overtimeMinutes} |` +
            ` [SAR]  إضافي_ريال=${overtimeSAR.toFixed(2)} | خصم_حضور_ريال=${lateDeductionSAR.toFixed(2)} |` +
            ` خصومات_أخرى=${rawDeductions} | تأمينات=${socialSecurity.toFixed(2)} | ضرائب=${taxes.toFixed(2)} |` +
            ` إجمالي=${grossSalary.toFixed(2)} | صافي=${calculatedNet.toFixed(2)} |` +
            ` نوع=${emp.department === 'غير محدد (مؤثرات فقط)' ? 'مؤثرات_فقط' : (emp.adjRawRow ? 'مدمج' : 'مرتبات_فقط')}`
        );

        // 9. Validations
        const alerts = [];
        let status = 'valid';

        if (grossSalary < totalDeductions) {
            status = 'error';
            alerts.push({ type: 'error', message: 'الاستقطاعات والضرائب تتجاوز إجمالي الراتب المستحق (الصافي سالب)' });
        }

        if (basic <= 0 && emp.department !== 'غير محدد (مؤثرات فقط)') {
            status = 'error';
            alerts.push({ type: 'error', message: 'الراتب الأساسي يساوي صفر أو أقل من الصفر' });
        }

        if (rawDeductions > (basic * 0.5) && basic > 0) {
            if (status !== 'error') status = 'warning';
            alerts.push({
                type: 'warning',
                message: `الخصومات مرتفعة جداً وتتجاوز 50% من الراتب الأساسي (${((rawDeductions / basic) * 100).toFixed(0)}%)`
            });
        }

        const origNet = this.safeNum(emp.originalNetSalary === null || emp.originalNetSalary === undefined ? null : emp.originalNetSalary);
        if (emp.originalNetSalary !== null && emp.originalNetSalary !== undefined && origNet > 0) {
            const difference = Math.abs(calculatedNet - origNet);
            if (difference > 1.0) {
                if (status !== 'error') status = 'warning';
                alerts.push({
                    type: 'warning',
                    message: `اختلاف في صافي الراتب! المحسوب: ${calculatedNet.toFixed(2)}، المسجل بالملف: ${origNet.toFixed(2)} (فرق: ${difference.toFixed(2)})`
                });
            }
        }

        return {
            ...emp,
            // Normalised numeric fields (fixes issues when restored from localStorage as strings)
            basicSalary:               basic,
            allowances:                rawAllowances,
            // Attendance time metrics (minutes) — preserved for display/export
            attendanceOvertimeMinutes: overtimeMinutes,
            attendanceLateMinutes:     lateMinutes,
            // Monetary payroll fields
            overtime:                  overtimeSAR,
            attendanceDeductions:      lateDeductionSAR,
            deductions:                rawDeductions,
            socialSecurity:            rawSocialSecurity,
            taxes:                     rawTaxes,
            // Calculated results
            calculatedNet:             calculatedNet,
            grossSalary:               grossSalary,
            calculatedSocialSecurity:  socialSecurity,
            calculatedTaxes:           taxes,
            calculatedDeductions:      totalDeductions,
            validationStatus:          status,
            validationAlerts:          alerts
        };
    },

    // Run calculations on the entire dataset and aggregate totals
    processPayrollSheet: function(employees, rules) {
        let totalBasic = 0;
        let totalAllowances = 0;
        let totalOvertime = 0;
        let totalAttendanceDeductions = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        let errorCount = 0;
        let warningCount = 0;

        console.log(`[CALC] === بدء حساب رواتب ${employees.length} موظف ===`);

        const processed = employees.map(emp => {
            const calculated = this.calculateEmployeeSalary(emp, rules);

            totalBasic       += calculated.basicSalary;
            totalAllowances  += calculated.allowances;
            totalOvertime    += calculated.overtime || 0;
            totalAttendanceDeductions += calculated.attendanceDeductions || 0;
            totalDeductions  += calculated.calculatedDeductions;
            totalNet         += calculated.calculatedNet;

            if (calculated.validationStatus === 'error')   errorCount++;
            if (calculated.validationStatus === 'warning') warningCount++;

            return calculated;
        });

        console.log(`[CALC] === النتائج الإجمالية ===`);
        console.log(`[CALC] إجمالي الموظفين: ${processed.length}`);
        console.log(`[CALC] إجمالي الرواتب الأساسية: ${totalBasic.toFixed(2)}`);
        console.log(`[CALC] إجمالي صافي الرواتب: ${totalNet.toFixed(2)}`);
        console.log(`[CALC] متوسط صافي الراتب: ${processed.length > 0 ? (totalNet / processed.length).toFixed(2) : 0}`);
        console.log(`[CALC] أخطاء: ${errorCount} | تحذيرات: ${warningCount}`);

        // Generate and log validation report
        this.generateValidationReport(processed);

        return {
            employees: processed,
            totals: {
                count: processed.length,
                basic: totalBasic,
                allowances: totalAllowances,
                overtime: totalOvertime,
                attendanceDeductions: totalAttendanceDeductions,
                deductions: totalDeductions,
                net: totalNet,
                errors: errorCount,
                warnings: warningCount
            }
        };
    },

    // Generate a validation report grouped by issue type
    generateValidationReport: function(employees) {
        const zeroSalary         = [];  // basicSalary = 0 AND not adjustments-only
        const missingFields      = [];  // key numeric fields are all zero
        const adjustmentsOnly    = [];  // came from المؤثرات only (no match in المرتبات)
        const salariesOnly       = [];  // came from المرتبات only (no match in المؤثرات)
        const unmatchedLowNet    = [];  // calculatedNet suspiciously low (< 200 SAR) for non-zero-basic

        employees.forEach(emp => {
            const isAdjOnly = emp.department === 'غير محدد (مؤثرات فقط)';
            const hasMerged = !!(emp.adjRawRow);

            if (isAdjOnly) {
                adjustmentsOnly.push(emp.name);
                return;
            }

            if (!hasMerged) {
                salariesOnly.push(emp.name);
            }

            if (emp.basicSalary <= 0) {
                zeroSalary.push({ name: emp.name, id: emp.employeeId });
            }

            const allFieldsZero = emp.basicSalary === 0 && emp.allowances === 0 &&
                                  emp.deductions === 0 && emp.socialSecurity === 0;
            if (allFieldsZero) {
                missingFields.push({ name: emp.name, id: emp.employeeId });
            }

            if (emp.basicSalary > 0 && emp.calculatedNet < 200) {
                unmatchedLowNet.push({
                    name: emp.name,
                    id: emp.employeeId,
                    basic: emp.basicSalary,
                    net: emp.calculatedNet
                });
            }
        });

        console.groupCollapsed('[VALIDATION] تقرير التحقق من صحة البيانات');

        console.group(`[VALIDATION] موظفون بدون راتب أساسي (${zeroSalary.length})`);
        if (zeroSalary.length > 0) {
            zeroSalary.forEach(e => console.warn(`  ❌ ${e.name} (${e.id || 'بدون رقم'})`));
        } else {
            console.log('  ✅ لا يوجد');
        }
        console.groupEnd();

        console.group(`[VALIDATION] موظفون بحقول مالية فارغة بالكامل (${missingFields.length})`);
        if (missingFields.length > 0) {
            missingFields.forEach(e => console.warn(`  ⚠️ ${e.name} (${e.id || 'بدون رقم'})`));
        } else {
            console.log('  ✅ لا يوجد');
        }
        console.groupEnd();

        console.group(`[VALIDATION] موظفون من ملف المؤثرات فقط (غير مطابق مع المرتبات) (${adjustmentsOnly.length})`);
        if (adjustmentsOnly.length > 0) {
            adjustmentsOnly.forEach(n => console.warn(`  ℹ️ ${n}`));
        } else {
            console.log('  ✅ لا يوجد');
        }
        console.groupEnd();

        console.group(`[VALIDATION] موظفون من ملف المرتبات فقط (لا يوجد لهم في المؤثرات) (${salariesOnly.length})`);
        if (salariesOnly.length > 0) {
            salariesOnly.forEach(n => console.log(`  ℹ️ ${n}`));
        } else {
            console.log('  ✅ الكل مطابق');
        }
        console.groupEnd();

        console.group(`[VALIDATION] موظفون براتب أساسي موجود لكن صافي منخفض جداً (<200 SAR) (${unmatchedLowNet.length})`);
        if (unmatchedLowNet.length > 0) {
            unmatchedLowNet.forEach(e => console.error(
                `  🚨 ${e.name} | أساسي=${e.basic} | صافي=${e.net} — يحتمل خطأ في قراءة الأعمدة`
            ));
        } else {
            console.log('  ✅ لا يوجد');
        }
        console.groupEnd();

        console.groupEnd(); // close [VALIDATION] group
        console.log(`[VALIDATION] ملخص: صفر_راتب=${zeroSalary.length} | حقول_مفقودة=${missingFields.length} | مؤثرات_فقط=${adjustmentsOnly.length} | مرتبات_فقط=${salariesOnly.length} | صافي_منخفض=${unmatchedLowNet.length}`);
    }
};
