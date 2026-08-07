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

/** Every element this module currently has inerted, so it only ever clears its own. */
const owned = new Set();

/**
 * Recomputes inertness from scratch against the topmost dialog.
 *
 * Deliberately not incremental. Only the topmost dialog is interactive, so when
 * dialogs stack, a lower one becomes inert like any other background element.
 * Two bugs fall out of computing it this way rather than per-open:
 *
 * - Opening a dialog that a lower one had already inerted as a sibling. Applying
 *   inertness incrementally never cleared it, so the newly opened dialog came up
 *   fully inert — visible, and completely unusable.
 * - Closing a dialog that is not on top. Clearing exactly what that dialog had
 *   applied would un-inert background elements the remaining dialog still needs
 *   inert, silently reopening the containment hole.
 */
function syncInert() {
    owned.forEach((el) => el.removeAttribute('inert'));
    owned.clear();

    const top = stack[stack.length - 1];
    if (!top) return;

    inertBackground(top.modal).forEach((el) => owned.add(el));
}

function onDocumentKeydown(event) {
    // An inner control may own Escape — a combobox dismissing its popup, say —
    // and signals that by calling preventDefault(). Closing the whole dialog on
    // the same keystroke would discard the user's actual intent.
    if (event.defaultPrevented || event.key !== 'Escape') return;

    // Escape during IME composition cancels the composition, and browsers do not
    // preventDefault() it — so defaultPrevented does not cover this. Without the
    // guard, a user composing CJK text loses both the composition and the dialog.
    // keyCode 229 is the legacy signal for the same thing.
    if (event.isComposing || event.keyCode === 229) return;

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
            trigger: trigger || document.activeElement
        });
        syncInert();
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
        // Recompute rather than clearing this entry's own elements: closing a
        // dialog that is not on top must leave the remaining one contained.
        syncInert();

        if (stack.length === 0) {
            document.removeEventListener('keydown', onDocumentKeydown);
        }

        return entry.trigger || null;
    },

    /**
     * Innermost first, so each close restores the layer beneath it.
     *
     * Call this before removing a dialog element by any route other than its own
     * close path. Bare `element.remove()` on a registered dialog leaves its entry
     * on the stack with a detached modal, so the `inert` attributes it applied are
     * never cleared and the whole page stays non-interactive until a reload.
     */
    closeAll() {
        [...stack].reverse().forEach((entry) => ModalA11y.close(entry.modal));
    },

    /** @returns {boolean} whether any dialog is currently open. */
    get isOpen() {
        return stack.length > 0;
    }
};
