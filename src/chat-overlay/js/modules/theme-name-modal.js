/**
 * Theme Name Modal Module
 *
 * An in-page prompt for naming a saved theme preset.
 *
 * Deliberately NOT window.prompt(): system dialogs (prompt/alert/confirm) silently
 * no-op inside OBS CEF browser sources, which is where this overlay actually runs.
 * The markup and class names mirror confirmDeleteTheme() in theme-carousel.js so
 * both dialogs share the styles already in css/theme-carousel.css.
 *
 * Kept in its own module rather than inside theme-carousel.js because importing
 * that file executes fetchAvailableFonts() and addPresetCSSHandler() at module
 * scope — needless side effects for a host that only wants the dialog.
 */

/**
 * Ask the user to name something, returning their answer.
 *
 * @param {Object} [options]
 * @param {string} [options.title] - Heading text.
 * @param {string} [options.message] - Explanatory copy under the heading.
 * @param {string} [options.note] - Optional warning line (e.g. a full-library caveat).
 * @param {string} [options.defaultValue] - Pre-filled, pre-selected input value.
 * @param {string} [options.confirmLabel] - Confirm button label.
 * @param {string} [options.confirmIcon] - Lucide icon name for the confirm button.
 * @param {number} [options.maxLength] - Max input length.
 * @returns {Promise<string|null>} The trimmed name, or null if cancelled.
 */
export function promptForThemeName({
    title = 'Save Theme Preset',
    message = 'Save your current settings as a reusable theme.',
    note = '',
    defaultValue = '',
    confirmLabel = 'Save Preset',
    confirmIcon = 'bookmark-plus',
    maxLength = 60
} = {}) {
    return new Promise((resolve) => {
        const escapeHtml = (str) => String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // A stale overlay would stack on top of this one and steal the backdrop click.
        const existingModal = document.querySelector('.theme-carousel-modal-overlay');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.className = 'theme-carousel-modal-overlay';
        overlay.innerHTML = `
            <div class="theme-carousel-modal">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                ${note ? `<p class="theme-carousel-modal-note">${escapeHtml(note)}</p>` : ''}
                <input type="text" class="theme-carousel-modal-input" maxlength="${maxLength}"
                       aria-label="Preset name" placeholder="Preset name">
                <div class="theme-carousel-modal-actions">
                    <button type="button" class="theme-carousel-modal-cancel">Cancel</button>
                    <button type="button" class="theme-carousel-modal-confirm">
                        <i data-lucide="${escapeHtml(confirmIcon)}"></i> ${escapeHtml(confirmLabel)}
                    </button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('.theme-carousel-modal-input');
        const confirmBtn = overlay.querySelector('.theme-carousel-modal-confirm');
        const cancelBtn = overlay.querySelector('.theme-carousel-modal-cancel');

        input.value = defaultValue;

        // Every exit path runs through settle(), so the promise resolves exactly
        // once and the document-level key listener is always torn down.
        let settled = false;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onDocumentKeydown);
            overlay.remove();
            resolve(value);
        };

        const confirm = () => {
            const value = input.value.trim();
            if (!value) return;
            settle(value);
        };

        const syncDisabled = () => {
            confirmBtn.disabled = !input.value.trim();
        };

        function onDocumentKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                settle(null);
            }
        }

        input.addEventListener('input', syncDisabled);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
            }
        });
        confirmBtn.addEventListener('click', confirm);
        cancelBtn.addEventListener('click', () => settle(null));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) settle(null);
        });
        document.addEventListener('keydown', onDocumentKeydown);

        document.body.appendChild(overlay);
        syncDisabled();

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        input.focus();
        input.select();
    });
}
