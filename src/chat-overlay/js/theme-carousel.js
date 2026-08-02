/**
 * Theme Carousel implementation for Twitch Chat Overlay
 *
 * This module implements a carousel to store, manage, and apply themes, including AI-generated ones.
 * It works with the theme generation system to integrate generated themes into the main theme carousel.
 *
 * theme-carousel.js is a classic (non-module) script so it can be loaded directly by any page with a
 * plain <script> tag. It reaches ES modules (theme-library-client.js, scene-sync-manager.js) via dynamic
 * import() — that works fine from classic scripts, it just isn't a module itself.
 *
 * Mounting: call `window.themeCarousel.mount(container, { onApply, showDelete })` with an empty
 * HTMLElement. mount() injects the carousel markup itself and returns `{ destroy(), refresh(),
 * selectByValue(value) }`. Only one carousel is expected to be mounted per page (chat.html and
 * chat-scene-creator.html each mount their own, in separate documents) — the legacy `window.*` globals
 * below always refer to whichever mount is most recent on this page.
 */

(function () {
    console.log('Initializing theme carousel module');

    // Define available fonts globally
    window.availableFonts = [
        // Custom fonts
        { name: 'Atkinson Hyperlegible Next', value: "'Atkinson Hyperlegible Next', sans-serif", description: 'The next generation of the acclaimed legibility-focused typeface.', custom: true, isGoogleFont: true, googleFontFamily: 'Atkinson Hyperlegible Next', googleFontUrl: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800&display=swap' },
        { name: 'EB Garamond', value: "'EB Garamond', serif", description: 'Elegant serif font with classical old-style proportions, perfect for literary or historical themes.', custom: true },
        { name: 'Tektur', value: "'Tektur', sans-serif", description: 'Modern and slightly angular typeface with a technical/sci-fi aesthetic.', custom: true },
        { name: 'MedievalSharp', value: "'MedievalSharp', cursive", description: 'Evokes a medieval/fantasy atmosphere with calligraphic details.', custom: true },
        { name: 'Press Start 2P', value: "'Press Start 2P', monospace", description: 'Pixelated retro gaming font that resembles 8-bit text.', custom: true },
        { name: 'Jacquard', value: "'Jacquard', monospace", description: 'Clean monospaced font inspired by classic computer terminals.', custom: true },
        { name: 'Chicle', value: "'Chicle', serif", description: 'Playful display font with a fun, hand-drawn character.', custom: true, isGoogleFont: true, googleFontFamily: 'Chicle' },

        // System fonts organized by categories
        // Sans-serif fonts
        { name: 'System UI', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        { name: 'Arial', value: "Arial, sans-serif", description: 'Classic sans-serif font with good readability.' },
        { name: 'Helvetica', value: "Helvetica, Arial, sans-serif", description: 'Clean modern sans-serif font widely used in design.' },
        { name: 'Verdana', value: "Verdana, Geneva, sans-serif", description: 'Sans-serif designed for good readability on screens.' },
        { name: 'Tahoma', value: "Tahoma, Geneva, sans-serif", description: 'Compact sans-serif with good readability at small sizes.' },
        { name: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif", description: 'Humanist sans-serif with distinctive character shapes.' },
        { name: 'Calibri', value: "Calibri, sans-serif", description: 'Modern sans-serif with rounded details and good readability.' },

        // Serif fonts
        { name: 'Times New Roman', value: "'Times New Roman', Times, serif", description: 'Classic serif font with traditional letterforms.' },
        { name: 'Georgia', value: "Georgia, serif", description: 'Elegant serif font designed for screen readability.' },
        { name: 'Palatino', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", description: 'Elegant serif based on Renaissance letterforms.' },
        { name: 'Garamond', value: "Garamond, Baskerville, 'Baskerville Old Face', serif", description: 'Classical serif with elegant proportions.' }, // Note: EB Garamond is custom/imported

        // Monospace fonts
        { name: 'Courier New', value: "'Courier New', Courier, monospace", description: 'Classic monospaced font resembling typewriter text.' },
        { name: 'Consolas', value: "'Consolas', monaco, monospace", description: 'Modern monospaced font designed for coding.' },
        { name: 'Lucida Console', value: "'Lucida Console', Monaco, monospace", description: 'Clear monospace font with good readability.' },

        // Display/Decorative fonts that are commonly available
        { name: 'Impact', value: "Impact, Haettenschweiler, sans-serif", description: 'Bold condensed sans-serif font, often used for headlines.' },
        { name: 'Comic Sans MS', value: "'Comic Sans MS', cursive", description: 'Casual script-like font with a friendly appearance.' },
        { name: 'Arial Black', value: "'Arial Black', Gadget, sans-serif", description: 'Extra bold version of Arial for strong emphasis.' }
    ];
    console.log('Available fonts defined globally in theme-carousel.js');

    // The built-in, non-generated themes. Never mutated in place — always spread
    // into a fresh window.availableThemes so a stray unshift() elsewhere can't
    // corrupt the canonical list.
    const DEFAULT_THEMES = [
        {
            name: 'Default Dark',
            value: 'default',
            bgColor: '#121212',
            bgColorOpacity: 0.85,
            borderColor: '#9147ff',
            textColor: '#efeff1',
            usernameColor: '#9147ff',
            timestampColor: '#adadb8',
            pronounBadgeColor: '#adadb8',
            fontFamily: "'Atkinson Hyperlegible Next', sans-serif",
            borderRadius: 'Subtle',
            borderRadiusValue: '8px',
            boxShadow: 'Soft',
            boxShadowValue: 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
            backgroundImage: null,
            description: 'Classic Twitch purple accents on a dark background. Balanced and readable.'
        },
        {
            name: 'Default Light',
            value: 'light-theme',
            bgColor: '#ffffff',
            bgColorOpacity: 0.9,
            borderColor: '#cccccc',
            textColor: '#1a1a1a',
            usernameColor: '#9147ff',
            timestampColor: '#737373',
            pronounBadgeColor: '#737373',
            fontFamily: "'Atkinson Hyperlegible Next', sans-serif",
            borderRadius: 'Subtle',
            borderRadiusValue: '8px',
            boxShadow: 'Soft',
            boxShadowValue: 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
            backgroundImage: null,
            description: 'A clean, bright theme with dark text on a light background.'
        },
        {
            name: 'Natural',
            value: 'natural-theme',
            bgColor: '#f5f2e6',
            bgColorOpacity: 0.9,
            borderColor: '#7e6852',
            textColor: '#4e3629',
            usernameColor: '#508d69',
            timestampColor: '#aca192',
            pronounBadgeColor: '#aca192',
            fontFamily: "'EB Garamond', serif",
            borderRadius: 'Rounded',
            borderRadiusValue: '16px',
            boxShadow: 'Simple 3D',
            boxShadowValue: 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px',
            backgroundImage: null,
            description: 'Earthy tones with wood-like borders and a classic serif font.'
        },
        {
            name: 'Transparent Dark',
            value: 'transparent-theme',
            bgColor: 'rgba(0, 0, 0, 0)',
            bgColorOpacity: 0,
            borderColor: 'transparent',
            textColor: '#efeff1',
            usernameColor: '#00ffea',
            timestampColor: 'rgba(255, 255, 255, 0.6)',
            pronounBadgeColor: 'rgba(255, 255, 255, 0.6)',
            fontFamily: "'Atkinson Hyperlegible Next', sans-serif",
            borderRadius: 'Subtle',
            borderRadiusValue: '8px',
            boxShadow: 'none',
            boxShadowValue: 'none',
            backgroundImage: null,
            description: 'Minimalist dark theme with no background or border, only text.'
        },
        {
            name: 'Sakura Pink',
            value: 'pink-theme',
            bgColor: '#ffdeec',
            bgColorOpacity: 0.8,
            borderColor: '#ff6bcb',
            textColor: '#8e2651',
            usernameColor: '#b81670',
            timestampColor: '#d67bb2',
            pronounBadgeColor: '#d67bb2',
            fontFamily: "'Atkinson Hyperlegible Next', sans-serif",
            borderRadius: 'Rounded',
            borderRadiusValue: '16px',
            boxShadow: 'Soft',
            boxShadowValue: 'rgba(255, 107, 203, 0.2) 0px 2px 8px 0px',
            backgroundImage: null,
            description: 'Soft pink background with darker pink/berry text and accents.'
        },
        {
            name: 'Cyberpunk Night',
            value: 'cyberpunk-theme',
            bgColor: '#0c0c28',
            bgColorOpacity: 0.85,
            borderColor: '#00ffb3',
            textColor: '#00ffea',
            usernameColor: '#ff2e97',
            timestampColor: '#fffd88',
            pronounBadgeColor: '#fffd88',
            fontFamily: "'Tektur', sans-serif",
            borderRadius: 'Sharp',
            borderRadiusValue: '0px',
            boxShadow: 'Sharp',
            boxShadowValue: '8px 8px 0px 0px rgba(0, 255, 179, 0.7)',
            backgroundImage: null,
            description: 'Neon on dark blue. Tech font, sharp edges, and vibrant accents.'
        }
    ];

    const CAROUSEL_MARKUP = `
        <div class="theme-carousel-container" role="group" aria-labelledby="theme-selector-label">
            <div class="theme-cards-wrapper"></div>
        </div>
        <div class="theme-preview-container">
            <div class="theme-preview" id="theme-preview"></div>
        </div>
        <div id="theme-info-and-nav">
            <button type="button" id="prev-theme" class="theme-nav-btn"><i data-lucide="chevron-left"></i></button>
            <div id="theme-details">
                <span id="selected-theme-name">Theme Name</span>
                <details class="theme-description-details">
                    <summary>Description</summary>
                    <span id="selected-theme-description">Theme description goes here.</span>
                </details>
            </div>
            <button type="button" id="next-theme" class="theme-nav-btn"><i data-lucide="chevron-right"></i></button>
        </div>
    `;

    // --- Mount-scoped state ---------------------------------------------------
    // Only one carousel is expected to be live per page/document, so this state
    // (and the legacy window.* bridges below) always tracks the most recent mount().
    let mountedRoot = null;
    let onApplyCallback = null;
    let showDeleteCards = true;
    let generatedThemes = []; // The cloud-backed (AI-generated) themes only.
    let libraryUnsubscribe = null;
    let prevBtnHandler = null;
    let nextBtnHandler = null;

    // Lazily import the theme-library-client ES module from this classic script.
    let libraryClientPromise = null;
    function getLibraryClient() {
        if (!libraryClientPromise) {
            libraryClientPromise = import('./modules/theme-library-client.js');
        }
        return libraryClientPromise;
    }

    // Carousel API - publicly accessible functions
    const carouselAPI = {
        mount,
        addTheme: addThemeToCarousel,
        getThemes: () => generatedThemes,
        applyTheme: applyThemeFromCarousel
    };
    window.themeCarousel = carouselAPI;
    window.addThemeToCarousel = addThemeToCarousel;

    // Make key functions globally available for other classic scripts/modules
    // (chat.js, theme-generator.js, settings-panel-manager.js, font-manager.js).
    window.updateThemeDetails = updateThemeDetails;
    window.highlightActiveCard = highlightActiveCard;
    window.applyAndScrollToTheme = applyAndScrollToTheme;
    window.scrollToThemeCard = scrollToThemeCard;
    window.loadGoogleFont = loadGoogleFont;

    // window.availableThemes / window.currentThemeIndex are populated once mount()
    // runs (they need real DOM to render into). Seed availableThemes immediately
    // anyway so any code that reads it before mount() still gets the defaults
    // instead of undefined.
    window.availableThemes = DEFAULT_THEMES.slice();
    window.currentThemeIndex = 0;

    // Add CSS handler for border-radius/box-shadow preset names (independent of mounting).
    addPresetCSSHandler();

    // Fetch updated font list from proxy (independent of DOM/mounting).
    fetchAvailableFonts();

    // Dispatch readiness immediately — this used to fire at the end of DOMContentLoaded
    // init(), after default themes + fonts were both set up. Both are set up above by
    // the time this script finishes executing, so listeners (theme-generator.js) that
    // wait for this event can now safely assume window.availableThemes/availableFonts exist.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            document.dispatchEvent(new CustomEvent('theme-carousel-ready'));
            console.log('Dispatched theme-carousel-ready event');
        });
    } else {
        document.dispatchEvent(new CustomEvent('theme-carousel-ready'));
        console.log('Dispatched theme-carousel-ready event');
    }

    /**
     * Adds a style element to handle preset border-radius and box-shadow names in CSS
     */
    function addPresetCSSHandler() {
        if (document.getElementById('preset-css-handler')) return; // Already added (e.g. a remount)

        const styleElement = document.createElement('style');
        styleElement.id = 'preset-css-handler';

        styleElement.textContent = `
            /* Border radius preset value handling */
            :root[style*="--chat-border-radius: None"] {
                --chat-border-radius: 0px !important;
            }
            :root[style*="--chat-border-radius: none"] {
                --chat-border-radius: 0px !important;
            }
            :root[style*="--chat-border-radius: Subtle"] {
                --chat-border-radius: 8px !important;
            }
            :root[style*="--chat-border-radius: subtle"] {
                --chat-border-radius: 8px !important;
            }
            :root[style*="--chat-border-radius: Rounded"] {
                --chat-border-radius: 16px !important;
            }
            :root[style*="--chat-border-radius: rounded"] {
                --chat-border-radius: 16px !important;
            }
            :root[style*="--chat-border-radius: Pill"] {
                --chat-border-radius: 24px !important;
            }
            :root[style*="--chat-border-radius: pill"] {
                --chat-border-radius: 24px !important;
            }

            /* Box shadow preset value handling */
            :root[style*="--chat-box-shadow: None"],
            :root[style*="--chat-box-shadow: none"] {
                --chat-box-shadow: none !important;
            }
            :root[style*="--chat-box-shadow: Soft"],
            :root[style*="--chat-box-shadow: soft"] {
                --chat-box-shadow: rgba(99, 99, 99, 0.2) 0px 2px 8px 0px !important;
            }
            :root[style*="--chat-box-shadow: Simple 3D"],
            :root[style*="--chat-box-shadow: simple 3d"] {
                --chat-box-shadow: rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px !important;
            }
            :root[style*="--chat-box-shadow: Intense 3D"],
            :root[style*="--chat-box-shadow: intense 3d"] {
                --chat-box-shadow: rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px !important;
            }
            :root[style*="--chat-box-shadow: Sharp"],
            :root[style*="--chat-box-shadow: sharp"] {
                --chat-box-shadow: 8px 8px 0px 0px rgba(0, 0, 0, 0.9) !important;
            }
        `;

        document.head.appendChild(styleElement);
        console.log('Added preset CSS handler for border-radius and box-shadow names');
    }

    /**
     * Mount the carousel into an (expected-empty) container element.
     * @param {HTMLElement} container - Empty element to render the carousel into.
     * @param {Object} [options]
     * @param {Function} [options.onApply] - Called with the theme object whenever a
     *   theme is selected (card click, prev, next). Falls back to `window.applyTheme(theme.value)`
     *   when omitted, so chat.html's existing behavior is unaffected.
     * @param {boolean} [options.showDelete=true] - Whether generated theme cards get a delete control.
     * @returns {{destroy: Function, refresh: Function, selectByValue: Function}}
     */
    function mount(container, options = {}) {
        if (!container) {
            console.error('[ThemeCarousel] mount() called without a container element.');
            return { destroy: () => {}, refresh: () => {}, selectByValue: () => {} };
        }

        // Tear down a previous mount's listeners (if any) before taking over.
        if (libraryUnsubscribe) {
            libraryUnsubscribe();
            libraryUnsubscribe = null;
        }
        detachNavListeners();

        onApplyCallback = typeof options.onApply === 'function' ? options.onApply : null;
        showDeleteCards = options.showDelete !== false;

        container.innerHTML = CAROUSEL_MARKUP;
        mountedRoot = container;

        // The nav chevrons are <i data-lucide> tags in freshly-injected markup;
        // any page-level lucide.createIcons() ran before mount, so run it again
        // here or the arrow buttons render empty (invisible).
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        // Hosts that already show a live preview of the theme elsewhere (the scene
        // creator renders one beside the form) can drop the built-in swatch rather
        // than reserve vertical space for a second copy of the same information.
        if (options.showPreview === false) {
            const previewContainer = container.querySelector('.theme-preview-container');
            if (previewContainer) previewContainer.remove();
        }

        // Reset to the default catalog; generated themes get prepended once the
        // library (cache, then cloud) loads below.
        generatedThemes = [];
        window.availableThemes = DEFAULT_THEMES.slice();
        window.currentThemeIndex = 0;

        attachNavListeners();
        renderCarousel();

        // Show the initially selected theme's name/description straight away rather
        // than leaving the placeholder text visible until the first selection.
        if (window.availableThemes[window.currentThemeIndex]) {
            updateThemeDetails(window.availableThemes[window.currentThemeIndex]);
        }

        initializeThemeLibrary();

        return {
            destroy: () => destroy(container),
            refresh,
            selectByValue
        };
    }

    function attachNavListeners() {
        if (!mountedRoot) return;
        const prevThemeBtn = mountedRoot.querySelector('#prev-theme');
        const nextThemeBtn = mountedRoot.querySelector('#next-theme');

        prevBtnHandler = () => {
            if (window.availableThemes && window.availableThemes.length > 0) {
                let idx = window.currentThemeIndex !== undefined ? window.currentThemeIndex : 0;
                idx = (idx - 1 + window.availableThemes.length) % window.availableThemes.length;
                applyAndScrollToTheme(idx);
            } else {
                console.warn('Cannot navigate previous theme: availableThemes not ready.');
            }
        };
        nextBtnHandler = () => {
            if (window.availableThemes && window.availableThemes.length > 0) {
                let idx = window.currentThemeIndex !== undefined ? window.currentThemeIndex : 0;
                idx = (idx + 1) % window.availableThemes.length;
                applyAndScrollToTheme(idx);
            } else {
                console.warn('Cannot navigate next theme: availableThemes not ready.');
            }
        };

        if (prevThemeBtn) prevThemeBtn.addEventListener('click', prevBtnHandler);
        else console.warn('Previous theme button (#prev-theme) not found during mount.');

        if (nextThemeBtn) nextThemeBtn.addEventListener('click', nextBtnHandler);
        else console.warn('Next theme button (#next-theme) not found during mount.');
    }

    function detachNavListeners() {
        if (!mountedRoot) return;
        const prevThemeBtn = mountedRoot.querySelector('#prev-theme');
        const nextThemeBtn = mountedRoot.querySelector('#next-theme');
        if (prevThemeBtn && prevBtnHandler) prevThemeBtn.removeEventListener('click', prevBtnHandler);
        if (nextThemeBtn && nextBtnHandler) nextThemeBtn.removeEventListener('click', nextBtnHandler);
        prevBtnHandler = null;
        nextBtnHandler = null;
    }

    function destroy(container) {
        if (libraryUnsubscribe) {
            libraryUnsubscribe();
            libraryUnsubscribe = null;
        }
        detachNavListeners();
        if (mountedRoot === container) {
            container.innerHTML = '';
            mountedRoot = null;
        }
    }

    function refresh() {
        renderCarousel();
        // Also reconcile with the cloud library in the background.
        getLibraryClient()
            .then(client => client.fetchThemes())
            .then(themes => applyGeneratedThemes(themes))
            .catch(err => console.warn('[ThemeCarousel] refresh() could not reach the theme library:', err));
    }

    function selectByValue(value) {
        if (!window.availableThemes) return;
        const idx = window.availableThemes.findIndex(t => t.value === value);
        if (idx !== -1) applyAndScrollToTheme(idx);
    }

    /**
     * Load the theme library: paint instantly from the offline cache, then
     * reconcile with the cloud, then subscribe for live updates. Every step
     * degrades silently — the mounted carousel never throws.
     */
    async function initializeThemeLibrary() {
        try {
            const client = await getLibraryClient();

            const cached = typeof client.getCachedThemes === 'function' ? client.getCachedThemes() : [];
            if (cached.length > 0) {
                applyGeneratedThemes(cached);
            }

            const fresh = await client.fetchThemes();
            applyGeneratedThemes(fresh);

            libraryUnsubscribe = client.subscribe((themes) => {
                applyGeneratedThemes(themes);
            });
        } catch (e) {
            console.warn('[ThemeCarousel] Theme library unavailable, continuing with local cache/defaults:', e);
        }
    }

    /**
     * Replace the generated-themes portion of window.availableThemes with a new
     * list from the library client, preserving the currently active theme
     * (by value) across the rebuild wherever possible.
     */
    function applyGeneratedThemes(themes) {
        if (!mountedRoot) return; // Mount was torn down while this resolved.

        const incoming = (Array.isArray(themes) ? themes : []).map(t => ({ ...t, isGenerated: true }));
        const activeValue = window.availableThemes?.[window.currentThemeIndex]?.value;

        generatedThemes = incoming;
        window.availableThemes = [...generatedThemes, ...DEFAULT_THEMES];

        if (activeValue) {
            const idx = window.availableThemes.findIndex(t => t.value === activeValue);
            window.currentThemeIndex = idx !== -1 ? idx : 0;
        } else if (window.currentThemeIndex === undefined || window.currentThemeIndex >= window.availableThemes.length) {
            window.currentThemeIndex = 0;
        }

        renderCarousel();
    }

    /**
     * Add a theme to the carousel and to the main theme selector.
     * Stays synchronous (returns the theme object immediately, optimistically
     * applied) because theme-generator.js calls this and uses the return value
     * synchronously. The push to the cloud library happens in the background;
     * the authoritative copy (e.g. with backgroundImage rewritten to a GCS URL)
     * is reconciled in place once it comes back.
     * @param {Object} theme - The theme object to add
     * @returns {Object} The added theme object
     */
    function addThemeToCarousel(theme) {
        console.log(`Adding theme to main carousel: ${theme.name}`);

        const existingThemeIndex = generatedThemes.findIndex(t => t.value === theme.value);
        if (existingThemeIndex >= 0) {
            console.log(`Theme ${theme.name} already exists in carousel`);
            return generatedThemes[existingThemeIndex];
        }

        const themeWithFlag = { ...theme, isGenerated: true };
        generatedThemes.unshift(themeWithFlag);

        if (window.availableThemes && Array.isArray(window.availableThemes)) {
            // Dedupe strictly by value: values are unique per generation, while
            // names legitimately repeat (the model often reuses a name for
            // similar prompts). Matching on name here used to skip the insert,
            // so applying the new theme's value fell back to the default theme.
            const existingInMainIndex = window.availableThemes.findIndex(t =>
                t.value === theme.value);

            if (existingInMainIndex === -1) {
                console.log(`Adding theme to main themes carousel: ${theme.name}`);
                window.availableThemes.unshift(themeWithFlag);
                window.currentThemeIndex = 0;
            }
        }

        document.dispatchEvent(new CustomEvent('theme-added-to-carousel', {
            detail: { theme: themeWithFlag }
        }));

        renderCarousel();

        pushThemeToCloud(themeWithFlag);

        return themeWithFlag;
    }

    /**
     * Fire-and-forget push of a newly-added theme to the cloud library. On
     * success, mutates the theme object in place with the server's authoritative
     * fields (e.g. an assigned id, backgroundImage rewritten to a GCS URL) so
     * both `generatedThemes` and `window.availableThemes` (which hold the same
     * object reference) pick it up automatically.
     */
    async function pushThemeToCloud(themeWithFlag) {
        try {
            const client = await getLibraryClient();
            const stored = await client.addTheme(themeWithFlag);
            if (stored && mountedRoot) {
                Object.assign(themeWithFlag, stored, { isGenerated: true });
                renderCarousel();
            }
        } catch (e) {
            console.warn('[ThemeCarousel] Failed to push generated theme to cloud library:', e);
        }
    }

    /**
     * Delete a generated theme: removes it locally (optimistic) and from the
     * cloud library. If the deleted theme was the active one, falls back to
     * whatever now occupies its slot (or the last theme, if it was the tail).
     */
    async function deleteGeneratedTheme(theme) {
        const id = theme.id || theme.value;

        generatedThemes = generatedThemes.filter(t => (t.id || t.value) !== id);

        if (window.availableThemes) {
            const removedIndex = window.availableThemes.findIndex(t => (t.id || t.value) === id);
            const wasActive = removedIndex === window.currentThemeIndex;

            if (removedIndex !== -1) window.availableThemes.splice(removedIndex, 1);

            if (window.currentThemeIndex >= window.availableThemes.length) {
                window.currentThemeIndex = Math.max(0, window.availableThemes.length - 1);
            }

            renderCarousel();

            if (wasActive && window.availableThemes.length > 0) {
                applyAndScrollToTheme(window.currentThemeIndex);
            }
        }

        try {
            const client = await getLibraryClient();
            await client.deleteTheme(id);
        } catch (e) {
            console.warn('[ThemeCarousel] Failed to delete theme from cloud library:', e);
        }
    }

    /**
     * Apply a theme from the carousel (legacy window.themeCarousel.applyTheme API).
     * @param {Object} theme - The theme to apply
     */
    function applyThemeFromCarousel(theme) {
        console.log(`Applying theme from carousel: ${theme.name}`);

        if (window.availableThemes && Array.isArray(window.availableThemes)) {
            const themeIndex = window.availableThemes.findIndex(t => t.value === theme.value);

            if (themeIndex >= 0) {
                if (typeof window.currentThemeIndex !== 'undefined') {
                    window.currentThemeIndex = themeIndex;
                    if (typeof window.updateThemeDisplay === 'function') {
                        window.updateThemeDisplay();
                    }
                }
            } else {
                window.availableThemes.unshift(theme);
                window.currentThemeIndex = 0;
                if (typeof window.updateThemeDisplay === 'function') {
                    window.updateThemeDisplay();
                    return;
                }
            }
        }

        if (typeof window.applyGeneratedTheme === 'function') {
            window.applyGeneratedTheme(theme);
        } else {
            applyThemeDirectly(theme);
        }
    }

    /**
     * Apply a theme directly to the DOM (fallback method)
     * @param {Object} theme - The theme to apply
     */
    function applyThemeDirectly(theme) {
        console.log(`Direct theme application for: ${theme.name}`);

        document.documentElement.style.setProperty('--chat-bg-color', theme.bgColor);
        document.documentElement.style.setProperty('--chat-border-color', theme.borderColor);
        document.documentElement.style.setProperty('--chat-text-color', theme.textColor);
        document.documentElement.style.setProperty('--username-color', theme.usernameColor);

        document.documentElement.style.setProperty('--popup-bg-color', theme.bgColor);
        document.documentElement.style.setProperty('--popup-border-color', theme.borderColor);
        document.documentElement.style.setProperty('--popup-text-color', theme.textColor);
        document.documentElement.style.setProperty('--popup-username-color', theme.usernameColor);

        if (theme.fontFamily) {
            document.documentElement.style.setProperty('--font-family', theme.fontFamily);

            if (theme.isGoogleFont && theme.googleFontFamily) {
                loadGoogleFont(theme.googleFontFamily);
            }
        }

        if (theme.backgroundImage) {
            document.documentElement.style.setProperty('--chat-bg-image', `url("${theme.backgroundImage}")`);
            document.documentElement.style.setProperty('--popup-bg-image', `url("${theme.backgroundImage}")`);
        } else {
            document.documentElement.style.setProperty('--chat-bg-image', 'none');
            document.documentElement.style.setProperty('--popup-bg-image', 'none');
        }

        if (theme.borderRadius || theme.borderRadiusValue) {
            if (typeof window.applyBorderRadius === 'function') {
                window.applyBorderRadius(theme.borderRadius || theme.borderRadiusValue);
            } else if (theme.borderRadiusValue) {
                document.documentElement.style.setProperty('--chat-border-radius', theme.borderRadiusValue);
            }
        }

        if (theme.boxShadow || theme.boxShadowValue) {
            if (typeof window.applyBoxShadow === 'function') {
                window.applyBoxShadow(theme.boxShadow || theme.boxShadowValue);
            } else if (theme.boxShadowValue) {
                document.documentElement.style.setProperty('--chat-box-shadow', theme.boxShadowValue);
            }
        }
        if (typeof window.updatePreviewFromCurrentSettings === 'function') {
            window.updatePreviewFromCurrentSettings();
        }
    }

    /**
     * Renders the theme cards into the mounted carousel's container.
     */
    function renderCarousel() {
        if (!mountedRoot) return;
        const container = mountedRoot.querySelector('.theme-carousel-container');
        if (!container) return;

        let wrapper = container.querySelector('.theme-cards-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'theme-cards-wrapper';
            container.appendChild(wrapper);
        }

        wrapper.innerHTML = '';

        if (window.availableThemes && window.availableThemes.length > 0) {
            window.availableThemes.forEach((theme, index) => {
                const card = createThemeCard(theme, index);
                wrapper.appendChild(card);
            });
        } else {
            wrapper.textContent = 'No themes available.';
        }

        highlightActiveCard(window.availableThemes[typeof window.currentThemeIndex !== 'undefined' ? window.currentThemeIndex : 0]?.value || 'default');
    }

    /**
     * Creates a theme card element for the carousel
     * @param {Object} theme - The theme object to create a card for
     * @param {number} index - The index of the theme in window.availableThemes
     * @returns {HTMLElement} The created theme card element
     */
    function createThemeCard(theme, index) {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.dataset.themeValue = theme.value;
        card.style.backgroundColor = theme.bgColor || '#121212';
        card.style.color = theme.textColor || '#efeff1';

        const textDiv = document.createElement('div');
        textDiv.className = 'theme-card-text';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'theme-name';
        nameSpan.textContent = theme.name || 'Unnamed Theme';
        textDiv.appendChild(nameSpan);

        if (index === window.currentThemeIndex) {
            card.classList.add('active');
        }

        card.addEventListener('click', () => {
            applyAndScrollToTheme(index);
        });

        card.appendChild(textDiv);

        if (theme.isGenerated && showDeleteCards) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'theme-card-delete';
            deleteBtn.setAttribute('aria-label', `Delete ${theme.name || 'theme'}`);
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteGeneratedTheme(theme);
            });
            card.appendChild(deleteBtn);
        }

        return card;
    }

    /**
     * Applies the theme at the given index and scrolls the carousel to it.
     * @param {number} index - The index of the theme in window.availableThemes.
     */
    function applyAndScrollToTheme(index) {
        if (!window.availableThemes || index < 0 || index >= window.availableThemes.length) {
            console.error("Invalid theme index for apply/scroll:", index);
            return;
        }

        const theme = window.availableThemes[index];
        if (!theme) {
            console.error("Could not find theme at index:", index);
            return;
        }

        window.currentThemeIndex = index;

        if (onApplyCallback) {
            onApplyCallback(theme);
        } else if (typeof window.applyTheme === 'function') {
            window.applyTheme(theme.value);
        } else {
            console.warn("window.applyTheme function not found.");
        }

        updateThemeDetails(theme);

        if (mountedRoot) {
            const cards = mountedRoot.querySelectorAll('.theme-card');
            cards.forEach((card, i) => {
                card.classList.toggle('active', i === index);
            });
        }

        scrollToThemeCard(index);
    }

    /**
     * Highlights the active theme card in the carousel.
     * @param {string} themeValue - The value of the theme to highlight.
     */
    function highlightActiveCard(themeValue) {
        if (!mountedRoot) return;
        const cardsWrapper = mountedRoot.querySelector('.theme-cards-wrapper');
        if (!cardsWrapper) return;

        const allCards = cardsWrapper.querySelectorAll('.theme-card');
        allCards.forEach(card => {
            card.classList.toggle('active', card.dataset.themeValue === themeValue);
        });
    }

    function updateThemeDetails(theme) {
        if (!mountedRoot) return;
        const nameElement = mountedRoot.querySelector('#selected-theme-name');
        const detailsElement = mountedRoot.querySelector('.theme-description-details');
        const descSpanElement = detailsElement ? detailsElement.querySelector('#selected-theme-description') : null;

        if (nameElement && detailsElement && descSpanElement) {
            const fullDescription = theme.description || 'No description available';

            nameElement.textContent = theme.name || 'Unnamed Theme';
            descSpanElement.textContent = fullDescription;

            detailsElement.removeAttribute('open');
        } else {
            if (!nameElement) console.error('Could not find #selected-theme-name');
            if (!detailsElement) console.error('Could not find .theme-description-details');
            if (!descSpanElement) console.error('Could not find #selected-theme-description within details');
        }
    }

    /**
     * Scrolls the carousel wrapper to bring the card at the specified index into view.
     * @param {number} index - The index of the card to scroll to.
     */
    function scrollToThemeCard(index) {
        if (!mountedRoot) return;
        const wrapper = mountedRoot.querySelector('.theme-cards-wrapper');
        if (wrapper) {
            const cards = wrapper.children;
            if (index >= 0 && index < cards.length && cards[index]) {
                const card = cards[index];
                const scrollLeft = card.offsetLeft - (wrapper.offsetWidth - card.offsetWidth) / 2;
                wrapper.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
                console.log(`[scrollToThemeCard] Scrolled to card index: ${index}`);
            } else {
                console.warn(`[scrollToThemeCard] Invalid index or card not found for index: ${index}`);
            }
        } else {
            console.warn("[scrollToThemeCard] Could not find .theme-cards-wrapper to scroll.");
        }
    }

    /**
     * Fetches available fonts from the proxy and updates the global list.
     * Reuses getProxyBaseUrl() from scene-sync-manager.js instead of hardcoding
     * a third copy of the proxy base URL resolution logic.
     */
    let fontFetchRetried = false;

    async function fetchAvailableFonts() {
        const localCustomFonts = (window.availableFonts || []).filter(f => f.custom);

        try {
            const { getProxyBaseUrl } = await import('./modules/scene-sync-manager.js');
            const API_URL = `${getProxyBaseUrl()}/fonts`;

            console.log(`Fetching fonts from: ${API_URL}`);
            const response = await fetch(API_URL);
            if (response.ok) {
                const fonts = await response.json();
                if (Array.isArray(fonts) && fonts.length > 0) {
                    const proxyFontNames = new Set(fonts.map(f => f.name));
                    const missingLocalFonts = localCustomFonts.filter(f => !proxyFontNames.has(f.name));
                    window.availableFonts = [...missingLocalFonts, ...fonts];
                    console.log(`Updated available fonts list with ${window.availableFonts.length} fonts (${missingLocalFonts.length} local + ${fonts.length} from proxy).`);

                    document.dispatchEvent(new CustomEvent('fonts-updated'));

                    if (!fontFetchRetried && !fonts.some(f => f.isGoogleFont)) {
                        fontFetchRetried = true;
                        console.log('No Google Fonts received, retrying in 3s...');
                        setTimeout(() => fetchAvailableFonts(), 3000);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to fetch fonts from proxy, using default list:', error);
        }
    }

    /**
     * Dynamically loads a Google Font by injecting a link tag.
     * @param {string} fontFamily - The font family name.
     * @param {string} [customUrl] - Optional custom Google Fonts CSS URL (for variable fonts with special axes).
     */
    function loadGoogleFont(fontFamily, customUrl) {
        if (!fontFamily) return;

        const fontId = `google-font-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
        if (document.getElementById(fontId)) return; // Already loaded

        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = customUrl || `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;700&display=swap`;
        document.head.appendChild(link);
        console.log(`Loaded Google Font: ${fontFamily}`);
    }

    // Return the carousel API for modules that load this script directly
    return carouselAPI;
})();
