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

    // Resolve an identity without silently choosing duplicate or conflicting records.
    resolveDetailed: function(empCode, empName, indexes) {
        const cleanCode = empCode ? String(empCode).trim() : '';
        const normName = this.normalizeName(empName);
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
