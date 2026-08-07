import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModalA11y } from '../modal-a11y.js';

// jsdom does not implement inert *behaviour* — it neither blocks focus nor prunes
// the accessibility tree — so these assert the attribute is applied and restored.
// Whether focus is genuinely blocked is a browser concern, verified manually.
//
// Note the helper deliberately sets the attribute rather than the `inert` IDL
// property: jsdom 29 does not reflect the property to the attribute, so
// `el.inert = true` would be an invisible expando under test.

const html = `
    <a href="#main" class="skip-link">Skip</a>
    <nav class="site-navbar"><a href="/">Home</a></nav>
    <main>
        <div class="container" id="page-content">
            <button id="trigger">Open</button>
        </div>
        <div id="modalA" class="modal-container" tabindex="-1"></div>
        <div id="modalB" class="modal-container" tabindex="-1"></div>
    </main>
    <footer><a href="/x">Footer link</a></footer>
    <div id="toast-container" data-a11y-live-region></div>
    <script id="a-script"></script>
`;

const $ = (sel) => document.querySelector(sel);
const isInert = (sel) => $(sel).hasAttribute('inert');

beforeEach(() => {
    document.body.innerHTML = html;
});

afterEach(() => {
    ModalA11y.closeAll();
});

describe('ModalA11y background inerting', () => {
    it('inerts the page wrapper and the body-level chrome outside <main>', () => {
        ModalA11y.open($('#modalA'));

        // Nested inside <main>, so <main> itself can never be inerted — the walk
        // has to reach the skip link, navbar and footer at body level.
        expect(isInert('#page-content')).toBe(true);
        expect(isInert('.skip-link')).toBe(true);
        expect(isInert('.site-navbar')).toBe(true);
        expect(isInert('footer')).toBe(true);
        expect(isInert('main')).toBe(false);
        expect(isInert('#modalA')).toBe(false);
    });

    it('inerts sibling dialogs so a closed one cannot be tabbed into', () => {
        ModalA11y.open($('#modalA'));
        expect(isInert('#modalB')).toBe(true);
    });

    it('leaves live regions announceable — inert would prune them from the a11y tree', () => {
        ModalA11y.open($('#modalA'));
        expect(isInert('#toast-container')).toBe(false);
    });

    it('skips non-rendered elements', () => {
        ModalA11y.open($('#modalA'));
        expect(isInert('#a-script')).toBe(false);
    });

    it('restores exactly what it set, leaving foreign inertness alone', () => {
        $('footer').setAttribute('inert', '');   // set by something else

        ModalA11y.open($('#modalA'));
        ModalA11y.close($('#modalA'));

        expect(isInert('#page-content')).toBe(false);
        expect(isInert('.site-navbar')).toBe(false);
        expect(isInert('footer')).toBe(true);    // not ours to clear
    });

    it('keeps the background inert until the last of two stacked dialogs closes', () => {
        ModalA11y.open($('#modalA'));
        ModalA11y.open($('#modalB'));

        ModalA11y.close($('#modalB'));
        expect(isInert('#page-content')).toBe(true);

        ModalA11y.close($('#modalA'));
        expect(isInert('#page-content')).toBe(false);
    });
});

describe('ModalA11y Escape handling', () => {
    const escape = () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    it('closes on Escape', () => {
        const onRequestClose = vi.fn();
        ModalA11y.open($('#modalA'), { onRequestClose });

        escape();
        expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it('only reaches the topmost dialog', () => {
        const outer = vi.fn();
        const inner = vi.fn();
        ModalA11y.open($('#modalA'), { onRequestClose: outer });
        ModalA11y.open($('#modalB'), { onRequestClose: inner });

        escape();
        expect(inner).toHaveBeenCalledTimes(1);
        expect(outer).not.toHaveBeenCalled();
    });

    it('ignores other keys', () => {
        const onRequestClose = vi.fn();
        ModalA11y.open($('#modalA'), { onRequestClose });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onRequestClose).not.toHaveBeenCalled();
    });

    it('stops listening once closed, so a later Escape cannot fire a stale handler', () => {
        const onRequestClose = vi.fn();
        ModalA11y.open($('#modalA'), { onRequestClose });
        ModalA11y.close($('#modalA'));

        escape();
        expect(onRequestClose).not.toHaveBeenCalled();
    });
});

describe('ModalA11y trigger handoff', () => {
    it('returns the element that had focus when the dialog opened', () => {
        const trigger = $('#trigger');
        trigger.focus();

        ModalA11y.open($('#modalA'));
        expect(ModalA11y.close($('#modalA'))).toBe(trigger);
    });

    it('prefers an explicitly supplied trigger', () => {
        const trigger = $('#trigger');
        ModalA11y.open($('#modalA'), { trigger });
        expect(ModalA11y.close($('#modalA'))).toBe(trigger);
    });

    it('still returns a trigger detached by a re-render, so callers can re-query it', () => {
        const trigger = $('#trigger');
        trigger.focus();
        ModalA11y.open($('#modalA'));

        $('#page-content').innerHTML = '';   // list re-renders under the dialog

        const returned = ModalA11y.close($('#modalA'));
        expect(returned).toBe(trigger);
        expect(returned.isConnected).toBe(false);
    });

    it('is idempotent and reports open state', () => {
        ModalA11y.open($('#modalA'));
        expect(ModalA11y.isOpen).toBe(true);

        expect(ModalA11y.close($('#modalA'))).not.toBeNull();
        expect(ModalA11y.close($('#modalA'))).toBeNull();
        expect(ModalA11y.isOpen).toBe(false);
    });

    it('ignores a double open of the same dialog', () => {
        ModalA11y.open($('#modalA'));
        ModalA11y.open($('#modalA'));

        ModalA11y.close($('#modalA'));
        expect(ModalA11y.isOpen).toBe(false);
        expect(isInert('#page-content')).toBe(false);
    });
});
