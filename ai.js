// Intelligent AI Assistant for payroll data analysis
const AIAssistant = {
    // Basic local query parser for offline usage
    processOfflineQuery: function(query, employees) {
        if (!employees || employees.length === 0) {
            return {
                text: 'لم يتم تحميل أي بيانات رواتب بعد. يرجى رفع ملف Excel أولاً لتفعيل المساعد الذكي.',
                isHtml: false
            };
        }

        const cleanQuery = query.toLowerCase().trim();

        // 1. Total salaries paid
        if (cleanQuery.includes('إجمالي الرواتب') || cleanQuery.includes('مجموع الرواتب') || cleanQuery.includes('كم تدفع') || cleanQuery.includes('الرواتب الإجمالية') || cleanQuery.includes('total salary') || cleanQuery.includes('total salaries')) {
            const totalNet = employees.reduce((s, e) => s + e.calculatedNet, 0);
            const totalBasic = employees.reduce((s, e) => s + e.basicSalary, 0);
            const totalDeductions = employees.reduce((s, e) => s + e.calculatedDeductions, 0);
            return {
                text: `إليك ملخص الرواتب الإجمالي للقسم/الملف الحالي:<br>
                       <ul>
                           <li><strong>إجمالي الرواتب الصافية المستحقة:</strong> ${totalNet.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</li>
                           <li><strong>إجمالي الرواتب الأساسية:</strong> ${totalBasic.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</li>
                           <li><strong>إجمالي الاستقطاعات والضرائب:</strong> ${totalDeductions.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</li>
                       </ul>`,
                isHtml: true
            };
        }

        // 2. Employee count
        if (cleanQuery.includes('عدد الموظفين') || cleanQuery.includes('كم موظف') || cleanQuery.includes('عدد العمال') || cleanQuery.includes('employee count') || cleanQuery.includes('how many employees')) {
            // Count departments
            const depts = new Set(employees.map(e => e.department));
            return {
                text: `يبلغ عدد الموظفين المسجلين في هذا الكشف <strong>${employees.length} موظفاً</strong>، يتوزعون على <strong>${depts.size} أقسام وإدارات</strong> مختلفة.`,
                isHtml: true
            };
        }

        // 3. Highest salary
        if (cleanQuery.includes('أعلى راتب') || cleanQuery.includes('أعلى موظف') || cleanQuery.includes('صاحب أعلى راتب') || cleanQuery.includes('highest salary') || cleanQuery.includes('highest paid')) {
            const sorted = [...employees].sort((a, b) => b.calculatedNet - a.calculatedNet);
            const top = sorted[0];
            return {
                text: `الموظف صاحب أعلى صافي راتب هو <strong>${top.name}</strong> من قسم <strong>${top.department}</strong>.<br>
                       <ul>
                           <li><strong>الراتب الأساسي:</strong> ${top.basicSalary.toFixed(2)} SAR</li>
                           <li><strong>البدلات:</strong> ${top.allowances.toFixed(2)} SAR</li>
                           <li><strong>الصافي المستلم:</strong> ${top.calculatedNet.toFixed(2)} SAR</li>
                       </ul>`,
                isHtml: true
            };
        }

        // 4. Lowest salary
        if (cleanQuery.includes('أقل راتب') || cleanQuery.includes('أدنى راتب') || cleanQuery.includes('أقل موظف') || cleanQuery.includes('lowest salary') || cleanQuery.includes('lowest paid')) {
            const sorted = [...employees].sort((a, b) => a.calculatedNet - b.calculatedNet);
            const bottom = sorted[0];
            return {
                text: `الموظف صاحب أقل صافي راتب هو <strong>${bottom.name}</strong> من قسم <strong>${bottom.department}</strong>.<br>
                       <ul>
                           <li><strong>الراتب الأساسي:</strong> ${bottom.basicSalary.toFixed(2)} SAR</li>
                           <li><strong>البدلات:</strong> ${bottom.allowances.toFixed(2)} SAR</li>
                           <li><strong>الصافي المستلم:</strong> ${bottom.calculatedNet.toFixed(2)} SAR</li>
                       </ul>`,
                isHtml: true
            };
        }

        // 5. Verification status / Calculations problems
        if (cleanQuery.includes('أخطاء') || cleanQuery.includes('تحذير') || cleanQuery.includes('مشاكل') || cleanQuery.includes('غير مطابق') || cleanQuery.includes('errors') || cleanQuery.includes('warnings')) {
            const issues = employees.filter(e => e.validationStatus !== 'valid');
            if (issues.length === 0) {
                return {
                    text: '✅ جميع حسابات الرواتب مطابقة بنسبة 100% ولا توجد أي تحذيرات أو أخطاء حسابية في هذا الكشف.',
                    isHtml: false
                };
            }

            let rows = '';
            issues.forEach(emp => {
                const alertsList = emp.validationAlerts.map(a => a.message).join('، ');
                rows += `<tr>
                            <td>${emp.name}</td>
                            <td>${emp.department}</td>
                            <td>${emp.calculatedNet.toFixed(2)}</td>
                            <td style="color: ${emp.validationStatus === 'error' ? '#ef4444' : '#f59e0b'}">${alertsList}</td>
                         </tr>`;
            });

            return {
                text: `تم العثور على <strong>${issues.length} حالات</strong> بها ملاحظات تدقيق في الحسابات:<br>
                       <table>
                           <thead>
                               <tr>
                                   <th>اسم الموظف</th>
                                   <th>القسم</th>
                                   <th>الصافي المحسوب</th>
                                   <th>ملاحظة التدقيق</th>
                               </tr>
                           </thead>
                           <tbody>
                               ${rows}
                           </tbody>
                       </table>`,
                isHtml: true
            };
        }

        // 5.5. Departments summary
        if (cleanQuery.includes('أقسام') || cleanQuery.includes('ادارات') || cleanQuery.includes('الأقسام والإدارات') || cleanQuery.includes('عدد الاقسام')) {
            const depts = [...new Set(employees.map(e => e.department))];
            let deptDetails = '';
            depts.forEach(d => {
                const deptEmps = employees.filter(e => e.department === d);
                const deptNet = deptEmps.reduce((s, e) => s + e.calculatedNet, 0);
                deptDetails += `<li><strong>${d}:</strong> ${deptEmps.length} موظفاً (إجمالي الصافي: ${deptNet.toLocaleString('ar-SA')} SAR)</li>`;
            });
            return {
                text: `يبلغ عدد الأقسام والإدارات النشطة <strong>${depts.length} أقسام</strong>. تفاصيلها كالتالي:<br><ul>${deptDetails}</ul>`,
                isHtml: true
            };
        }

        // 5.6. Allowances summary
        if (cleanQuery.includes('بدلات') || cleanQuery.includes('البدلات والمزايا')) {
            const totalAllowances = employees.reduce((s, e) => s + e.allowances, 0);
            return {
                text: `إجمالي البدلات والمزايا الموزعة على جميع الموظفين في هذا المسير هو <strong>${totalAllowances.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</strong>.`,
                isHtml: true
            };
        }

        // 5.7. Deductions summary
        if (cleanQuery.includes('خصومات') || cleanQuery.includes('استقطاعات') || cleanQuery.includes('الخصومات والاستقطاعات')) {
            const totalDeductions = employees.reduce((s, e) => s + e.calculatedDeductions, 0);
            return {
                text: `إجمالي الاستقطاعات والخصومات (شاملة التأمينات والضرائب إن وجدت) هو <strong>${totalDeductions.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</strong>.`,
                isHtml: true
            };
        }

        // 6. Department queries: check if query contains a department name
        // We can search if any department name matches words in the query
        const departments = [...new Set(employees.map(e => e.department.toLowerCase()))];
        let matchedDept = null;
        for (const dept of departments) {
            if (cleanQuery.includes(dept) || cleanQuery.includes(dept.replace('قسم ', ''))) {
                matchedDept = dept;
                break;
            }
        }

        if (matchedDept) {
            const deptEmps = employees.filter(e => e.department.toLowerCase() === matchedDept);
            const totalNet = deptEmps.reduce((s, e) => s + e.calculatedNet, 0);
            const avgNet = totalNet / deptEmps.length;
            
            return {
                text: `إليك تفاصيل الرواتب لقسم <strong>${matchedDept.toUpperCase()}</strong>:<br>
                       <ul>
                           <li><strong>عدد موظفي القسم:</strong> ${deptEmps.length} موظفاً</li>
                           <li><strong>إجمالي رواتب القسم الصافية:</strong> ${totalNet.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</li>
                           <li><strong>متوسط صافي راتب الموظف:</strong> ${avgNet.toLocaleString('ar-SA', { minimumFractionDigits: 2 })} SAR</li>
                       </ul>`,
                isHtml: true
            };
        }

        // 7. Employee search query (try matching names)
        // Extract words from the query that might represent employee names
        let foundEmp = null;
        for (const emp of employees) {
            // If the query contains the full name or part of the name
            if (cleanQuery.includes(emp.name.toLowerCase())) {
                foundEmp = emp;
                break;
            }
        }

        if (foundEmp) {
            return {
                text: `بيانات راتب الموظف <strong>${foundEmp.name}</strong> (${foundEmp.department}):<br>
                       <ul>
                           <li><strong>الراتب الأساسي:</strong> ${foundEmp.basicSalary.toFixed(2)} SAR</li>
                           <li><strong>البدلات:</strong> ${foundEmp.allowances.toFixed(2)} SAR</li>
                           <li><strong>العمل الإضافي (+):</strong> ${(foundEmp.overtime || 0).toFixed(2)} SAR</li>
                           <li><strong>التأمينات الاجتماعية (-):</strong> ${foundEmp.calculatedSocialSecurity.toFixed(2)} SAR</li>
                           <li><strong>خصم الغياب (-):</strong> ${(foundEmp.attendanceDeductions || 0).toFixed(2)} SAR</li>
                           <li><strong>الضرائب المستقطعة (-):</strong> ${foundEmp.calculatedTaxes.toFixed(2)} SAR</li>
                           <li><strong>صافي الراتب المستحق:</strong> ${foundEmp.calculatedNet.toFixed(2)} SAR</li>
                           <li><strong>حالة الحساب:</strong> ${foundEmp.validationStatus === 'valid' ? '✅ مطابق وموثق' : '⚠️ يحتوي على ملاحظات'}</li>
                       </ul>`,
                isHtml: true
            };
        }

        // Generic help response
        return {
            text: `عذراً، لم أفهم سؤالك بدقة. يمكنك سؤالي عن:<br>
                   <ul>
                       <li>"ما هو إجمالي الرواتب؟"</li>
                       <li>"من هو الموظف الأعلى راتباً؟"</li>
                       <li>"كم عدد موظفي الشركة؟"</li>
                       <li>"هل توجد أي أخطاء أو تنبيهات؟"</li>
                       <li>"ما هو متوسط رواتب قسم [اسم القسم]؟"</li>
                       <li>"كم راتب الموظف [اسم الموظف]؟"</li>
                   </ul>`,
            isHtml: true
        };
    },

    // Online query is disabled in INFARM Professional release for data protection (100% Offline Mode)
    processOnlineQuery: async function(query, apiKey, employees) {
        return 'عذراً، تم تعطيل الاتصال الخارجي بالإنترنت في هذه النسخة الاحترافية (INFARM Professional) لحماية سرية بيانات رواتب الموظفين وضمان الخصوصية الكاملة.';
    }
};
