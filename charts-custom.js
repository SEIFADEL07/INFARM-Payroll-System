// Custom Dashboard charts manager using Chart.js
const DashboardCharts = {
    deptChartInstance: null,
    distChartInstance: null,

    // Initialize and render all dashboard visualizations
    renderDashboard: function(employees) {
        if (!employees || employees.length === 0) return;

        this.renderDepartmentChart(employees);
        this.renderSalaryVsDeductionChart(employees);
    },

    // Chart 1: Aggregate totals and averages by department
    renderDepartmentChart: function(employees) {
        const deptStats = {};
        
        employees.forEach(emp => {
            const dept = emp.department || 'غير محدد';
            if (!deptStats[dept]) {
                deptStats[dept] = { totalNet: 0, count: 0 };
            }
            deptStats[dept].totalNet += emp.calculatedNet;
            deptStats[dept].count += 1;
        });

        const labels = Object.keys(deptStats);
        const dataTotalNet = labels.map(l => Math.round(deptStats[l].totalNet));
        const dataAvgNet = labels.map(l => Math.round(deptStats[l].totalNet / deptStats[l].count));

        const ctx = document.getElementById('departmentChart');
        if (!ctx) return;

        // Destroy previous instance to avoid canvas overlay bugs
        if (this.deptChartInstance) {
            this.deptChartInstance.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const textColor = isDark ? '#9ca3af' : '#475569';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

        this.deptChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'إجمالي الرواتب الصافية (SAR)',
                        data: dataTotalNet,
                        backgroundColor: 'rgba(16, 185, 129, 0.75)',
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'متوسط راتب الموظف (SAR)',
                        data: dataAvgNet,
                        backgroundColor: 'rgba(59, 130, 246, 0.75)',
                        borderColor: '#3b82f6',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        yAxisID: 'yAvg'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Cairo' } }
                    },
                    y: {
                        position: 'right',
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Cairo' } },
                        title: { display: true, text: 'الإجمالي', color: textColor, font: { family: 'Cairo', weight: 'bold' } }
                    },
                    yAvg: {
                        position: 'left',
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Cairo' } },
                        title: { display: true, text: 'المتوسط', color: textColor, font: { family: 'Cairo', weight: 'bold' } }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: textColor, font: { family: 'Cairo', size: 11 } },
                        rtl: true
                    },
                    tooltip: {
                        titleFont: { family: 'Cairo' },
                        bodyFont: { family: 'Cairo' }
                    }
                }
            }
        });
    },

    // Chart 2: Net Salaries vs Total Deductions distribution
    renderSalaryVsDeductionChart: function(employees) {
        let totalNet = 0;
        let totalDeductions = 0;
        let totalTaxes = 0;
        let totalGOSI = 0;

        employees.forEach(emp => {
            totalNet += emp.calculatedNet;
            totalDeductions += emp.deductions; // other deductions
            totalGOSI += emp.calculatedSocialSecurity;
            totalTaxes += emp.calculatedTaxes;
        });

        const ctx = document.getElementById('distributionChart');
        if (!ctx) return;

        if (this.distChartInstance) {
            this.distChartInstance.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const textColor = isDark ? '#9ca3af' : '#475569';

        this.distChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['صافي الرواتب المستلمة', 'الخصومات والغيابات', 'التأمينات الاجتماعية GOSI', 'الضرائب والرسوم'],
                datasets: [{
                    data: [
                        Math.round(totalNet), 
                        Math.round(totalDeductions), 
                        Math.round(totalGOSI), 
                        Math.round(totalTaxes)
                    ],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', // Emerald
                        'rgba(239, 68, 68, 0.8)',  // Red
                        'rgba(245, 158, 11, 0.8)', // Orange
                        'rgba(59, 130, 246, 0.8)'   // Blue
                    ],
                    borderColor: isDark ? '#0f172a' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { family: 'Cairo', size: 10 } },
                        rtl: true
                    },
                    tooltip: {
                        titleFont: { family: 'Cairo' },
                        bodyFont: { family: 'Cairo' }
                    }
                },
                cutout: '65%'
            }
        });
    }
};
