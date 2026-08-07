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

import { ModalA11y } from './modal-a11y.js';

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
        // Close through ModalA11y first: confirmDeleteTheme builds an overlay with
        // this same class and registers it, so a bare remove() would strand its
        // `inert` attributes and freeze the page.
        const existingModal = document.querySelector('.theme-carousel-modal-overlay');
        if (existingModal) {
            ModalA11y.closeAll();
            existingModal.remove();
        }

        // Unique per invocation, since the markup is built with innerHTML.
        const uid = `tc-name-${Date.now().toString(36)}`;
        const overlay = document.createElement('div');
        overlay.className = 'theme-carousel-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', `${uid}-title`);
        overlay.tabIndex = -1;
        overlay.innerHTML = `
            <div class="theme-carousel-modal">
                <h3 id="${uid}-title">${escapeHtml(title)}</h3>
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
            // Release inertness before touching focus: focus() on a still-inert
            // element is a silent no-op.
            const trigger = ModalA11y.close(overlay);
            overlay.remove();
            if (trigger?.isConnected) trigger.focus();
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

        input.addEventListener('input', syncDisabled);
        input.addEventListener('keydown', (e) => {
            // isComposing: Enter confirms an IME composition and must not also submit.
            if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                confirm();
            }
        });
        confirmBtn.addEventListener('click', confirm);
        cancelBtn.addEventListener('click', () => settle(null));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) settle(null);
        });

        document.body.appendChild(overlay);
        // Previously this dialog managed only its own Escape key and never inerted
        // anything, so the whole page stayed tabbable behind an aria-modal dialog.
        ModalA11y.open(overlay, { onRequestClose: () => settle(null) });
        syncDisabled();

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        input.focus();
        input.select();
    });
}
