// Escaping helpers for values rendered into HTML templates.
const HtmlSafety = {
    escape: function(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeWithBreaks: function(value) {
        return this.escape(value).replace(/\r?\n/g, '<br>');
    },

    sanitizeRichText: function(value) {
        const template = document.createElement('template');
        template.innerHTML = String(value ?? '');
        const allowedTags = new Set([
            'BR', 'STRONG', 'UL', 'LI', 'TABLE', 'THEAD', 'TBODY',
            'TR', 'TH', 'TD'
        ]);

        Array.from(template.content.querySelectorAll('*')).forEach(element => {
            if (!allowedTags.has(element.tagName)) {
                if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
                    element.remove();
                } else {
                    element.replaceWith(document.createTextNode(element.textContent || ''));
                }
                return;
            }

            Array.from(element.attributes).forEach(attribute => {
                element.removeAttribute(attribute.name);
            });
        });

        return template.innerHTML;
    }
};

window.HtmlSafety = HtmlSafety;
