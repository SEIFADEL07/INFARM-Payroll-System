// Dedicated Employee Identity Resolution Layer
const IdentityResolver = {
    // Clean name: remove prefixes like "عهدة", collapse multiple spaces, trim
    cleanName: function(name) {
        if (!name) return '';
        let cleaned = String(name).trim();
        // Remove "عهدة" prefix
        cleaned = cleaned.replace(/^عهدة\s*/, '');
        // Collapse spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    },

    // Normalize Arabic names for strict exact comparison (unify letters but keep different names separate)
    normalizeName: function(name) {
        if (!name) return '';
        const cleaned = this.cleanName(name);
        return String(cleaned)
            .toLowerCase()
            .replace(/[\s\t\n\r]+/g, ' ')
            .replace(/[أإآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[ًٌٍَُِّْ]/g, '')
            .trim();
    },

    // Build indexing maps for high-performance lookup
    buildIndexes: function(registry) {
        const byCode = new Map();
        const byName = new Map();
        const duplicateNames = new Set();
        const duplicateCodes = new Set();

        const seenNames = new Set();
        const seenCodes = new Set();

        registry.forEach(entry => {
            const code = entry.EmployeeCode ? String(entry.EmployeeCode).trim() : '';
            const normName = this.normalizeName(entry.EmployeeName);

            if (code) {
                if (seenCodes.has(code)) {
                    duplicateCodes.add(code);
                } else {
                    seenCodes.add(code);
                }
                if (!byCode.has(code)) byCode.set(code, []);
                byCode.get(code).push(entry);
            }

            if (normName) {
                if (seenNames.has(normName)) {
                    duplicateNames.add(normName);
                } else {
                    seenNames.add(normName);
                }
                if (!byName.has(normName)) byName.set(normName, []);
                byName.get(normName).push(entry);
            }
        });

        return { byCode, byName, duplicateCodes, duplicateNames };
    },

    addToIndexes: function(entry, indexes) {
        const code = entry.EmployeeCode ? String(entry.EmployeeCode).trim() : '';
        const normName = this.normalizeName(entry.EmployeeName);

        if (code) {
            if (!indexes.byCode.has(code)) indexes.byCode.set(code, []);
            indexes.byCode.get(code).push(entry);
            if (indexes.byCode.get(code).length > 1) indexes.duplicateCodes.add(code);
        }
        if (normName) {
            if (!indexes.byName.has(normName)) indexes.byName.set(normName, []);
            indexes.byName.get(normName).push(entry);
            if (indexes.byName.get(normName).length > 1) indexes.duplicateNames.add(normName);
        }
    },

    // Name similarity intelligence (Requirement 4)
    areNamesSimilar: function(name1, name2) {
        if (!name1 || !name2) return false;
        const norm1 = this.normalizeName(name1);
        const norm2 = this.normalizeName(name2);
        if (norm1 === norm2) return true;

        const words1 = norm1.split(' ').filter(w => w.length > 0);
        const words2 = norm2.split(' ').filter(w => w.length > 0);

        if (words1.length === 0 || words2.length === 0) return false;

        const [shorter, longer] = words1.length < words2.length ? [words1, words2] : [words2, words1];

        // Check if shorter is a sequential sub-sequence of longer
        let matchCount = 0;
        let sIdx = 0;
        for (let lIdx = 0; lIdx < longer.length; lIdx++) {
            if (longer[lIdx] === shorter[sIdx]) {
                matchCount++;
                sIdx++;
                if (sIdx === shorter.length) break;
            }
        }

        if (matchCount === shorter.length) {
            return true;
        }

        // Check overlap fraction
        let overlap = 0;
        const setLonger = new Set(longer);
        shorter.forEach(w => {
            if (setLonger.has(w)) overlap++;
        });

        if (overlap >= 2 && (overlap / shorter.length) >= 0.66) {
            return true;
        }

        return false;
    },

    // Resolve an identity without silently choosing duplicate or conflicting records.
    resolveDetailed: function(empCode, empName, indexes) {
        const cleanCode = empCode ? String(empCode).trim() : '';
        const normName = this.normalizeName(empName);

        // Check User-confirmed matches first (Requirement 5)
        try {
            const confirmedMatches = JSON.parse(localStorage.getItem('hr_user_confirmed_matches') || '[]');
            for (const decision of confirmedMatches) {
                if (decision.action === 'merge') {
                    const isCodeMatch = cleanCode && decision.importedCode === cleanCode;
                    const isNameMatch = normName && this.normalizeName(decision.importedName) === normName;
                    if (isCodeMatch || isNameMatch) {
                        const existingCode = String(decision.existingCode).trim();
                        const matched = indexes.byCode.get(existingCode);
                        if (matched && matched.length === 1) {
                            return { status: 'matched', entry: matched[0], matchedBy: 'user_confirmed', message: '' };
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[IdentityResolver] Failed to load user confirmed matches:', e);
        }

        const codeMatches = cleanCode ? (indexes.byCode.get(cleanCode) || []) : [];
        const nameMatches = normName ? (indexes.byName.get(normName) || []) : [];

        if (codeMatches.length > 1) {
            return {
                status: 'ambiguous',
                entry: null,
                message: `كود الموظف "${cleanCode}" مرتبط بأكثر من موظف في السجل.`
            };
        }

        if (codeMatches.length === 1) {
            const codeEntry = codeMatches[0];
            const registeredName = this.normalizeName(codeEntry.EmployeeName);
            if (normName && registeredName && registeredName !== normName) {
                return {
                    status: 'conflict',
                    entry: null,
                    message: `تعارض هوية: الكود "${cleanCode}" مسجل باسم "${codeEntry.EmployeeName}" وليس "${empName}".`
                };
            }
            return { status: 'matched', entry: codeEntry, matchedBy: 'code', message: '' };
        }

        if (nameMatches.length > 1) {
            return {
                status: 'ambiguous',
                entry: null,
                message: `اسم الموظف "${empName}" مرتبط بأكثر من سجل ولا يمكن المطابقة بالاسم فقط.`
            };
        }

        if (nameMatches.length === 1) {
            const nameEntry = nameMatches[0];
            const registeredCode = nameEntry.EmployeeCode ? String(nameEntry.EmployeeCode).trim() : '';
            if (cleanCode && registeredCode && cleanCode !== registeredCode) {
                return {
                    status: 'conflict',
                    entry: null,
                    message: `تعارض هوية: الاسم "${empName}" مسجل بالكود "${registeredCode}" وليس "${cleanCode}".`
                };
            }
            return { status: 'matched', entry: nameEntry, matchedBy: 'name', message: '' };
        }

        return { status: 'not_found', entry: null, matchedBy: null, message: '' };
    },

    // Backward-compatible lookup: conflicts and ambiguous identities never resolve.
    resolve: function(empCode, empName, indexes) {
        const result = this.resolveDetailed(empCode, empName, indexes);
        return result.status === 'matched' ? result.entry : null;
    }
};

// Expose to global window scope
window.IdentityResolver = IdentityResolver;
