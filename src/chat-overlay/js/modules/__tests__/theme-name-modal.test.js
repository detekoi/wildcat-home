import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promptForThemeName } from '../theme-name-modal.js';

const OVERLAY = '.theme-carousel-modal-overlay';

function els() {
    return {
        overlay: document.querySelector(OVERLAY),
        input: document.querySelector('.theme-carousel-modal-input'),
        confirm: document.querySelector('.theme-carousel-modal-confirm'),
        cancel: document.querySelector('.theme-carousel-modal-cancel')
    };
}

describe('promptForThemeName', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders an overlay with a focused, pre-selected default value', () => {
        promptForThemeName({ defaultValue: 'My Preset 1' });

        const { overlay, input } = els();
        expect(overlay).not.toBeNull();
        expect(input.value).toBe('My Preset 1');
        expect(document.activeElement).toBe(input);
    });

    it('resolves the trimmed name on confirm and removes the overlay', async () => {
        const promise = promptForThemeName({ defaultValue: '' });
        const { input, confirm } = els();

        input.value = '  Cozy Night  ';
        input.dispatchEvent(new Event('input'));
        confirm.click();

        await expect(promise).resolves.toBe('Cozy Night');
        expect(document.querySelector(OVERLAY)).toBeNull();
    });

    it('resolves null on cancel', async () => {
        const promise = promptForThemeName({ defaultValue: 'X' });
        els().cancel.click();

        await expect(promise).resolves.toBeNull();
        expect(document.querySelector(OVERLAY)).toBeNull();
    });

    it('resolves null on backdrop click but not on a click inside the dialog', async () => {
        const promise = promptForThemeName({ defaultValue: 'X' });
        const { overlay } = els();

        // A click on the dialog body must not dismiss it.
        document.querySelector('.theme-carousel-modal').dispatchEvent(
            new MouseEvent('click', { bubbles: true })
        );
        expect(document.querySelector(OVERLAY)).not.toBeNull();

        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await expect(promise).resolves.toBeNull();
    });

    it('resolves null on Escape', async () => {
        const promise = promptForThemeName({ defaultValue: 'X' });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        await expect(promise).resolves.toBeNull();
        expect(document.querySelector(OVERLAY)).toBeNull();
    });

    it('confirms on Enter in the input', async () => {
        const promise = promptForThemeName({ defaultValue: 'Cozy' });
        els().input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        await expect(promise).resolves.toBe('Cozy');
    });

    it('disables confirm while the name is blank', () => {
        promptForThemeName({ defaultValue: '' });
        const { input, confirm } = els();

        expect(confirm.disabled).toBe(true);

        input.value = 'Cozy';
        input.dispatchEvent(new Event('input'));
        expect(confirm.disabled).toBe(false);

        input.value = '   ';
        input.dispatchEvent(new Event('input'));
        expect(confirm.disabled).toBe(true);
    });

    it('never calls window.prompt, which silently no-ops in OBS browser sources', () => {
        const promptSpy = vi.fn();
        vi.stubGlobal('prompt', promptSpy);

        promptForThemeName({ defaultValue: 'X' });

        expect(promptSpy).not.toHaveBeenCalled();
    });

    it('stops listening for Escape once closed, so it cannot resolve twice', async () => {
        const promise = promptForThemeName({ defaultValue: 'Cozy' });
        els().confirm.click();
        await expect(promise).resolves.toBe('Cozy');

        // A later Escape must not touch anything belonging to the closed dialog.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector(OVERLAY)).toBeNull();
    });

    it('replaces a stale overlay instead of stacking a second one', () => {
        promptForThemeName({ defaultValue: 'First' });
        promptForThemeName({ defaultValue: 'Second' });

        expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
        expect(els().input.value).toBe('Second');
    });

    it('escapes markup in caller-supplied text', () => {
        promptForThemeName({ title: '<img src=x onerror=alert(1)>', defaultValue: '' });

        const heading = document.querySelector('.theme-carousel-modal h3');
        expect(heading.querySelector('img')).toBeNull();
        expect(heading.textContent).toContain('<img');
    });

    it('shows a note only when one is supplied', () => {
        promptForThemeName({ defaultValue: '' });
        expect(document.querySelector('.theme-carousel-modal-note')).toBeNull();

        document.body.innerHTML = '';
        promptForThemeName({ defaultValue: '', note: 'Your library is full.' });
        expect(document.querySelector('.theme-carousel-modal-note').textContent).toBe('Your library is full.');
    });
});
