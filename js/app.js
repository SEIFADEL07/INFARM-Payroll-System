// Main Application Coordinator & UI Bindings
const App = {
    // Application State
    state: {
        workbookData: null,      // Parsed Sheets data
        activeSheetName: '',     // Active worksheet name
        processedData: null,     // Active calculated/validated list
        salariesFile: null,      // File object for المرتبات
        adjustmentsFile: null,   // File object for المؤثرات
        searchQuery: '',
        deptFilter: 'all',
        statusFilter: 'all',
        activeTab: 'dashboard',
        rules: {
            calculateGOSI: false,
            gosiRate: 9,
            calculateTax: false,
            taxRate: 5,
            allowanceMultiplier: 1.0,
            deductionMultiplier: 1.0
        },
        companyName: 'INFARM',
        geminiApiKey: '',
        registrySearchQuery: '',
        registrySort: 'code_asc',
        registryPage: 1,
        registryPageSize: 50,
        payrollPage: 1,
        payrollPageSize: 50,
        activeProfileEmpId: null,
        activeProfileEmpCode: null,
        activeHistoryMonth: null
    },

    // Initialize application on load
    init: function() {
        this.loadStateFromStorage();
        this.loadChatHistory();
        this.bindEvents();
        this.renderActiveTab();
        
        // Update registry status display (Requirement 5)
        this.updateRegistryStatus();
        
        // Show welcome toast
        this.showToast('مرحباً بك في نظام إدارة الرواتب المطور', 'success');

        if (this.state.workbookData) {
            this.recalculateActiveSheet();
            this.updateSheetTabs();
        } else {
            this.toggleEmptyState(true);
        }
    },

    // Bind all page events
    bindEvents: function() {
        // Tab switching
        document.querySelectorAll('.nav-item a').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = el.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Theme switching (Light / Dark)
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('hr_salary_theme', newTheme);
                this.updateThemeButtonIcon(newTheme);
                // Redraw charts for font color modifications
                if (this.state.processedData) {
                    DashboardCharts.renderDashboard(this.state.processedData.employees);
                }
            });
        }

        // --- Registry Upload PDF (Requirement 1 & 2) ---
        const registryBtn   = document.getElementById('registryUploadBtn');
        const registryInput = document.getElementById('registryFileInput');
        if (registryBtn && registryInput) {
            registryBtn.addEventListener('click', () => registryInput.click());
            registryInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleRegistryFile(e.target.files[0]);
            });
        }

        // --- Dual Upload: المرتبات ---
        const salariesBtn    = document.getElementById('salariesUploadBtn');
        const salariesInput  = document.getElementById('salariesFileInput');
        const salariesZone   = document.getElementById('salariesDropzone');
        if (salariesBtn && salariesInput) {
            salariesBtn.addEventListener('click', () => salariesInput.click());
            salariesInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleSalariesFile(e.target.files[0]);
            });
        }
        if (salariesZone) {
            salariesZone.addEventListener('dragover', (e) => { e.preventDefault(); salariesZone.classList.add('dragover'); });
            salariesZone.addEventListener('dragleave', () => salariesZone.classList.remove('dragover'));
            salariesZone.addEventListener('drop', (e) => {
                e.preventDefault(); salariesZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) this.handleSalariesFile(e.dataTransfer.files[0]);
            });
        }

        // --- Dual Upload: المؤثرات ---
        const adjustmentsBtn   = document.getElementById('adjustmentsUploadBtn');
        const adjustmentsInput = document.getElementById('adjustmentsFileInput');
        const adjustmentsZone  = document.getElementById('adjustmentsDropzone');
        if (adjustmentsBtn && adjustmentsInput) {
            adjustmentsBtn.addEventListener('click', () => adjustmentsInput.click());
            adjustmentsInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) this.handleAdjustmentsFile(e.target.files[0]);
            });
        }
        if (adjustmentsZone) {
            adjustmentsZone.addEventListener('dragover', (e) => { e.preventDefault(); adjustmentsZone.classList.add('dragover'); });
            adjustmentsZone.addEventListener('dragleave', () => adjustmentsZone.classList.remove('dragover'));
            adjustmentsZone.addEventListener('drop', (e) => {
                e.preventDefault(); adjustmentsZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) this.handleAdjustmentsFile(e.dataTransfer.files[0]);
            });
        }

        // --- Merge Button ---
        const mergeBtn = document.getElementById('mergeAndProcessBtn');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', () => this.handleMergeAndProcess());
        }

        // Sample Workbook Download
        const sampleBtn = document.getElementById('downloadSampleBtn');
        if (sampleBtn) {
            sampleBtn.addEventListener('click', () => this.downloadSampleWorkbook());
        }

        // Reset Data Button
        const resetBtn = document.getElementById('resetDataBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.clearAllData());
        }

        // Search and filter binds
        const searchInput = document.getElementById('employeeSearch');
        const searchBox = searchInput ? searchInput.closest('.search-box') : null;
        const searchClear = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                this.state.searchQuery = val;
                this.state.payrollPage = 1; // Reset page on search
                if (searchBox) {
                    searchBox.classList.toggle('has-value', val.length > 0);
                }
                this.renderEmployeeTable();
            });
        }
        if (searchClear && searchInput) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                this.state.searchQuery = '';
                this.state.payrollPage = 1; // Reset page
                if (searchBox) {
                    searchBox.classList.remove('has-value');
                }
                this.renderEmployeeTable();
                searchInput.focus();
            });
        }

        // --- Registry search and sort binds ---
        const regSearchInput = document.getElementById('registrySearch');
        const regSearchBox = regSearchInput ? regSearchInput.closest('.search-box') : null;
        const regSearchClear = document.getElementById('registrySearchClearBtn');
        if (regSearchInput) {
            regSearchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                this.state.registrySearchQuery = val;
                this.state.registryPage = 1; // Reset page on search
                if (regSearchBox) {
                    regSearchBox.classList.toggle('has-value', val.length > 0);
                }
                this.renderRegistryTab();
            });
        }
        if (regSearchClear && regSearchInput) {
            regSearchClear.addEventListener('click', () => {
                regSearchInput.value = '';
                this.state.registrySearchQuery = '';
                this.state.registryPage = 1; // Reset page
                if (regSearchBox) {
                    regSearchBox.classList.remove('has-value');
                }
                this.renderRegistryTab();
                regSearchInput.focus();
            });
        }

        const regSortSelect = document.getElementById('registrySortSelect');
        if (regSortSelect) {
            regSortSelect.addEventListener('change', (e) => {
                this.state.registrySort = e.target.value;
                this.renderRegistryTab();
            });
        }

        // Registry Pagination
        const regPrevBtn = document.getElementById('registryPrevPageBtn');
        const regNextBtn = document.getElementById('registryNextPageBtn');
        if (regPrevBtn) {
            regPrevBtn.addEventListener('click', () => {
                if (this.state.registryPage > 1) {
                    this.state.registryPage--;
                    this.renderRegistryTab();
                }
            });
        }
        if (regNextBtn) {
            regNextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.getFilteredRegistry().length / this.state.registryPageSize);
                if (this.state.registryPage < totalPages) {
                    this.state.registryPage++;
                    this.renderRegistryTab();
                }
            });
        }

        // Payroll Pagination
        const payPrev = document.getElementById('payrollPrevPageBtn');
        const payNext = document.getElementById('payrollNextPageBtn');
        if (payPrev) {
            payPrev.addEventListener('click', () => {
                if (this.state.payrollPage > 1) {
                    this.state.payrollPage--;
                    this.renderEmployeeTable();
                }
            });
        }
        if (payNext) {
            payNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.getFilteredPayrollEmployees().length / this.state.payrollPageSize);
                if (this.state.payrollPage < totalPages) {
                    this.state.payrollPage++;
                    this.renderEmployeeTable();
                }
            });
        }

        // KPI card click events for Smart Assistant Integration
        const kpiSalaries = document.getElementById('kpiTotalSalaries');
        if (kpiSalaries) {
            kpiSalaries.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو إجمالي الرواتب في هذا المسير؟');
            });
        }
        const kpiEmployees = document.getElementById('kpiEmployeeCount');
        if (kpiEmployees) {
            kpiEmployees.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('كم عدد الموظفين في هذا المسير؟');
            });
        }
        const kpiAvg = document.getElementById('kpiAverageSalary');
        if (kpiAvg) {
            kpiAvg.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو متوسط صافي رواتب الموظفين؟');
            });
        }
        const kpiErrors = document.getElementById('kpiErrorsCount');
        if (kpiErrors) {
            kpiErrors.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('هل توجد أي أخطاء أو تحذيرات في حساب الرواتب؟');
            });
        }
        const kpiHighest = document.getElementById('kpiHighestSalary');
        if (kpiHighest) {
            kpiHighest.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('من هو الموظف الأعلى راتباً؟');
            });
        }
        const kpiLowest = document.getElementById('kpiLowestSalary');
        if (kpiLowest) {
            kpiLowest.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('من هو الموظف الأقل راتباً؟');
            });
        }
        const kpiDepts = document.getElementById('kpiTotalDepartments');
        if (kpiDepts) {
            kpiDepts.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('كم عدد الأقسام والإدارات وما تفاصيلها؟');
            });
        }
        const kpiAllowances = document.getElementById('kpiTotalAllowances');
        if (kpiAllowances) {
            kpiAllowances.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو إجمالي البدلات والمزايا الموزعة؟');
            });
        }
        const kpiDeductions = document.getElementById('kpiTotalDeductions');
        if (kpiDeductions) {
            kpiDeductions.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو إجمالي الخصومات والاستقطاعات؟');
            });
        }

        // Report tab KPI card click events
        const repSalaries = document.getElementById('reportMetricTotalNetPayroll') ? document.getElementById('reportMetricTotalNetPayroll').closest('.kpi-card') : null;
        if (repSalaries) {
            repSalaries.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو إجمالي الرواتب؟');
            });
        }
        const repEmployees = document.getElementById('reportMetricEmployeeCount') ? document.getElementById('reportMetricEmployeeCount').closest('.kpi-card') : null;
        if (repEmployees) {
            repEmployees.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو إجمالي عدد الموظفين؟');
            });
        }
        const repAvg = document.getElementById('reportMetricAverageSalary') ? document.getElementById('reportMetricAverageSalary').closest('.kpi-card') : null;
        if (repAvg) {
            repAvg.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو متوسط صافي رواتب الموظفين؟');
            });
        }
        const repHighest = document.getElementById('reportMetricHighestSalary') ? document.getElementById('reportMetricHighestSalary').closest('.kpi-card') : null;
        if (repHighest) {
            repHighest.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو أعلى راتب؟');
            });
        }
        const repLowest = document.getElementById('reportMetricLowestSalary') ? document.getElementById('reportMetricLowestSalary').closest('.kpi-card') : null;
        if (repLowest) {
            repLowest.addEventListener('click', () => {
                this.switchTab('ai');
                this.handleAIChatMessage('ما هو أقل راتب؟');
            });
        }

        const deptFilter = document.getElementById('deptFilterSelect');
        if (deptFilter) {
            deptFilter.addEventListener('change', (e) => {
                this.state.deptFilter = e.target.value;
                this.renderEmployeeTable();
            });
        }

        const statusFilter = document.getElementById('statusFilterSelect');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.state.statusFilter = e.target.value;
                this.renderEmployeeTable();
            });
        }

        // Exports actions
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                if (this.state.processedData) {
                    Exporter.exportPayrollToExcel(this.state.processedData.employees, this.state.activeSheetName);
                    this.showToast('تم تصدير ملف Excel بنجاح', 'success');
                }
            });
        }

        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                if (this.state.processedData) {
                    this.exportPdfWithLoadingState(exportPdfBtn, () => {
                        return Exporter.exportPayrollReportPDF(this.state.processedData.employees, this.state.activeSheetName, this.state.companyName);
                    });
                }
            });
        }

        const reportExportBtn = document.getElementById('reportsExportPdfBtn');
        if (reportExportBtn) {
            reportExportBtn.addEventListener('click', () => {
                if (this.state.processedData) {
                    this.exportPdfWithLoadingState(reportExportBtn, () => {
                        return Exporter.exportPayrollReportPDF(this.state.processedData.employees, this.state.activeSheetName, this.state.companyName);
                    });
                }
            });
        }

        // Settings saves
        const settingsForm = document.getElementById('rulesSettingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }

        // AI Chat input submit
        const chatInput = document.getElementById('chatInputField');
        const chatSendBtn = document.getElementById('chatSendButton');
        if (chatInput && chatSendBtn) {
            const sendMsg = () => {
                const text = chatInput.value.trim();
                if (text) {
                    this.handleAIChatMessage(text);
                    chatInput.value = '';
                }
            };
            chatSendBtn.addEventListener('click', sendMsg);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMsg();
            });
        }

        // AI Chat clear history
        const clearChatBtn = document.getElementById('clearChatHistoryBtn');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => {
                if (confirm('هل أنت متأكد من رغبتك في مسح سجل المحادثة؟')) {
                    localStorage.removeItem('hr_chat_history');
                    this.loadChatHistory();
                    this.showToast('تم مسح سجل المحادثة', 'warning');
                }
            });
        }

        // Modal triggers
        const slipModalClose = document.getElementById('closeSlipModalBtn');
        if (slipModalClose) {
            slipModalClose.addEventListener('click', () => this.toggleModal('slipDetailModal', false));
        }

        // Map column dropdowns dynamic save (Auto mappings edit in rules tab)
        const colMappingForm = document.getElementById('columnMappingsForm');
        if (colMappingForm) {
            colMappingForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCustomColumnMappings();
            });
        }

        // --- Bulk PDF Generation (Req 9) ---
        const bulkPdfBtn = document.getElementById('bulkGeneratePdfBtn');
        if (bulkPdfBtn) {
            bulkPdfBtn.addEventListener('click', () => this.handleBulkPdfGeneration());
        }

        const bulkPdfCancelBtn = document.getElementById('bulkPdfCancelBtn');
        if (bulkPdfCancelBtn) {
            bulkPdfCancelBtn.addEventListener('click', () => {
                if (this._bulkPdfAbortController) {
                    this._bulkPdfAbortController.abort();
                }
            });
        }

        // --- Payroll Validation (Req 8) ---
        const validateBtn = document.getElementById('validatePayrollBtn');
        if (validateBtn) {
            validateBtn.addEventListener('click', () => this.handlePayrollValidation());
        }

        // --- Save Snapshot (Req 5) ---
        const snapshotBtn = document.getElementById('saveSnapshotBtn');
        if (snapshotBtn) {
            snapshotBtn.addEventListener('click', () => this.handleSaveSnapshot());
        }

        // --- History Back Button ---
        const historyBackBtn = document.getElementById('historyBackBtn');
        if (historyBackBtn) {
            historyBackBtn.addEventListener('click', () => {
                document.getElementById('historyMonthDetail').style.display = 'none';
                document.getElementById('historyMonthsList').style.display = 'flex';
            });
        }

        // --- Employee Profile Panel (Req 4) ---
        const profileCloseBtn = document.getElementById('empProfileCloseBtn');
        if (profileCloseBtn) {
            profileCloseBtn.addEventListener('click', () => this.closeEmployeeProfile());
        }

        const profileOverlay = document.getElementById('empProfileOverlay');
        if (profileOverlay) {
            profileOverlay.addEventListener('click', (e) => {
                if (e.target === profileOverlay) this.closeEmployeeProfile();
            });
        }

        // Profile tab switching
        document.querySelectorAll('[data-profile-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-profile-tab');
                document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
                const target = document.getElementById(`profileTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
                if (target) target.classList.add('active');
            });
        });

        // Save contact info (Req 7)
        const saveContactBtn = document.getElementById('saveContactBtn');
        if (saveContactBtn) {
            saveContactBtn.addEventListener('click', () => this.handleSaveContact());
        }

        // WhatsApp prep button in profile
        const whatsappPrepBtn = document.getElementById('profileWhatsAppPrepBtn');
        if (whatsappPrepBtn) {
            whatsappPrepBtn.addEventListener('click', () => {
                if (this.state.activeProfileEmpCode) {
                    const payload = PayrollEngine.prepareWhatsAppPayload(this.state.activeProfileEmpCode);
                    console.log('[App] WhatsApp payload prepared:', payload);
                    const msg = payload.ready
                        ? `✅ الملف جاهز للإرسال (${payload.whatsappNumber})`
                        : payload.whatsappNumber
                            ? `⚠️ رقم موجود لكن لا يوجد PDF محفوظ`
                            : `❌ لا يوجد رقم WhatsApp للموظف`;
                    this.showToast(`WhatsApp Payload: ${msg}`, payload.ready ? 'success' : 'warning');
                }
            });
        }

        // Profile download slip button
        const profileDownloadSlip = document.getElementById('profileDownloadSlipBtn');
        if (profileDownloadSlip) {
            profileDownloadSlip.addEventListener('click', () => {
                if (this.state.activeProfileEmpId && this.state.processedData) {
                    const emp = this.state.processedData.employees.find(e => e.id === this.state.activeProfileEmpId);
                    if (emp) {
                        this.exportPdfWithLoadingState(profileDownloadSlip, () => {
                            return PayrollEngine.generateSingleSlip(emp, this.state.companyName, PayrollEngine.getCurrentPayrollMonth());
                        });
                    }
                }
            });
        }
    },

    // Validate that file is Excel
    _isExcelFile: function(file) {
        return file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    },

    // Update status badge for a card
    _setUploadBadge: function(badgeId, cardId, state, text) {
        const badge = document.getElementById(badgeId);
        const card  = document.getElementById(cardId);
        if (badge) {
            badge.className = 'upload-status-badge ' + (state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : '');
            const icon = state === 'ready'
                ? '<i class="fa-solid fa-circle-check"></i>'
                : state === 'loading'
                    ? '<i class="fa-solid fa-spinner fa-spin"></i>'
                    : '<i class="fa-solid fa-circle-arrow-up"></i>';
            badge.innerHTML = icon + '<span>' + HtmlSafety.escape(text) + '</span>';
        }
        if (card) {
            card.classList.toggle('has-file', state === 'ready');
        }
    },

    // Update merge button enabled state
    _refreshMergeBtn: function() {
        const btn = document.getElementById('mergeAndProcessBtn');
        if (btn) {
            btn.disabled = !this.state.salariesFile;
        }
    },

    // Update registry status badge (Requirement 5)
    updateRegistryStatus: function() {
        const badge = document.getElementById('registryStatusBadge');
        if (badge) {
            const registry = ExcelParser.getEmployeeRegistry();
            if (registry && registry.length > 0) {
                badge.className = 'upload-status-badge ready';
                badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>سجل الموظفين جاهز (${registry.length} موظف)</span>`;
            } else {
                badge.className = 'upload-status-badge';
                badge.innerHTML = `<span>لم يتم تهيئة السجل بعد</span>`;
            }
        }
    },

    // Handle Employee Registry PDF file selection (Requirement 1, 2, 5)
    handleRegistryFile: function(file) {
        if (!file.name.endsWith('.pdf')) {
            this.showToast('يرجى رفع ملف بصيغة PDF فقط (.pdf)', 'error');
            return;
        }

        const badge = document.getElementById('registryStatusBadge');
        if (badge) {
            badge.className = 'upload-status-badge loading';
            badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>جاري استخراج البيانات...</span>`;
        }

        const info = document.getElementById('registryFileInfo');
        if (info) {
            info.style.display = 'block';
            info.textContent = '📄 ' + file.name;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const pdfjsLib = window['pdfjs-dist/build/pdf'];
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                
                const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                
                for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                    const page = await pdfDoc.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join('\n');
                    fullText += pageText + '\n';
                }

                // Parse the codes and names from the full text
                const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                
                let headerIndex = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('كود الشخص') && lines[i].includes('اسم الشخص')) {
                        headerIndex = i;
                        break;
                    }
                }
                
                if (headerIndex === -1) {
                    throw new Error('لم يتم العثور على جدول الأكواد والأسماء بالملف');
                }
                
                const codes = [];
                const names = [];
                
                let i = headerIndex + 1;
                while (i < lines.length) {
                    const line = lines[i];
                    if (/^\d+$/.test(line)) {
                        codes.push(line);
                        i++;
                    } else {
                        break;
                    }
                }
                
                while (i < lines.length && names.length < codes.length) {
                    const line = lines[i];
                    if (line.includes('كود النوع الفرعى') || line.includes('صفحة') || line.includes('--')) {
                        break;
                    }
                    names.push(line);
                    i++;
                }

                if (codes.length === 0) {
                    throw new Error('لم يتم العثور على أي أكواد موظفين بالملف');
                }

                // Build/update the registry
                const registry = ExcelParser.getEmployeeRegistry();
                const nowStr = new Date().toISOString();
                let importedCount = 0;

                for (let j = 0; j < codes.length; j++) {
                    const rawCode = codes[j];
                    const rawName = names[j] || '';
                    
                    let cleanName = ExcelParser.cleanEmployeeName(rawName);
                    let department = 'غير محدد';
                    
                    // Split suffixes if present
                    const parts = cleanName.split(/\s*-\s*/);
                    if (parts.length > 1) {
                        cleanName = parts[0].trim();
                        department = parts[1].trim();
                    }

                    // Check if already exists in registry
                    let entry = registry.find(r => String(r.EmployeeCode).trim() === rawCode);
                    if (entry) {
                        // Update existing entry
                        entry.EmployeeName = cleanName;
                        entry.Department = department;
                        entry.LastSeenDate = nowStr;
                    } else {
                        // Add new entry
                        entry = {
                            EmployeeCode: rawCode,
                            EmployeeName: cleanName,
                            Department: department,
                            PhoneNumber: '',
                            CreatedDate: nowStr,
                            LastSeenDate: nowStr,
                            WhatsAppNumber: '',
                            PDFStatus: 'Pending',
                            WhatsAppStatus: 'Pending',
                            LastSentDate: ''
                        };
                        registry.push(entry);
                        importedCount++;
                    }
                }

                ExcelParser.saveEmployeeRegistry(registry);
                
                this.updateRegistryStatus();
                this.showToast(`تم تهيئة سجل الموظفين بنجاح: تم استيراد ${importedCount} موظف جديد وتحديث الباقي`, 'success');
                
                // If there is already workbookData loaded, re-resolve identities to update active tables
                if (this.state.workbookData) {
                    ExcelParser.resolveAllWorkbookIdentities(this.state.workbookData);
                    this.recalculateActiveSheet();
                }

                // Show import summary modal (Requirement 8)
                const currentEmps = this.state.processedData ? this.state.processedData.employees : [];
                const warnings = ExcelParser.validateRegistry(currentEmps).map(w => w.message);
                this.showImportSummary({
                    totalImported: codes.length,
                    matchedExisting: codes.length - importedCount,
                    newCreated: importedCount,
                    duplicatesDetected: 0,
                    warnings: warnings
                });

            } catch (err) {
                console.error(err);
                if (badge) {
                    badge.className = 'upload-status-badge';
                    badge.innerHTML = `<span>فشل استيراد السجل ❌</span>`;
                }
                this.showToast('فشل قراءة ملف الأكواد: ' + err.message, 'error');
            }
        };

        reader.onerror = (err) => {
            console.error(err);
            this.showToast('فشل قراءة الملف', 'error');
        };

        reader.readAsArrayBuffer(file);
    },

    // Handle المرتبات file selection
    handleSalariesFile: function(file) {
        if (!this._isExcelFile(file)) {
            this.showToast('يرجى رفع ملف Excel صالح (.xlsx, .xls)', 'error');
            return;
        }
        this.state.salariesFile = file;
        this._setUploadBadge('salariesStatusBadge', 'salariesDropzone', 'ready', 'تم تحميل الملف ✔');
        const info = document.getElementById('salariesFileInfo');
        if (info) { info.style.display = 'block'; info.textContent = '📄 ' + file.name; }
        this._refreshMergeBtn();
        this.showToast('تم تحديد ملف المرتبات: ' + file.name, 'success');
    },

    // Handle المؤثرات file selection
    handleAdjustmentsFile: function(file) {
        if (!this._isExcelFile(file)) {
            this.showToast('يرجى رفع ملف Excel صالح (.xlsx, .xls)', 'error');
            return;
        }
        this.state.adjustmentsFile = file;
        this._setUploadBadge('adjustmentsStatusBadge', 'adjustmentsDropzone', 'ready', 'تم تحميل الملف ✔');
        const info = document.getElementById('adjustmentsFileInfo');
        if (info) { info.style.display = 'block'; info.textContent = '📄 ' + file.name; }
        this._refreshMergeBtn();
        this.showToast('تم تحديد ملف المؤثرات: ' + file.name, 'success');
    },

    // Merge both files and load the dashboard
    handleMergeAndProcess: function() {
        if (!this.state.salariesFile) {
            this.showToast('يرجى رفع ملف المرتبات أولاً', 'error');
            return;
        }

        // Show loading state
        const mergeStatus = document.getElementById('uploadMergeStatus');
        if (mergeStatus) mergeStatus.style.display = 'flex';
        const mergeBtn = document.getElementById('mergeAndProcessBtn');
        if (mergeBtn) mergeBtn.disabled = true;

        this._setUploadBadge('salariesStatusBadge', 'salariesDropzone', 'loading', 'جاري المعالجة...');
        if (this.state.adjustmentsFile) {
            this._setUploadBadge('adjustmentsStatusBadge', 'adjustmentsDropzone', 'loading', 'جاري الدمج...');
        }

        ExcelParser.parseTwoFiles(this.state.salariesFile, this.state.adjustmentsFile)
            .then(sheets => {
                const sheetNames = Object.keys(sheets);
                if (sheetNames.length === 0) throw new Error('الملفات فارغة أو غير معروفة');

                console.log('[HR] handleMergeAndProcess - الأوراق المدمجة:', sheetNames);

                this.state.workbookData = sheets;
                this.state.activeSheetName = sheetNames.includes('مسير الرواتب المدمج')
                    ? 'مسير الرواتب المدمج' : sheetNames[0];

                this.recalculateActiveSheet();
                this.updateSheetTabs();
                this.toggleEmptyState(false);
                this.saveStateToStorage();

                // Restore status badges after processing
                const merged = sheets['مسير الرواتب المدمج'];
                const empCount = merged ? merged.employees.length : 0;
                this._setUploadBadge('salariesStatusBadge', 'salariesDropzone', 'ready', 'جاهز ✔');
                if (this.state.adjustmentsFile) {
                    this._setUploadBadge('adjustmentsStatusBadge', 'adjustmentsDropzone', 'ready', 'جاهز ✔');
                }
                if (mergeStatus) mergeStatus.style.display = 'none';

                const msg = this.state.adjustmentsFile
                    ? `تم دمج الملفين بنجاح | إجمالي الموظفين: ${empCount}`
                    : `تم استيراد ملف المرتبات | إجمالي الموظفين: ${empCount}`;
                this.showToast(msg, 'success');

                // Show import summary modal (Requirement 8)
                const summary = ExcelParser.lastImportSummary || {
                    totalImported: empCount,
                    matchedExisting: 0,
                    newCreated: 0,
                    duplicatesDetected: 0,
                    warnings: []
                };
                const currentEmps = this.state.processedData ? this.state.processedData.employees : [];
                const regWarnings = ExcelParser.validateRegistry(currentEmps).map(w => w.message);
                const allWarnings = [...summary.warnings, ...regWarnings];
                
                this.showImportSummary({
                    totalImported: summary.totalImported,
                    matchedExisting: summary.matchedExisting,
                    newCreated: summary.newCreated,
                    duplicatesDetected: summary.duplicatesDetected,
                    warnings: allWarnings
                });
            })
            .catch(err => {
                console.error(err);
                if (mergeStatus) mergeStatus.style.display = 'none';
                if (mergeBtn) mergeBtn.disabled = false;
                this._setUploadBadge('salariesStatusBadge', 'salariesDropzone', 'ready', 'تم تحميل الملف ✔');
                if (this.state.adjustmentsFile) {
                    this._setUploadBadge('adjustmentsStatusBadge', 'adjustmentsDropzone', 'ready', 'تم تحميل الملف ✔');
                }
                this.showToast('فشل الدمج: ' + err.message, 'error');
            });
    },

    // Calculate current sheets with active rules
    recalculateActiveSheet: function() {
        if (!this.state.workbookData || !this.state.activeSheetName) return;

        // --- DEBUG LOGS ---
        const allSheets = Object.keys(this.state.workbookData);
        console.log('[HR] recalculateActiveSheet - جميع الأوراق المتاحة:', allSheets);
        console.log('[HR] recalculateActiveSheet - الورقة النشطة:', this.state.activeSheetName);
        // ------------------

        const rawSheet = this.state.workbookData[this.state.activeSheetName];
        if (!rawSheet) {
            console.error('[HR] الورقة النشطة غير موجودة في workbookData! المفاتيح:', allSheets);
            return;
        }

        const empsBefore = rawSheet.employees ? rawSheet.employees.length : 0;
        console.log('[HR] عدد الموظفين في الورقة النشطة:', empsBefore, '| isMerged:', rawSheet.isMerged || false);
        
        // Compute salaries using rules
        const result = SalaryCalculator.processPayrollSheet(rawSheet.employees, this.state.rules);
        this.state.processedData = result;

        console.log('[HR] عدد الموظفين بعد المعالجة:', result.employees.length, '| صافي الرواتب الإجمالي:', result.totals.net);

        this.updateDashboardMetrics();
        this.populateDepartmentFilters();
        this.renderEmployeeTable();
        this.renderColumnMappingSettings();

        // Build fast search index (Req 3 & 11)
        PayrollEngine.buildSearchIndex(result.employees);

        // Render dashboard charts
        DashboardCharts.renderDashboard(result.employees);
    },

    // Populate sheets tab bar dynamically
    updateSheetTabs: function() {
        const tabsContainer = document.getElementById('sheetTabsContainer');
        if (!tabsContainer || !this.state.workbookData) return;

        tabsContainer.innerHTML = '';
        Object.keys(this.state.workbookData).forEach(sheetName => {
            const tab = document.createElement('div');
            tab.className = `sheet-tab ${sheetName === this.state.activeSheetName ? 'active' : ''}`;
            tab.textContent = sheetName;
            tab.addEventListener('click', () => {
                this.state.activeSheetName = sheetName;
                this.recalculateActiveSheet();
                this.updateSheetTabs();
                this.showToast(`تم التبديل إلى ورقة: ${sheetName}`, 'success');
            });
            tabsContainer.appendChild(tab);
        });
    },

    // Refresh KPI metrics cards on dashboard
    updateDashboardMetrics: function() {
        const totals = this.state.processedData.totals;
        const employees = this.state.processedData.employees;

        const animateValue = (id, val, suffix = '') => {
            const el = document.getElementById(id);
            if (!el) return;
            const startVal = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
            const duration = 1000;
            const startTime = performance.now();
            const frame = (now) => {
                const progress = Math.min((now - startTime) / duration, 1);
                const current = Math.floor(startVal + (val - startVal) * progress);
                el.textContent = current.toLocaleString('ar-SA') + suffix;
                if (progress < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        };

        const salaries = employees.map(e => e.calculatedNet);
        const depts = new Set(employees.map(e => e.department));
        const totalAllowances = employees.reduce((sum, e) => sum + e.allowances, 0);
        const totalDeductions = employees.reduce((sum, e) => sum + e.calculatedDeductions, 0);

        animateValue('metricEmployeeCount', totals.count);
        animateValue('metricTotalSalaries', totals.net, ' SAR');
        animateValue('metricAverageSalary', totals.count > 0 ? Math.round(totals.net / totals.count) : 0, ' SAR');

        // Additional KPI calculations
        const highestSalary = salaries.length ? Math.max(...salaries) : 0;
        const lowestSalary = salaries.length ? Math.min(...salaries) : 0;
        const totalDepartments = depts.size;

        animateValue('metricHighestSalary', highestSalary, ' SAR');
        animateValue('metricLowestSalary', lowestSalary, ' SAR');
        animateValue('metricTotalDepartments', totalDepartments);
        animateValue('metricTotalAllowances', totalAllowances, ' SAR');
        animateValue('metricTotalDeductions', totalDeductions, ' SAR');

        // Animate Reports tab metrics
        animateValue('reportMetricEmployeeCount', totals.count);
        animateValue('reportMetricTotalNetPayroll', totals.net, ' SAR');
        animateValue('reportMetricAverageSalary', totals.count > 0 ? Math.round(totals.net / totals.count) : 0, ' SAR');
        animateValue('reportMetricHighestSalary', highestSalary, ' SAR');
        animateValue('reportMetricLowestSalary', lowestSalary, ' SAR');

        // Populate reports tab department summary table
        const reportTbody = document.getElementById('reportDepartmentSummaryBody');
        if (reportTbody) {
            reportTbody.innerHTML = '';
            if (employees && employees.length > 0) {
                const deptData = {};
                employees.forEach(emp => {
                    const dept = emp.department || 'غير محدد';
                    if (!deptData[dept]) {
                        deptData[dept] = {
                            count: 0,
                            basic: 0,
                            allowances: 0,
                            deductions: 0,
                            net: 0
                        };
                    }
                    deptData[dept].count += 1;
                    deptData[dept].basic += emp.basicSalary || 0;
                    deptData[dept].allowances += emp.allowances || 0;
                    deptData[dept].deductions += emp.calculatedDeductions || 0;
                    deptData[dept].net += emp.calculatedNet || 0;
                });

                Object.keys(deptData).forEach(deptName => {
                    const data = deptData[deptName];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${HtmlSafety.escape(deptName)}</strong></td>
                        <td>${data.count}</td>
                        <td>${data.basic.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</td>
                        <td>${data.allowances.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</td>
                        <td>${data.deductions.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</td>
                        <td style="font-weight: 700; color: var(--primary);">${data.net.toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</td>
                    `;
                    reportTbody.appendChild(tr);
                });
            } else {
                reportTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد بيانات متاحة</td></tr>`;
            }
        }

        const errorCard = document.getElementById('metricErrorsCount');
        if (errorCard) errorCard.textContent = totals.errors + totals.warnings;
        
        const errorIndicator = document.getElementById('dashboardAlertIndicator');
        if (errorIndicator) {
            if (totals.errors > 0 || totals.warnings > 0) {
                errorIndicator.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> تم العثور على ${totals.errors} أخطاء و ${totals.warnings} تحذيرات تدقيق بالمسير الحالي.`;
                errorIndicator.style.display = 'block';
                errorIndicator.className = 'badge badge-danger';
                errorIndicator.style.padding = '12px';
                errorIndicator.style.width = '100%';
                errorIndicator.style.borderRadius = '12px';
                errorIndicator.style.marginTop = '10px';
            } else {
                errorIndicator.style.display = 'none';
            }
        }
    },

    // Update filter dropdowns with unique departments
    populateDepartmentFilters: function() {
        const deptSelect = document.getElementById('deptFilterSelect');
        if (!deptSelect || !this.state.processedData) return;

        // Keep 'all'
        deptSelect.innerHTML = '<option value="all">كل الأقسام</option>';
        
        const depts = new Set();
        this.state.processedData.employees.forEach(emp => {
            if (emp.department) depts.add(emp.department);
        });

        depts.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            if (dept === this.state.deptFilter) opt.selected = true;
            deptSelect.appendChild(opt);
        });
    },

    // Get filtered payroll employees list based on search and drop-downs
    getFilteredPayrollEmployees: function() {
        if (!this.state.processedData) return [];
        return this.state.processedData.employees.filter(emp => {
            const q = (this.state.searchQuery || '').trim();
            const matchesDept = this.state.deptFilter === 'all' || emp.department === this.state.deptFilter;
            const matchesStatus = this.state.statusFilter === 'all' || emp.validationStatus === this.state.statusFilter;

            if (!q) {
                return matchesDept && matchesStatus;
            }

            const qLower = q.toLowerCase();
            const qNorm = ExcelParser.normalizeArabicName(q);

            const empIdStr = emp.employeeId ? String(emp.employeeId).trim().toLowerCase() : '';
            const empNameNorm = ExcelParser.normalizeArabicName(emp.name);
            const empDeptStr = emp.department ? String(emp.department).toLowerCase() : '';

            // Exact/partial match checks
            const exactCode = (empIdStr === qLower);
            const partialCode = empIdStr.includes(qLower);
            const exactName = (empNameNorm === qNorm);
            const partialName = empNameNorm.includes(qNorm);
            const partialDept = empDeptStr.includes(qLower);

            const matchesSearch = exactCode || partialCode || exactName || partialName || partialDept;

            return matchesSearch && matchesDept && matchesStatus;
        });
    },

    // Get filtered and prioritized (sorted by search score) payroll employees list
    getFilteredAndSortedPayrollEmployees: function() {
        const filtered = this.getFilteredPayrollEmployees();
        const q = (this.state.searchQuery || '').trim();
        if (!q) return filtered;

        // Priority 1: Exact code match
        // Priority 2: Partial code match
        // Priority 3: Exact name match
        // Priority 4: Partial name match
        // Priority 5: Department or other partial match
        const getMatchScore = (emp, query) => {
            const qLower = query.toLowerCase();
            const qNorm = ExcelParser.normalizeArabicName(query);
            const empIdStr = emp.employeeId ? String(emp.employeeId).trim().toLowerCase() : '';
            const empNameNorm = ExcelParser.normalizeArabicName(emp.name);

            if (empIdStr === qLower) return 1;
            if (empIdStr.includes(qLower)) return 2;
            if (empNameNorm === qNorm) return 3;
            if (empNameNorm.includes(qNorm)) return 4;
            return 5;
        };

        return filtered.sort((a, b) => {
            return getMatchScore(a, q) - getMatchScore(b, q);
        });
    },

    // Render payroll records table with filtration, prioritization, and pagination
    renderEmployeeTable: function() {
        const tbody = document.getElementById('payrollTableBody');
        if (!tbody || !this.state.processedData) return;

        tbody.innerHTML = '';

        const sortedAndFiltered = this.getFilteredAndSortedPayrollEmployees();
        const totalRows = sortedAndFiltered.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / this.state.payrollPageSize));

        // Clip page number to valid bounds
        if (this.state.payrollPage > totalPages) this.state.payrollPage = totalPages;
        if (this.state.payrollPage < 1) this.state.payrollPage = 1;

        // Paginate using slice
        const startIdx = (this.state.payrollPage - 1) * this.state.payrollPageSize;
        const pageEmployees = sortedAndFiltered.slice(startIdx, startIdx + this.state.payrollPageSize);

        // Update pagination UI
        const pageInfo = document.getElementById('payrollPageInfo');
        if (pageInfo) {
            pageInfo.textContent = `صفحة ${this.state.payrollPage} من ${totalPages} (إجمالي ${totalRows} موظف)`;
        }

        const prevBtn = document.getElementById('payrollPrevPageBtn');
        if (prevBtn) prevBtn.disabled = this.state.payrollPage <= 1;

        const nextBtn = document.getElementById('payrollNextPageBtn');
        if (nextBtn) nextBtn.disabled = this.state.payrollPage >= totalPages;

        if (pageEmployees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد سجلات مطابقة للبحث الحالي</td></tr>`;
            return;
        }

        pageEmployees.forEach(emp => {
            const tr = document.createElement('tr');
            if (this.state.highlightEmpId === emp.id) tr.style.backgroundColor = 'rgba(var(--primary-rgb), 0.1)';
            
            // Highlight matching rows (Requirement 6)
            if (this.state.searchQuery && this.state.searchQuery.trim().length > 0) {
                tr.classList.add('highlight-match');
            }
            
            let statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> مطابق</span>`;
            if (emp.validationStatus === 'warning') {
                statusBadge = `<span class="badge badge-warning" title="${HtmlSafety.escape(emp.validationAlerts[0].message)}"><i class="fa-solid fa-circle-exclamation"></i> تحذير</span>`;
            } else if (emp.validationStatus === 'error') {
                statusBadge = `<span class="badge badge-danger" title="${HtmlSafety.escape(emp.validationAlerts[0].message)}"><i class="fa-solid fa-circle-xmark"></i> خطأ</span>`;
            }

            tr.innerHTML = `
                <td>${HtmlSafety.escape(emp.employeeId || '#EMP' + String(emp.id).padStart(4, '0'))}</td>
                <td><strong>${HtmlSafety.escape(emp.name)}</strong></td>
                <td>${HtmlSafety.escape(emp.department)}</td>
                <td>${emp.basicSalary.toLocaleString('ar-SA')}</td>
                <td>${emp.allowances.toLocaleString('ar-SA')}</td>
                <td style="color: var(--primary); font-weight: 500;">${(emp.overtime || 0).toLocaleString('ar-SA')}</td>
                <td style="color: var(--accent-orange); font-weight: 500;">${(emp.attendanceDeductions || 0).toLocaleString('ar-SA')}</td>
                <td style="color: var(--accent-red);">${emp.calculatedDeductions.toLocaleString('ar-SA')}</td>
                <td style="font-weight: 700; color: var(--primary);">${emp.calculatedNet.toLocaleString('ar-SA')}</td>
                <td>${statusBadge}</td>
            `;

            tr.addEventListener('click', () => this.openEmployeeSlipModal(emp.id));
            tbody.appendChild(tr);
        });
    },

    // Filter registry based on search query and sort option
    getFilteredRegistry: function() {
        const registry = ExcelParser.getEmployeeRegistry();
        const q = (this.state.registrySearchQuery || '').trim();

        // 1. Filter
        let filtered = registry.filter(entry => {
            if (!q) return true;

            const qLower = q.toLowerCase();
            const qNorm = ExcelParser.normalizeArabicName(q);

            const codeStr = entry.EmployeeCode ? String(entry.EmployeeCode).trim().toLowerCase() : '';
            const nameNorm = ExcelParser.normalizeArabicName(entry.EmployeeName);

            return codeStr.includes(qLower) || nameNorm.includes(qNorm);
        });

        // 2. Sort
        const sortOption = this.state.registrySort;
        filtered.sort((a, b) => {
            if (sortOption === 'code_asc') {
                const codeA = parseInt(a.EmployeeCode) || 0;
                const codeB = parseInt(b.EmployeeCode) || 0;
                return codeA - codeB;
            } else if (sortOption === 'code_desc') {
                const codeA = parseInt(a.EmployeeCode) || 0;
                const codeB = parseInt(b.EmployeeCode) || 0;
                return codeB - codeA;
            } else if (sortOption === 'name_asc') {
                return String(a.EmployeeName).localeCompare(String(b.EmployeeName), 'ar');
            } else if (sortOption === 'name_desc') {
                return String(b.EmployeeName).localeCompare(String(a.EmployeeName), 'ar');
            }
            return 0;
        });

        return filtered;
    },

    // Render registry table with pagination and sorting
    renderRegistryTab: function() {
        const tbody = document.getElementById('registryTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        const filtered = this.getFilteredRegistry();
        const totalRows = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / this.state.registryPageSize));

        // Clip page number to valid bounds
        if (this.state.registryPage > totalPages) this.state.registryPage = totalPages;
        if (this.state.registryPage < 1) this.state.registryPage = 1;

        // Paginate using slice
        const start = (this.state.registryPage - 1) * this.state.registryPageSize;
        const pageEntries = filtered.slice(start, start + this.state.registryPageSize);

        // Update pagination UI
        const pageInfo = document.getElementById('registryPageInfo');
        if (pageInfo) {
            pageInfo.textContent = `صفحة ${this.state.registryPage} من ${totalPages} (إجمالي ${totalRows} موظف)`;
        }
        
        const prevBtn = document.getElementById('registryPrevPageBtn');
        if (prevBtn) prevBtn.disabled = this.state.registryPage <= 1;

        const nextBtn = document.getElementById('registryNextPageBtn');
        if (nextBtn) nextBtn.disabled = this.state.registryPage >= totalPages;

        if (pageEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">سجل الموظفين فارغ أو لا توجد نتائج مطابقة للبحث</td></tr>`;
            return;
        }

        pageEntries.forEach(entry => {
            const tr = document.createElement('tr');
            
            const createdDateStr = entry.CreatedDate ? new Date(entry.CreatedDate).toLocaleDateString('ar-EG') : 'غير متوفر';
            const lastSeenDateStr = entry.LastSeenDate ? new Date(entry.LastSeenDate).toLocaleDateString('ar-EG') : 'غير متوفر';
            const sourceStr = entry.Source || 'ملف الأكواد PDF';

            tr.innerHTML = `
                <td>${HtmlSafety.escape(entry.EmployeeCode || 'بدون كود')}</td>
                <td><strong>${HtmlSafety.escape(entry.EmployeeName)}</strong></td>
                <td>${HtmlSafety.escape(entry.Department || 'غير محدد')}</td>
                <td><span class="badge ${entry.Source ? 'badge-primary' : 'badge-secondary'}">${HtmlSafety.escape(sourceStr)}</span></td>
                <td>${createdDateStr}</td>
                <td>${lastSeenDateStr}</td>
            `;

            tbody.appendChild(tr);
        });

        // Render registry alerts/warnings in the alerts section (Requirement 4)
        const alertsBox = document.getElementById('registryAlertsBox');
        if (alertsBox) {
            const currentEmployees = this.state.processedData ? this.state.processedData.employees : [];
            const warnings = ExcelParser.validateRegistry(currentEmployees);

            if (warnings.length > 0) {
                alertsBox.style.display = 'flex';
                alertsBox.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> تنبيهات تدقيق السجل (${warnings.length}):</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${warnings.map(w => `<div>• ${HtmlSafety.escape(w.message)}</div>`).join('')}
                    </div>
                `;
            } else {
                alertsBox.style.display = 'none';
            }
        }
    },

    // Show import summary modal with results and warnings
    showImportSummary: function(summary) {
        document.getElementById('summaryTotalImported').textContent = summary.totalImported;
        document.getElementById('summaryMatchedExisting').textContent = summary.matchedExisting;
        document.getElementById('summaryNewCreated').textContent = summary.newCreated;
        document.getElementById('summaryDuplicatesDetected').textContent = summary.duplicatesDetected;

        const warnSection = document.getElementById('summaryWarningsSection');
        const warnList = document.getElementById('summaryWarningsList');
        
        if (summary.warnings && summary.warnings.length > 0) {
            warnSection.style.display = 'block';
            warnList.innerHTML = summary.warnings.map(w => `
                <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 2px;">
                    <i class="fa-solid fa-triangle-exclamation" style="margin-top: 3px; font-size: 0.8rem;"></i>
                    <span>${HtmlSafety.escape(w)}</span>
                </div>
            `).join('');
        } else {
            warnSection.style.display = 'none';
            warnList.innerHTML = '';
        }

        this.toggleModal('importSummaryModal', true);
    },

    // Populate Column Mappings inside Rules Dashboard
    renderColumnMappingSettings: function() {
        const mappingsContainer = document.getElementById('columnMappingsContainer');
        if (!mappingsContainer || !this.state.workbookData || !this.state.activeSheetName) return;

        const currentSheet = this.state.workbookData[this.state.activeSheetName];
        const headers = currentSheet.headers;
        const currentMappings = currentSheet.mappings;

        mappingsContainer.innerHTML = '';

        Object.keys(ExcelParser.fields).forEach(fieldKey => {
            const fieldInfo = ExcelParser.fields[fieldKey];
            
            const row = document.createElement('div');
            row.className = 'mapping-item';
            
            let options = `<option value="-1">-- غير محدد --</option>`;
            headers.forEach((header, index) => {
                const selected = currentMappings[fieldKey] === index ? 'selected' : '';
                options += `<option value="${index}" ${selected}>العمود ${index + 1}: ${HtmlSafety.escape(header)}</option>`;
            });

            row.innerHTML = `
                <span>${fieldInfo.label}</span>
                <select name="map_${fieldKey}" class="select-field" style="min-width: 200px;">
                    ${options}
                </select>
            `;

            mappingsContainer.appendChild(row);
        });
    },

    // Save custom columns configuration from dropdown adjustments
    saveCustomColumnMappings: function() {
        if (!this.state.workbookData || !this.state.activeSheetName) return;

        const currentSheet = this.state.workbookData[this.state.activeSheetName];
        const form = document.getElementById('columnMappingsForm');
        
        Object.keys(ExcelParser.fields).forEach(fieldKey => {
            const select = form.querySelector(`[name="map_${fieldKey}"]`);
            if (select) {
                currentSheet.mappings[fieldKey] = parseInt(select.value);
            }
        });

        // Re-process raw rows
        const dataRows = this.state.workbookData[this.state.activeSheetName].employees;
        const newEmployees = dataRows.map((emp, index) => {
            const row = emp.rawRow;
            const maps = currentSheet.mappings;
            return {
                id: index + 1,
                rowNumber: emp.rowNumber,
                employeeId: maps.employeeId !== -1 && row[maps.employeeId] ? String(row[maps.employeeId]).trim() : emp.employeeId,
                name: maps.name !== -1 && row[maps.name] ? ExcelParser.cleanEmployeeName(row[maps.name]) : emp.name,
                department: maps.department !== -1 && row[maps.department] ? String(row[maps.department]).trim() : 'غير محدد',
                basicSalary: maps.basicSalary !== -1 ? ExcelParser.parseNumeric(row[maps.basicSalary]) : 0,
                allowances: maps.allowances !== -1 ? ExcelParser.parseNumeric(row[maps.allowances]) : 0,
                deductions: maps.deductions !== -1 ? ExcelParser.parseNumeric(row[maps.deductions]) : 0,
                socialSecurity: maps.socialSecurity !== -1 ? ExcelParser.parseNumeric(row[maps.socialSecurity]) : 0,
                taxes: maps.taxes !== -1 ? ExcelParser.parseNumeric(row[maps.taxes]) : 0,
                attendanceDeductions: maps.attendanceDeductions !== -1 ? ExcelParser.parseAttendanceValue(row[maps.attendanceDeductions], 'ح/الموظف', index) : 0,
                overtime: maps.overtime !== -1 ? ExcelParser.parseAttendanceValue(row[maps.overtime], 'ص/الموظف', index) : 0,
                attendanceLateMinutes: emp.attendanceLateMinutes || 0,
                attendanceOvertimeMinutes: emp.attendanceOvertimeMinutes || 0,
                originalNetSalary: maps.netSalary !== -1 ? ExcelParser.parseNumeric(row[maps.netSalary]) : null,
                rawRow: row
            };
        });

        currentSheet.employees = newEmployees;
        
        // Resolve all identities across all parsed sheets in the workbook (Requirement 8)
        ExcelParser.resolveAllWorkbookIdentities(this.state.workbookData);
        
        this.recalculateActiveSheet();
        this.saveStateToStorage();
        this.showToast('تم حفظ تعديلات الأعمدة وإعادة حساب البيانات', 'success');
    },

    // Save rules settings adjustments
    saveSettings: function() {
        this.state.rules.calculateGOSI = document.getElementById('calcGosiCheck').checked;
        this.state.rules.gosiRate = parseFloat(document.getElementById('gosiRateInput').value) || 0;
        this.state.rules.calculateTax = document.getElementById('calcTaxCheck').checked;
        this.state.rules.taxRate = parseFloat(document.getElementById('taxRateInput').value) || 0;
        
        this.state.rules.allowanceMultiplier = parseFloat(document.getElementById('allowanceMultInput').value) || 1.0;
        this.state.rules.deductionMultiplier = parseFloat(document.getElementById('deductionMultInput').value) || 1.0;

        // Attendance time-to-money conversion rates (default 0 = disabled)
        this.state.rules.overtimePerMinute      = parseFloat(document.getElementById('overtimePerMinuteInput').value) || 0;
        this.state.rules.lateDeductionPerMinute = parseFloat(document.getElementById('lateDeductionPerMinuteInput').value) || 0;

        let cName = document.getElementById('companyNameInput').value.trim() || 'INFARM';
        this.state.companyName = cName;
        const chCompanyName = document.querySelector('.ch-company-name');
        if (chCompanyName) {
            chCompanyName.textContent = this.state.companyName;
        }
        const apiKeyEl = document.getElementById('geminiApiKeyInput');
        this.state.geminiApiKey = apiKeyEl ? apiKeyEl.value : '';
        
        this.recalculateActiveSheet();
        this.saveStateToStorage();
        this.showToast('تم حفظ الإعدادات وقواعد الاحتساب وتحديث الجدول المالي', 'success');
    },

    // View individual salary slip modal
    openEmployeeSlipModal: function(empId) {
        if (!this.state.processedData) return;
        
        const emp = this.state.processedData.employees.find(e => e.id === empId);
        if (!emp) return;

        this.state.activeEmployee = emp;

        // Render values in HTML template using modern premium layout elements
        const nameEl = document.getElementById('empModalName');
        if (nameEl) nameEl.textContent = emp.name;
        
        const avatarEl = document.getElementById('empModalAvatar');
        if (avatarEl) {
            const initials = emp.name ? emp.name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() : '👤';
            avatarEl.textContent = initials;
        }

        const deptEl = document.getElementById('empModalDept');
        if (deptEl) deptEl.textContent = emp.department;

        const idEl = document.getElementById('empModalId');
        if (idEl) idEl.textContent = emp.employeeId || `#EMP${String(emp.id).padStart(4, '0')}`;

        const basicEl = document.getElementById('empModalBasic');
        if (basicEl) basicEl.textContent = emp.basicSalary.toLocaleString('ar-SA') + ' SAR';

        const allowancesEl = document.getElementById('empModalAllowances');
        if (allowancesEl) allowancesEl.textContent = emp.allowances.toLocaleString('ar-SA') + ' SAR';

        const overtimeEl = document.getElementById('empModalOvertime');
        if (overtimeEl) overtimeEl.textContent = (emp.overtime || 0).toLocaleString('ar-SA') + ' SAR';

        const grossEl = document.getElementById('empModalGross');
        if (grossEl) grossEl.textContent = emp.grossSalary.toLocaleString('ar-SA') + ' SAR';
        
        const gosiEl = document.getElementById('empModalGosi');
        if (gosiEl) gosiEl.textContent = emp.calculatedSocialSecurity.toLocaleString('ar-SA') + ' SAR';

        const attEl = document.getElementById('empModalAttendanceDeductions');
        if (attEl) attEl.textContent = (emp.attendanceDeductions || 0).toLocaleString('ar-SA') + ' SAR';

        const otherEl = document.getElementById('empModalOtherDeductions');
        if (otherEl) otherEl.textContent = emp.deductions.toLocaleString('ar-SA') + ' SAR';

        const taxEl = document.getElementById('empModalTax');
        if (taxEl) taxEl.textContent = emp.calculatedTaxes.toLocaleString('ar-SA') + ' SAR';

        const totalDedEl = document.getElementById('empModalTotalDeductions');
        if (totalDedEl) totalDedEl.textContent = emp.calculatedDeductions.toLocaleString('ar-SA') + ' SAR';
        
        const netEl = document.getElementById('empModalNet');
        if (netEl) netEl.textContent = emp.calculatedNet.toLocaleString('ar-SA') + ' SAR';

        // Add validation notifications to the card
        const alertBox = document.getElementById('empModalAlertsContainer');
        if (alertBox) {
            if (emp.validationAlerts && emp.validationAlerts.length > 0) {
                alertBox.innerHTML = `<strong>ملاحظات التدقيق:</strong><br>` + emp.validationAlerts.map(a => `• ${HtmlSafety.escape(a.message)}`).join('<br>');
                alertBox.style.display = 'block';
            } else {
                alertBox.style.display = 'none';
            }
        }

        // Setup ask AI about employee action inside modal
        const askAiBtn = document.getElementById('askAiAboutEmpBtn');
        if (askAiBtn) {
            const newAskAiBtn = askAiBtn.cloneNode(true);
            askAiBtn.parentNode.replaceChild(newAskAiBtn, askAiBtn);
            newAskAiBtn.addEventListener('click', () => {
                this.toggleModal('slipDetailModal', false);
                this.switchTab('ai');
                this.handleAIChatMessage(`أعطني تفاصيل ومراجعة راتب الموظف ${emp.name}`);
            });
        }

        // Setup copy action inside modal
        const copyBtn = document.getElementById('copyEmpDataBtn');
        if (copyBtn) {
            const newCopyBtn = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            newCopyBtn.addEventListener('click', () => {
                const textToCopy = `
اسم الموظف: ${emp.name}
الرقم الوظيفي: ${emp.employeeId || '#EMP' + String(emp.id).padStart(4, '0')}
القسم / الإدارة: ${emp.department}
الراتب الأساسي: ${emp.basicSalary.toLocaleString('ar-SA')} SAR
البدلات والمزايا: ${emp.allowances.toLocaleString('ar-SA')} SAR
العمل الإضافي: ${(emp.overtime || 0).toLocaleString('ar-SA')} SAR
إجمالي الراتب الإجمالي (Gross): ${emp.grossSalary.toLocaleString('ar-SA')} SAR
التأمينات الاجتماعية GOSI: ${emp.calculatedSocialSecurity.toLocaleString('ar-SA')} SAR
خصم الحضور والغياب: ${(emp.attendanceDeductions || 0).toLocaleString('ar-SA')} SAR
الضرائب المستقطعة: ${emp.calculatedTaxes.toLocaleString('ar-SA')} SAR
إجمالي الخصومات المستقطعة: ${emp.calculatedDeductions.toLocaleString('ar-SA')} SAR
صافي الراتب المستحق (Net): ${emp.calculatedNet.toLocaleString('ar-SA')} SAR
                `.trim();
                
                navigator.clipboard.writeText(textToCopy).then(() => {
                    this.showToast('تم نسخ بيانات الموظف بنجاح إلى الحافظة', 'success');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    this.showToast('فشل في نسخ البيانات', 'error');
                });
            });
        }

        // Setup slip download action inside modal
        const downloadBtn = document.getElementById('downloadSlipPdfBtn');
        if (downloadBtn) {
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            newBtn.addEventListener('click', () => {
                this.exportPdfWithLoadingState(newBtn, () => {
                    return Exporter.exportSalarySlipPDF(emp, this.state.companyName);
                });
            });
        }

        this.toggleModal('slipDetailModal', true);
    },

    // Handle incoming chat commands from the AI UI assistant (fully offline)
    handleAIChatMessage: function(query) {
        if (!this.state.chatHistory) this.state.chatHistory = [];
        this.state.chatHistory.push({ text: query, sender: 'user', isHtml: false });
        this.addChatMessage(query, 'user');
        
        // Show typing indicator
        const typingId = this.addChatMessage('جاري معالجة البيانات وتحليلها محلياً...', 'bot typing');

        // Wait slightly to simulate parsing offline
        setTimeout(() => {
            const res = AIAssistant.processOfflineQuery(query, this.state.processedData?.employees);
            this.removeChatMessage(typingId);
            this.addChatMessage(res.text, 'bot', res.isHtml);
            this.state.chatHistory.push({ text: res.text, sender: 'bot', isHtml: res.isHtml });
            this.saveChatHistory();
        }, 400);
    },

    // PDF export helper with loading button state and toast notifications
    exportPdfWithLoadingState: function(buttonElement, exportFn) {
        if (!buttonElement) return;
        const originalContent = buttonElement.innerHTML;
        buttonElement.disabled = true;
        buttonElement.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-left: 6px;"></i> جاري التصدير...`;
        
        this.showToast('جاري تصدير ملف PDF، يرجى الانتظار...', 'warning');

        exportFn()
            .then(() => {
                this.showToast('تم تصدير ملف PDF بنجاح ✔', 'success');
            })
            .catch(err => {
                console.error(err);
                this.showToast('فشل في تصدير ملف PDF ❌', 'error');
            })
            .finally(() => {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalContent;
            });
    },

    // Write a message to the Chat logs
    addChatMessage: function(text, sender, isHtml = false) {
        const messagesDiv = document.getElementById('chatMessagesContainer');
        if (!messagesDiv) return;

        const msg = document.createElement('div');
        const id = 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5);
        msg.id = id;
        msg.className = `chat-msg ${sender}`;
        
        if (isHtml) {
            msg.innerHTML = HtmlSafety.sanitizeRichText(text);
        } else {
            msg.innerHTML = HtmlSafety.escapeWithBreaks(text);
        }

        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        return id;
    },

    removeChatMessage: function(id) {
        const msg = document.getElementById(id);
        if (msg) msg.parentNode.removeChild(msg);
    },

    // Sidebar view toggle triggers
    switchTab: function(tabId) {
        this.state.activeTab = tabId;
        
        // update menu visual focus
        document.querySelectorAll('.nav-item').forEach(el => {
            const anchor = el.querySelector('a');
            if (anchor && anchor.getAttribute('data-tab') === tabId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        this.renderActiveTab();
    },

    renderActiveTab: function() {
        // Toggle elements display
        document.querySelectorAll('.tab-content').forEach(el => {
            if (el.id === `${this.state.activeTab}Tab`) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // Set chart refresh on active load
        if (this.state.activeTab === 'dashboard' && this.state.processedData) {
            setTimeout(() => {
                DashboardCharts.renderDashboard(this.state.processedData.employees);
            }, 50);
        }

        // Render registry content if active
        if (this.state.activeTab === 'registry') {
            this.renderRegistryTab();
        }
    },

    // Toggle main content vs dropzone states when file uploaded/cleared
    toggleEmptyState: function(isEmpty) {
        const mainContent = document.getElementById('appDashboardWrapper');
        const uploadArea = document.getElementById('uploadViewWrapper');

        if (isEmpty) {
            mainContent.style.display = 'none';
            uploadArea.style.display = 'block';
        } else {
            mainContent.style.display = 'block';
            uploadArea.style.display = 'none';
        }
    },

    // Modal view helper
    toggleModal: function(modalId, show) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (show) {
            modal.classList.add('active');
        } else {
            modal.classList.remove('active');
        }
    },

    // Floating notifications
    showToast: function(message, type = 'success') {
        const container = document.getElementById('toastNotificationContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = '<i class="fa-solid fa-circle-check" style="color: var(--primary);"></i>';
        if (type === 'error') {
            icon = '<i class="fa-solid fa-circle-xmark" style="color: var(--accent-red);"></i>';
        } else if (type === 'warning') {
            icon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-orange);"></i>';
        }

        toast.innerHTML = `${icon} <span>${HtmlSafety.escape(message)}</span>`;
        container.appendChild(toast);

        // Slide away and delete after 3s
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => {
                if (toast.parentNode) container.removeChild(toast);
            }, 300);
        }, 3000);
    },

    // Download two separate sample files: المرتبات and المؤثرات
    downloadSampleWorkbook: function() {
        // --- File 1: نموذج_المرتبات.xlsx ---
        const salariesHeaders = ['الرقم الوظيفي', 'اسم الموظف', 'القسم', 'الراتب الأساسي', 'البدلات', 'الخصومات', 'التأمينات الاجتماعية GOSI', 'الضرائب'];
        const salariesData = [
            ['EMP0001', 'سلمان عبد العزيز العتيبي', 'التقنية', 12500, 3200, 200, 1125, 0],
            ['EMP0002', 'ياسر محمد القحطاني', 'المبيعات', 7500, 1500, 1500, 675, 0],
            ['EMP0003', 'مها علي الشهري', 'الموارد البشرية', 9000, 2000, 0, 810, 0],
            ['EMP0004', 'طارق عبد الله الحربي', 'التقنية', 16000, 4000, 500, 1440, 800],
            ['EMP0005', 'ريما سعد الدوسري', 'المالية', 10500, 2200, 100, 945, 0]
        ];
        const wb1 = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet([salariesHeaders, ...salariesData]);
        ws1['!views'] = [{ RTL: true }];
        ws1['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb1, ws1, 'المرتبات');
        XLSX.writeFile(wb1, 'نموذج_المرتبات.xlsx');

        // --- File 2: نموذج_المؤثرات.xlsx ---
        const adjustmentsHeaders = ['الرقم الوظيفي', 'اسم الموظف', 'ص/ الموظف', 'ح/ الموظف'];
        const adjustmentsData = [
            ['EMP0001', 'سلمان عبد العزيز العتيبي', 1500, 0],
            ['EMP0002', 'ياسر محمد القحطاني', 0, 500],
            ['EMP0003', 'مها علي الشهري', 800, 200],
            ['EMP0004', 'طارق عبد الله الحربي', 2000, 0],
            ['EMP0005', 'ريما سعد الدوسري', 0, 0],
            ['EMP0006', 'أحمد فهد الشمري', 1200, 300]
        ];
        const wb2 = XLSX.utils.book_new();
        const ws2 = XLSX.utils.aoa_to_sheet([adjustmentsHeaders, ...adjustmentsData]);
        ws2['!views'] = [{ RTL: true }];
        ws2['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb2, ws2, 'المؤثرات');
        XLSX.writeFile(wb2, 'نموذج_المؤثرات.xlsx');

        this.showToast('تم تحميل نموذجين منفصلين: نموذج_المرتبات.xlsx و نموذج_المؤثرات.xlsx', 'success');
    },

    // LocalStorage management
    saveStateToStorage: function() {
        localStorage.setItem('hr_salary_state', JSON.stringify({
            workbookData: this.state.workbookData,
            activeSheetName: this.state.activeSheetName,
            rules: this.state.rules,
            companyName: this.state.companyName,
            geminiApiKey: this.state.geminiApiKey
        }));
    },

    loadStateFromStorage: function() {
        const stored = localStorage.getItem('hr_salary_state');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                this.state.workbookData = parsed.workbookData;
                this.state.rules = parsed.rules || this.state.rules;
                this.state.companyName = parsed.companyName || 'INFARM';
                this.state.geminiApiKey = parsed.geminiApiKey || '';

                // Validate/fix activeSheetName: prefer merged sheet if available
                if (this.state.workbookData) {
                    const savedSheets = Object.keys(this.state.workbookData);
                    console.log('[HR] loadStateFromStorage - الأوراق المستعادة:', savedSheets);
                    if (savedSheets.includes('مسير الرواتب المدمج')) {
                        this.state.activeSheetName = 'مسير الرواتب المدمج';
                        console.log('[HR] loadStateFromStorage - تم تعيين الورقة المدمجة كنشطة');
                    } else if (savedSheets.includes(parsed.activeSheetName)) {
                        this.state.activeSheetName = parsed.activeSheetName;
                    } else {
                        this.state.activeSheetName = savedSheets[0] || '';
                        console.warn('[HR] loadStateFromStorage - الورقة المحفوظة غير موجودة، تم الرجوع إلى:', this.state.activeSheetName);
                    }
                } else {
                    this.state.activeSheetName = parsed.activeSheetName || '';
                }

                // Restore controls input bindings
                document.getElementById('calcGosiCheck').checked = this.state.rules.calculateGOSI;
                document.getElementById('gosiRateInput').value = this.state.rules.gosiRate;
                document.getElementById('calcTaxCheck').checked = this.state.rules.calculateTax;
                document.getElementById('taxRateInput').value = this.state.rules.taxRate;
                document.getElementById('allowanceMultInput').value = this.state.rules.allowanceMultiplier;
                document.getElementById('deductionMultInput').value = this.state.rules.deductionMultiplier;
                document.getElementById('overtimePerMinuteInput').value = this.state.rules.overtimePerMinute || 0;
                document.getElementById('lateDeductionPerMinuteInput').value = this.state.rules.lateDeductionPerMinute || 0;

                document.getElementById('companyNameInput').value = this.state.companyName;
                const apiKeyEl = document.getElementById('geminiApiKeyInput');
                if (apiKeyEl) apiKeyEl.value = this.state.geminiApiKey || '';

            } catch (e) {
                console.error('Failed parsing saved state:', e);
            }
        }

        // Always sync company name with the header
        const chCompanyName = document.querySelector('.ch-company-name');
        if (chCompanyName) {
            chCompanyName.textContent = this.state.companyName;
        }

        // Restore theme
        const savedTheme = localStorage.getItem('hr_salary_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButtonIcon(savedTheme);
    },

    updateThemeButtonIcon: function(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.innerHTML = theme === 'light' 
                ? '<span>الوضع الداكن</span> <i class="fa-solid fa-moon"></i>' 
                : '<span>الوضع المضيء</span> <i class="fa-solid fa-sun"></i>';
        }
    },

    clearAllData: function() {
        if (confirm('هل أنت متأكد من رغبتك في حذف كافة البيانات المرفوعة والإعدادات؟')) {
            localStorage.removeItem('hr_salary_state');
            localStorage.removeItem('hr_chat_history');
            this.state.workbookData = null;
            this.state.activeSheetName = '';
            this.state.processedData = null;
            this.state.activeEmployee = null;
            this.state.salariesFile = null;
            this.state.adjustmentsFile = null;
            this.state.chatHistory = [];

            this.toggleEmptyState(true);
            this.updateSheetTabs();
            this.loadChatHistory();

            // Reset upload UI
            ['salariesFileInput', 'adjustmentsFileInput'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            this._setUploadBadge('salariesStatusBadge', 'salariesDropzone', '', 'لم يتم الرفع بعد');
            this._setUploadBadge('adjustmentsStatusBadge', 'adjustmentsDropzone', '', 'لم يتم الرفع بعد');
            ['salariesFileInfo', 'adjustmentsFileInfo'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.style.display = 'none'; el.textContent = ''; }
            });
            this._refreshMergeBtn();

            this.showToast('تم تصفير وإعادة تهيئة النظام بنجاح', 'warning');
        }
    },

    saveChatHistory: function() {
        localStorage.setItem('hr_chat_history', JSON.stringify(this.state.chatHistory || []));
    },

    loadChatHistory: function() {
        const stored = localStorage.getItem('hr_chat_history');
        const messagesDiv = document.getElementById('chatMessagesContainer');
        if (!messagesDiv) return;

        messagesDiv.innerHTML = '';
        if (stored) {
            try {
                const history = JSON.parse(stored);
                if (history && history.length > 0) {
                    this.state.chatHistory = history;
                    history.forEach(msg => {
                        this.renderChatMessageDirectly(msg.text, msg.sender, msg.isHtml);
                    });
                    return;
                }
            } catch (e) {
                console.error('Failed to parse chat history:', e);
            }
        }
        
        // Default welcome message
        const defaultText = `مرحباً بك! أنا مساعدك المالي الذكي. لقد قمت بتحليل كشف الرواتب المرفوع بنجاح. كيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن إجمالي الرواتب، أعلى الموظفين راتباً، متوسط الرواتب بقسم معين، أو أي تحذيرات تم اكتشافها بالمسير المالي.`;
        this.state.chatHistory = [{ text: defaultText, sender: 'bot', isHtml: false }];
        this.renderChatMessageDirectly(defaultText, 'bot', false);
        this.saveChatHistory();
    },

    renderChatMessageDirectly: function(text, sender, isHtml = false) {
        const messagesDiv = document.getElementById('chatMessagesContainer');
        if (!messagesDiv) return;

        const msg = document.createElement('div');
        msg.className = `chat-msg ${sender}`;
        
        if (isHtml) {
            msg.innerHTML = HtmlSafety.sanitizeRichText(text);
        } else {
            msg.innerHTML = HtmlSafety.escapeWithBreaks(text);
        }

        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
};

// Start app on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
