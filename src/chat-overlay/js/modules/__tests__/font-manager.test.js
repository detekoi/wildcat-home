import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as themeCarousel from '../../theme-carousel.js';

// Mock theme-carousel.js to simulate pages (e.g. chat-scene-creator.html) that
// load font-manager.js without mounting the full carousel. Font loading itself
// is NOT mocked — it lives in google-font-loader.js, which both pages import
// directly, so these tests exercise the real <link> injection.
vi.mock('../../theme-carousel.js', () => ({
    mount: vi.fn(),
    addTheme: vi.fn(),
    getThemes: vi.fn(() => []),
    applyTheme: vi.fn(),
    updateThemeDetails: vi.fn(),
    highlightActiveCard: vi.fn(),
    applyAndScrollToTheme: vi.fn(),
    scrollToThemeCard: vi.fn(),
    availableFonts: [],
    availableThemes: [],
    currentThemeIndex: 0,
}));

import { FontManager, createFontPicker } from '../font-manager.js';

describe('FontManager - resilience without theme-carousel.js', () => {
    // chat-scene-creator.html loads font-manager.js but not theme-carousel.js,
    // so availableFonts / loadGoogleFont may be undefined (or an
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
        delete window.availableFonts;
        // Reset the mock's availableFonts to an empty array each test
        themeCarousel.availableFonts.length = 0;

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

    it('does not throw when availableFonts is undefined during a remote font search', async () => {
        // Simulate the exact failure mode: carousel script never ran, so
        // availableFonts is empty.
        themeCarousel.availableFonts.length = 0;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { name: 'Roboto', value: "'Roboto', sans-serif", isGoogleFont: true }
            ]
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
        // early-returned on `!availableFonts?.length`, which is true for
        // an EMPTY ARRAY just as much as for `undefined`. That guard fired on
        // every keystroke, so the dropdown never opened and _fetchRemoteFonts
        // was never reached — "does not throw" tests alone couldn't catch this
        // because they called the private fetch method directly, bypassing the
        // guard entirely. This test drives the real 'input' event instead.
        themeCarousel.availableFonts.length = 0;

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

    it('loads a Google Font via an injected <link>', () => {
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

    it('does not inject a duplicate <link> when the same font is selected twice', () => {
        const font = {
            name: 'Roboto',
            value: "'Roboto', sans-serif",
            isGoogleFont: true,
            googleFontFamily: 'Roboto'
        };

        fontManager._addAndSelectGoogleFont(font);
        fontManager._addAndSelectGoogleFont(font);

        expect(document.head.querySelectorAll('#google-font-roboto').length).toBe(1);
    });

    it('updateFontDisplay suppresses _onFontChange when silent is true', () => {
        themeCarousel.availableFonts.push({ name: 'Inter', value: "'Inter', sans-serif" });
        const onFontChangeSpy = vi.spyOn(fontManager, '_onFontChange');

        fontManager.updateFontDisplay({ silent: true });
        expect(onFontChangeSpy).not.toHaveBeenCalled();

        fontManager.updateFontDisplay({ silent: false });
        expect(onFontChangeSpy).toHaveBeenCalledTimes(1);

        fontManager.updateFontDisplay();
        expect(onFontChangeSpy).toHaveBeenCalledTimes(2);
    });

    it('updateFontDisplay handles null options parameter gracefully', () => {
        themeCarousel.availableFonts.push({ name: 'Inter', value: "'Inter', sans-serif" });
        const onFontChangeSpy = vi.spyOn(fontManager, '_onFontChange');

        expect(() => fontManager.updateFontDisplay(null)).not.toThrow();
        expect(onFontChangeSpy).toHaveBeenCalled();
    });

    it('fonts-updated event triggers updateFontDisplay with silent: true', () => {
        themeCarousel.availableFonts.push({ name: 'Inter', value: "'Inter', sans-serif" });
        const onFontChangeSpy = vi.spyOn(fontManager, '_onFontChange');
        const syncToConfigSpy = vi.spyOn(fontManager, 'syncToConfig');

        document.dispatchEvent(new Event('fonts-updated'));

        expect(syncToConfigSpy).toHaveBeenCalled();
        expect(onFontChangeSpy).not.toHaveBeenCalled();
    });
});

describe('createFontPicker - end-to-end remote font selection (chat-scene-creator.html usage)', () => {
    let container;

    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        document.head.querySelectorAll('link[id^="google-font-"]').forEach(el => el.remove());
        themeCarousel.availableFonts.length = 0;
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
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

    it('clicking a remote result pushes it into availableFonts, applies it to the picker config, and loads its stylesheet', async () => {
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

        // 1) Pushed into availableFonts
        expect(themeCarousel.availableFonts.some(f => f.name === 'Orbitron')).toBe(true);
        // 2) Applied to config (surfaced via getValue(), which reads the picker's config)
        expect(picker.getValue()).toBe("'Orbitron', sans-serif");
        // 3) Stylesheet loaded via google-font-loader.js
        expect(document.getElementById('google-font-orbitron')).not.toBeNull();
    });

    it('setValue correctly handles googleFontFamily metadata and loads the stylesheet', () => {
        const picker = createFontPicker(container, {
            initialValue: "'Inter', sans-serif"
        });

        picker.setValue("'Press Start 2P', cursive", 'Press Start 2P');

        expect(picker.getValue()).toBe("'Press Start 2P', cursive");
        expect(picker.getGoogleFontFamily()).toBe('Press Start 2P');
        expect(document.getElementById('google-font-press-start-2p')).not.toBeNull();
        expect(themeCarousel.availableFonts.some(f => f.googleFontFamily === 'Press Start 2P')).toBe(true);
    });

    it('setFont adds the full font object, updates picker value, and loads stylesheet', () => {
        const picker = createFontPicker(container, {
            initialValue: "'Inter', sans-serif"
        });

        picker.setFont({
            name: 'Monoton',
            value: "'Monoton', display",
            description: 'Monoton from Google Fonts',
            isGoogleFont: true,
            googleFontFamily: 'Monoton'
        });

        expect(picker.getValue()).toBe("'Monoton', display");
        expect(picker.getGoogleFontFamily()).toBe('Monoton');
        expect(document.getElementById('google-font-monoton')).not.toBeNull();
        expect(themeCarousel.availableFonts.some(f => f.name === 'Monoton')).toBe(true);
    });

    it('setValue with a null googleFontFamily does not seed a nameless font into availableFonts', () => {
        // populateForm() passes `config.googleFontFamily ?? null` on every scene
        // switch, so null is the normal case for a scene using a built-in theme.
        const picker = createFontPicker(container, { initialValue: "'Inter', sans-serif" });

        picker.setValue("'Inter', sans-serif", null);

        expect(themeCarousel.availableFonts.some(f => !f?.name)).toBe(false);
        expect(picker.getGoogleFontFamily()).toBeNull();
    });

    it('setFont still works after a scene switch seeded the picker with a null googleFontFamily', () => {
        // Regression: selecting a scene then navigating the theme carousel onto an
        // AI-generated theme threw in _addAndSelectGoogleFont's name lookup, which
        // aborted applyThemeToForm partway — colors landed, but the carousel's
        // name/description and the live preview never updated.
        const picker = createFontPicker(container, { initialValue: "'Inter', sans-serif" });

        picker.setValue("'Inter', sans-serif", null);
        picker.setFont({
            name: 'Chicle',
            value: "'Chicle', serif",
            isGoogleFont: true,
            googleFontFamily: 'Chicle'
        });

        expect(picker.getValue()).toBe("'Chicle', serif");
        expect(picker.getGoogleFontFamily()).toBe('Chicle');
    });

    it('font search survives a malformed entry in the shared availableFonts array', async () => {
        // availableFonts is exported and mutated by several modules, so no single
        // caller owns its shape. A nameless entry must degrade to "skipped", not
        // take down the dropdown on every keystroke.
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ([
                { name: 'Orbitron', value: "'Orbitron', sans-serif", isGoogleFont: true, googleFontFamily: 'Orbitron' },
                { value: "'Nameless', sans-serif", isGoogleFont: true } // proxy returned a bad row
            ])
        });

        themeCarousel.availableFonts.push(
            { name: null, value: "'Broken', sans-serif" },
            { name: 'Orbit Local', value: "'Orbit Local', sans-serif" }
        );

        const picker = createFontPicker(container, { initialValue: "'Inter', sans-serif" });
        picker.input.value = 'Orbit';
        picker.input.dispatchEvent(new Event('input'));
        await new Promise(resolve => setTimeout(resolve, 450));

        const labels = [...container.querySelectorAll('.font-search-result[role="option"]')]
            .map(el => el.textContent);
        expect(labels.some(t => t.includes('Orbit Local'))).toBe(true);
        expect(labels.some(t => t.includes('Orbitron'))).toBe(true);
        expect(labels.some(t => t.includes('Nameless'))).toBe(false);
    });
});


