import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontManager, createFontPicker } from '../font-manager.js';

describe('FontManager - resilience without theme-carousel.js', () => {
    // chat-scene-creator.html loads font-manager.js but not theme-carousel.js,
    // so window.availableFonts / window.loadGoogleFont may be undefined (or an
    // empty array, since font-manager.js itself initializes it to `[]`) at
    // runtime. None of this should ever throw, and — critically — an empty
    // local list must not prevent the remote search dropdown from opening.
    let fontManager;
    let mockConfigManager;
    let fontSearchInput;
    let fontSearchResults;

    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        document.head.querySelectorAll('link[id^="google-font-"]').forEach(el => el.remove());
        window.availableFonts = [];

        fontSearchInput = document.createElement('input');
        fontSearchResults = document.createElement('div');
        document.body.appendChild(fontSearchInput);
        document.body.appendChild(fontSearchResults);

        mockConfigManager = {
            config: { fontFamily: "'Atkinson Hyperlegible Next', sans-serif" },
            updateConfig: vi.fn((k, v) => { mockConfigManager.config[k] = v; })
        };

        fontManager = new FontManager({
            fontSearchInput,
            fontSearchResults,
            configManager: mockConfigManager
        });
    });

    afterEach(() => {
        delete window.loadGoogleFont;
        delete global.fetch;
        document.documentElement.style.removeProperty('--font-family');
    });

    it('defaults to writing --font-family on document.documentElement when no styleTarget is given (pins chat.html behavior)', () => {
        // chat.js constructs FontManager without a styleTarget option, and relies on
        // --font-family being set on the root element (the overlay IS the whole page).
        // This must keep working exactly as before.
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');

        fontManager._addAndSelectGoogleFont({
            name: 'Roboto',
            value: "'Roboto', sans-serif",
            isGoogleFont: true,
            googleFontFamily: 'Roboto'
        });

        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe("'Roboto', sans-serif");
    });

    it('scopes --font-family to a provided styleTarget instead of document.documentElement (chat-scene-creator.html usage)', () => {
        // Regression: mounting a FontManager-backed picker inside a larger page (the Scene
        // Creator) must not restyle that page's own chrome (nav/body/labels), which also
        // reads --font-family from the root element.
        const scopedTarget = document.createElement('div');
        document.body.appendChild(scopedTarget);

        const scopedManager = new FontManager({
            fontSearchInput: document.createElement('input'),
            fontSearchResults: document.createElement('div'),
            configManager: {
                config: {},
                updateConfig: vi.fn(function (k, v) { this.config[k] = v; })
            },
            styleTarget: scopedTarget
        });

        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');

        scopedManager._addAndSelectGoogleFont({
            name: 'Orbitron',
            value: "'Orbitron', sans-serif",
            isGoogleFont: true,
            googleFontFamily: 'Orbitron'
        });

        // Set on the scoped element...
        expect(scopedTarget.style.getPropertyValue('--font-family')).toBe("'Orbitron', sans-serif");
        // ...and NOT on the page root.
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
    });

    it('does not throw when window.availableFonts is undefined during a remote font search', async () => {
        // Simulate the exact failure mode: carousel script never ran, so this global
        // was never initialized (or something else cleared it).
        window.availableFonts = undefined;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { name: 'Roboto', value: "'Roboto', sans-serif", isGoogleFont: true, googleFontFamily: 'Roboto', category: 'sans-serif' }
            ])
        });

        fontSearchResults.classList.add('visible');

        let caught = null;
        try {
            await fontManager._fetchRemoteFonts('roboto', 'roboto');
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeNull();
        // The remote result should still render once fetched.
        expect(fontSearchResults.textContent).toContain('Roboto');
    });

    it('opens the dropdown and renders remote results when typing, even though the local list is empty (regression)', async () => {
        // Regression for a follow-up bug in the first fix: `_openFontDropdown`
        // early-returned on `!window.availableFonts?.length`, which is true for
        // an EMPTY ARRAY just as much as for `undefined`. That guard fired on
        // every keystroke, so the dropdown never opened and _fetchRemoteFonts
        // was never reached — "does not throw" tests alone couldn't catch this
        // because they called the private fetch method directly, bypassing the
        // guard entirely. This test drives the real 'input' event instead.
        expect(window.availableFonts).toEqual([]);

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { name: 'Orbitron', value: "'Orbitron', sans-serif", isGoogleFont: true, googleFontFamily: 'Orbitron', category: 'display' },
                { name: 'Orbit', value: "'Orbit', sans-serif", isGoogleFont: true, googleFontFamily: 'Orbit', category: 'display' }
            ])
        });

        fontSearchInput.value = 'Orbi';
        fontSearchInput.dispatchEvent(new Event('input'));

        // The dropdown must open synchronously on input, regardless of local list size.
        expect(fontSearchResults.classList.contains('visible')).toBe(true);
        expect(fontSearchResults.querySelector('.font-search-loading')).not.toBeNull();

        // Wait past the 300ms debounce plus the mocked fetch/json microtasks.
        await new Promise(resolve => setTimeout(resolve, 450));

        const items = fontSearchResults.querySelectorAll('.font-search-result[role="option"]');
        const names = Array.from(items).map(el => el.textContent);
        expect(names.some(t => t.includes('Orbitron'))).toBe(true);
        expect(names.some(t => t.includes('Orbit'))).toBe(true);
        expect(fontSearchResults.textContent).toContain('More from Google Fonts');
    });

    it('loads a Google Font via an injected <link> when window.loadGoogleFont is not defined', () => {
        expect(window.loadGoogleFont).toBeUndefined();

        fontManager._addAndSelectGoogleFont({
            name: 'Roboto',
            value: "'Roboto', sans-serif",
            isGoogleFont: true,
            googleFontFamily: 'Roboto'
        });

        const link = document.getElementById('google-font-roboto');
        expect(link).not.toBeNull();
        expect(link.tagName).toBe('LINK');
        expect(link.href).toContain('fonts.googleapis.com');
    });

    it('prefers window.loadGoogleFont when the carousel script has defined it', () => {
        window.loadGoogleFont = vi.fn();

        fontManager._addAndSelectGoogleFont({
            name: 'Roboto',
            value: "'Roboto', sans-serif",
            isGoogleFont: true,
            googleFontFamily: 'Roboto'
        });

        expect(window.loadGoogleFont).toHaveBeenCalledWith('Roboto', undefined);
        // No fallback <link> should be injected when the carousel handles it.
        expect(document.getElementById('google-font-roboto')).toBeNull();
    });
});

describe('createFontPicker - end-to-end remote font selection (chat-scene-creator.html usage)', () => {
    let container;

    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        document.head.querySelectorAll('link[id^="google-font-"]').forEach(el => el.remove());
        window.availableFonts = [];
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        delete window.loadGoogleFont;
        delete global.fetch;
        document.documentElement.style.removeProperty('--font-family');
    });

    it('does not write --font-family on document.documentElement even without an explicit styleTarget (self-contained default)', async () => {
        // createFontPicker's own default styleTarget is its wrapper element, not the page
        // root, so a caller that forgets to pass styleTarget still can't restyle the host page.
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { name: 'Orbitron', value: "'Orbitron', sans-serif", isGoogleFont: true, googleFontFamily: 'Orbitron', category: 'display' }
            ])
        });

        const picker = createFontPicker(container, { initialValue: "'Inter', sans-serif" });
        picker.input.value = 'Orbi';
        picker.input.dispatchEvent(new Event('input'));
        await new Promise(resolve => setTimeout(resolve, 450));

        const resultItem = container.querySelector('.font-search-result[role="option"]');
        expect(resultItem).not.toBeNull();
        resultItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(picker.getValue()).toBe("'Orbitron', sans-serif");
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
    });

    it('clicking a remote result pushes it into window.availableFonts, applies it to the picker config, and loads its stylesheet', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { name: 'Orbitron', value: "'Orbitron', sans-serif", isGoogleFont: true, googleFontFamily: 'Orbitron', category: 'display' }
            ])
        });

        const picker = createFontPicker(container, {
            initialValue: "'Atkinson Hyperlegible Next', sans-serif"
        });

        picker.input.value = 'Orbi';
        picker.input.dispatchEvent(new Event('input'));

        await new Promise(resolve => setTimeout(resolve, 450));

        const resultItem = container.querySelector('.font-search-result[role="option"]');
        expect(resultItem).not.toBeNull();
        expect(resultItem.textContent).toContain('Orbitron');

        // Selection is bound on mousedown (so it fires before the input's blur).
        resultItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        // 1) Pushed into window.availableFonts
        expect(window.availableFonts.some(f => f.name === 'Orbitron')).toBe(true);
        // 2) Applied to config (surfaced via getValue(), which reads the picker's config)
        expect(picker.getValue()).toBe("'Orbitron', sans-serif");
        // 3) Loaded via the ensureGoogleFontLoaded fallback (no window.loadGoogleFont on this page)
        expect(document.getElementById('google-font-orbitron')).not.toBeNull();
    });
});
