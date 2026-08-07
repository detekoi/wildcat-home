/**
 * modal-a11y.js — background inertness and Escape handling for modal dialogs.
 *
 * The dialogs on this page carry `aria-modal="true"`, which tells assistive
 * technology the rest of the page is unavailable. Nothing enforced that, so Tab
 * still walked out into content AT had been told to ignore. This supplies the
 * missing mechanism.
 *
 * `inert` does the whole job: an inert subtree is removed from the accessibility
 * tree, is not focusable, and does not hit-test. With every background sibling
 * inert, tabbing past the last control goes to browser chrome and re-enters at
 * the first tabbable element — which is inside the dialog. That is what native
 * `<dialog>.showModal()` produces, so no JS Tab-wrapping trap is needed (and a
 * hand-rolled one would be worse: stale tabbable lists are a classic bug source).
 *
 * Callers keep owning `display` and the initial focus target. This module owns
 * inertness, Escape, and handing back the element to refocus on close.
 */

// Non-rendered elements — inerting them is meaningless. base.njk emits several
// <script> tags as direct children of <body>.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT']);

// Live regions must stay in the accessibility tree. Inert removes a subtree from
// it exactly like an aria-hidden ancestor would, so an inerted live region goes
// silent. Opt out by attribute rather than by id, so this keeps working if the
// announcer is renamed or another one is added.
const KEEP_ACTIVE = '[data-a11y-live-region]';

/**
 * Inerts everything except the dialog by walking to <body> and inerting each
 * level's siblings.
 *
 * The dialogs are nested inside base.njk's <main>, so <main> itself can never be
 * inerted — it contains the dialog. Inerting only the page wrapper would leave
 * the skip link, navbar and footer (all siblings of <main>, not descendants)
 * reachable by Tab. Walking up covers every level in one pass.
 *
 * @returns {Element[]} only the elements this call changed, so close() can never
 *          clear inertness that something else owns.
 */
function inertBackground(modal) {
    const changed = [];
    let node = modal;

    while (node.parentElement && node !== document.body) {
        for (const sibling of node.parentElement.children) {
            if (sibling === node) continue;
            if (SKIP_TAGS.has(sibling.tagName)) continue;
            if (sibling.matches(KEEP_ACTIVE)) continue;
            // Already inert: someone else set it, so it is not ours to restore.
            if (sibling.hasAttribute('inert')) continue;

            // Set the attribute rather than the `inert` IDL property: jsdom 29
            // does not reflect the property to the attribute, so `el.inert = true`
            // is an invisible expando under test while behaving correctly only in
            // a real browser. The attribute is authoritative in both.
            sibling.setAttribute('inert', '');
            changed.push(sibling);
        }
        node = node.parentElement;
    }

    return changed;
}

/** Open dialogs, innermost last. Escape only ever reaches the topmost. */
const stack = [];

function onDocumentKeydown(event) {
    if (event.key !== 'Escape') return;

    const top = stack[stack.length - 1];
    if (!top) return;

    event.preventDefault();
    top.onRequestClose?.();
}

export const ModalA11y = {
    /**
     * Call after the dialog is visible. Does not move focus — the caller decides
     * what to focus, since only it knows the least-destructive control.
     *
     * @param {Element} modal
     * @param {{ onRequestClose?: () => void, trigger?: Element }} [options]
     *        `trigger` defaults to whatever had focus at open time.
     */
    open(modal, { onRequestClose, trigger } = {}) {
        if (!modal || stack.some((entry) => entry.modal === modal)) return;

        // The listener is document-level, not element-scoped: an element-scoped
        // one only fires while focus is inside the dialog, and this page can lose
        // focus to <body> when a list re-renders underneath an open dialog.
        if (stack.length === 0) {
            document.addEventListener('keydown', onDocumentKeydown);
        }

        stack.push({
            modal,
            onRequestClose,
            trigger: trigger || document.activeElement,
            changed: inertBackground(modal)
        });
    },

    /**
     * Releases inertness and returns the element to refocus.
     *
     * Focus must be restored AFTER this call: focusing an element that is still
     * inert is a spec-defined no-op that neither throws nor warns, so focus would
     * silently drop to <body>. Returning the trigger rather than exposing it makes
     * that ordering hard to get wrong.
     *
     * Idempotent.
     *
     * The trigger is returned even when it is no longer in the document: a list
     * that re-renders under an open dialog can destroy it, and the caller may be
     * able to find its replacement from the detached node's dataset. Callers must
     * therefore check `isConnected` before focusing.
     *
     * @returns {Element|null} null only if the dialog was not open.
     */
    close(modal) {
        const index = stack.findIndex((entry) => entry.modal === modal);
        if (index === -1) return null;

        const [entry] = stack.splice(index, 1);
        entry.changed.forEach((el) => el.removeAttribute('inert'));

        if (stack.length === 0) {
            document.removeEventListener('keydown', onDocumentKeydown);
        }

        return entry.trigger || null;
    },

    /** Innermost first, so each close restores the layer beneath it. */
    closeAll() {
        [...stack].reverse().forEach((entry) => ModalA11y.close(entry.modal));
    },

    /** @returns {boolean} whether any dialog is currently open. */
    get isOpen() {
        return stack.length > 0;
    }
};
