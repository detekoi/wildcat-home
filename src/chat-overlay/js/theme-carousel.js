export let availableFonts = DEFAULT_FONTS.slice();
export function getAvailableFonts() { return availableFonts; }
export let availableThemes = DEFAULT_THEMES.slice();
export let currentThemeIndex = 0;
export function setCurrentThemeIndex(idx) { currentThemeIndex = idx; }
export function setAvailableThemes(themes) { availableThemes = themes; }
export function getAvailableThemes() { return availableThemes; }
export function getCurrentThemeIndex() { return currentThemeIndex; }
import { DEFAULT_FONTS } from './data/font-data.js';
import { DEFAULT_THEMES } from './data/builtin-themes.js';
import * as themeLibraryClient from './modules/theme-library-client.js';

/**
 * Theme Carousel implementation for Twitch Chat Overlay
 *
 * This ES module implements a carousel to store, manage, and apply themes,
 * including AI-generated ones. It works with the theme generation system to
 * integrate generated themes into the main theme carousel.
 *
 * Mounting: call `mount(container, { onApply, showDelete })` with an empty
 * HTMLElement. mount() injects the carousel markup itself and returns
 * `{ destroy(), refresh(), selectByValue(value) }`. Only one carousel is
 * expected to be mounted per page (chat.html and chat-scene-creator.html each
 * mount their own, in separate documents).
 */

    console.log('Initializing theme carousel module');

    // Define available fonts globally
    

    // The built-in, non-generated themes. Never mutated in place — always spread
    // into a fresh availableThemes so a stray unshift() elsewhere can't
    // corrupt the canonical list.
    

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

    // Per-session client ID for echo suppression: when this page pushes an
    // activeTheme update, the onSnapshot callback on this same page sees it
    // come back; comparing updatedBy lets us skip applying our own change.
    const myClientId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `carousel-${Date.now()}-${Math.random()}`;
    let lastPushedActiveTheme = null; // Value we last pushed, to debounce.
    let suppressSync = false;          // True while applying a remote theme change.

    // Lazily import the theme-library-client ES module from this classic script.
    function getLibraryClient() { return Promise.resolve(themeLibraryClient); }

    // Carousel API - publicly accessible functions
    export function getThemes() { return generatedThemes; }
    
    

    // Make key functions globally available for other classic scripts/modules
    // (chat.js, theme-generator.js, settings-panel-manager.js, font-manager.js).
    
    
    
    
    

    // availableThemes / currentThemeIndex are populated once mount()
    // runs (they need real DOM to render into). Seed availableThemes immediately
    // anyway so any code that reads it before mount() still gets the defaults
    // instead of undefined.
    

    // Add CSS handler for border-radius/box-shadow preset names (independent of mounting).
    addPresetCSSHandler();

    // Fetch updated font list from proxy (independent of DOM/mounting).
    fetchAvailableFonts();

    // Dispatch readiness after all ES module imports in the dependency chain
    // have finished executing. queueMicrotask() defers until the current
    // microtask checkpoint — i.e. after every module in the static import
    // graph has run its top-level code and registered its listeners.
    // In the pre-ESM IIFE world the event fired synchronously at the end of
    // DOMContentLoaded init(); with ES modules that would fire before
    // chat.js / theme-generator.js register their listeners (since static
    // dependencies execute first).
    const dispatchReady = () => {
        document.dispatchEvent(new CustomEvent('theme-carousel-ready'));
        console.log('Dispatched theme-carousel-ready event');
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', dispatchReady);
    } else {
        queueMicrotask(dispatchReady);
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
        availableThemes = DEFAULT_THEMES.slice();
        currentThemeIndex = 0;

        attachNavListeners();
        renderCarousel();

        // Show the initially selected theme's name/description straight away rather
        // than leaving the placeholder text visible until the first selection.
        if (availableThemes[currentThemeIndex]) {
            updateThemeDetails(availableThemes[currentThemeIndex]);
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
            if (availableThemes && availableThemes.length > 0) {
                let idx = currentThemeIndex !== undefined ? currentThemeIndex : 0;
                idx = (idx - 1 + availableThemes.length) % availableThemes.length;
                applyAndScrollToTheme(idx);
            } else {
                console.warn('Cannot navigate previous theme: availableThemes not ready.');
            }
        };
        nextBtnHandler = () => {
            if (availableThemes && availableThemes.length > 0) {
                let idx = currentThemeIndex !== undefined ? currentThemeIndex : 0;
                idx = (idx + 1) % availableThemes.length;
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
        if (!availableThemes || !value) return;
        const idx = availableThemes.findIndex(t => t.value === value);
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

            libraryUnsubscribe = client.subscribe((themes, meta) => {
                applyGeneratedThemes(themes);

                // Cross-page active theme sync: if another page changed the
                // active theme, select it here (echo suppression via clientId).
                if (meta && meta.activeTheme && meta.activeThemeUpdatedBy !== myClientId) {
                    const currentValue = availableThemes?.[currentThemeIndex]?.value;
                    if (meta.activeTheme !== currentValue) {
                        const idx = availableThemes?.findIndex(t => t.value === meta.activeTheme) ?? -1;
                        if (idx !== -1) {
                            console.log(`[ThemeCarousel] Remote active theme change: ${meta.activeTheme}`);
                            suppressSync = true;
                            applyAndScrollToTheme(idx);
                            suppressSync = false;
                        }
                    }
                }
            });
        } catch (e) {
            console.warn('[ThemeCarousel] Theme library unavailable, continuing with local cache/defaults:', e);
        }
    }

    /**
     * Replace the generated-themes portion of availableThemes with a new
     * list from the library client, preserving the currently active theme
     * (by value) across the rebuild wherever possible.
     */
    function applyGeneratedThemes(themes) {
        if (!mountedRoot) return; // Mount was torn down while this resolved.

        const incoming = (Array.isArray(themes) ? themes : []).map(t => ({ ...t, isGenerated: true }));
        const activeValue = availableThemes?.[currentThemeIndex]?.value;

        generatedThemes = incoming;
        availableThemes = [...generatedThemes, ...DEFAULT_THEMES];

        if (activeValue) {
            const idx = availableThemes.findIndex(t => t.value === activeValue);
            currentThemeIndex = idx !== -1 ? idx : 0;
        } else if (currentThemeIndex === undefined || currentThemeIndex >= availableThemes.length) {
            currentThemeIndex = 0;
        }

        renderCarousel();
        scrollToThemeCard(currentThemeIndex);
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

        if (availableThemes && Array.isArray(availableThemes)) {
            // Dedupe strictly by value: values are unique per generation, while
            // names legitimately repeat (the model often reuses a name for
            // similar prompts). Matching on name here used to skip the insert,
            // so applying the new theme's value fell back to the default theme.
            const existingInMainIndex = availableThemes.findIndex(t =>
                t.value === theme.value);

            if (existingInMainIndex === -1) {
                console.log(`Adding theme to main themes carousel: ${theme.name}`);
                availableThemes.unshift(themeWithFlag);
                currentThemeIndex = 0;
            }
        }

        document.dispatchEvent(new CustomEvent('theme-added-to-carousel', {
            detail: { theme: themeWithFlag }
        }));

        renderCarousel();
        scrollToThemeCard(0);

        pushThemeToCloud(themeWithFlag);

        return themeWithFlag;
    }

    /**
     * Fire-and-forget push of a newly-added theme to the cloud library. On
     * success, mutates the theme object in place with the server's authoritative
     * fields (e.g. an assigned id, backgroundImage rewritten to a GCS URL) so
     * both `generatedThemes` and `availableThemes` (which hold the same
     * object reference) pick it up automatically.
     */
    async function pushThemeToCloud(themeWithFlag) {
        // Captured up front: the Object.assign below overwrites backgroundImage with
        // the server's copy, so comparing after the fact would always look equal.
        const sentImage = themeWithFlag.backgroundImage || null;
        let stored = null;
        try {
            const client = await getLibraryClient();
            stored = await client.addTheme(themeWithFlag);
            if (stored && mountedRoot) {
                Object.assign(themeWithFlag, stored, { isGenerated: true });
                renderCarousel();
            }
        } catch (e) {
            console.warn('[ThemeCarousel] Failed to push generated theme to cloud library:', e);
        }

        // The AI generator treats this push as fire-and-forget, but an explicit
        // "save my settings as a preset" needs to know whether it actually
        // persisted — an unpushed theme survives only until the page reloads.
        // Hosts listen for this keyed on detail.theme.value.
        //
        // Guarded because callers deliberately don't await this function: anything
        // that throws after the await lands as an unhandled rejection rather than
        // being caught by them.
        try {
            document.dispatchEvent(new CustomEvent('theme-library-push-result', {
                detail: {
                    theme: themeWithFlag,
                    stored,
                    ok: !!stored,
                    // The proxy nulls an oversized background image rather than failing
                    // the whole save, so a "success" can still have lost the image.
                    imageDropped: !!(stored && sentImage && !stored.backgroundImage)
                }
            }));
        } catch (e) {
            // Document torn down (page unload, test teardown) — nothing to notify.
        }
    }

    /**
     * Displays an in-page custom confirmation modal before deleting a generated theme.
     * Compatible with OBS CEF browser sources where system dialogs (confirm/alert) fail.
     * @param {Object} theme - Theme object to delete
     */
    function confirmDeleteTheme(theme) {
        if (!theme) return;

        const existingModal = document.querySelector('.theme-carousel-modal-overlay');
        if (existingModal) existingModal.remove();

        const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const overlay = document.createElement('div');
        overlay.className = 'theme-carousel-modal-overlay';
        overlay.innerHTML = `
            <div class="theme-carousel-modal">
                <h3>Delete Theme?</h3>
                <p>Are you sure you want to delete <span class="theme-name-highlight">"${escapeHtml(theme.name || 'Unnamed Theme')}"</span>? This will permanently remove it from your library and delete its background image from storage.</p>
                <div class="theme-carousel-modal-actions">
                    <button type="button" class="theme-carousel-modal-cancel">Cancel</button>
                    <button type="button" class="theme-carousel-modal-delete"><i data-lucide="trash-2"></i> Delete</button>
                </div>
            </div>
        `;

        const closeModal = () => overlay.remove();

        overlay.querySelector('.theme-carousel-modal-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        overlay.querySelector('.theme-carousel-modal-delete').addEventListener('click', () => {
            closeModal();
            deleteGeneratedTheme(theme);
        });

        document.body.appendChild(overlay);
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
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

        if (availableThemes) {
            const removedIndex = availableThemes.findIndex(t => (t.id || t.value) === id);
            const wasActive = removedIndex === currentThemeIndex;

            if (removedIndex !== -1) availableThemes.splice(removedIndex, 1);

            if (currentThemeIndex >= availableThemes.length) {
                currentThemeIndex = Math.max(0, availableThemes.length - 1);
            }

            renderCarousel();

            if (wasActive && availableThemes.length > 0) {
                applyAndScrollToTheme(currentThemeIndex);
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

        if (availableThemes && Array.isArray(availableThemes)) {
            const themeIndex = availableThemes.findIndex(t => t.value === theme.value);

            if (themeIndex >= 0) {
                if (typeof currentThemeIndex !== 'undefined') {
                    currentThemeIndex = themeIndex;
                    if (typeof window.updateThemeDisplay === 'function') {
                        window.updateThemeDisplay();
                    }
                }
            } else {
                availableThemes.unshift(theme);
                currentThemeIndex = 0;
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

        if (availableThemes && availableThemes.length > 0) {
            availableThemes.forEach((theme, index) => {
                const card = createThemeCard(theme, index);
                wrapper.appendChild(card);
            });
        } else {
            wrapper.textContent = 'No themes available.';
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        highlightActiveCard(availableThemes[typeof currentThemeIndex !== 'undefined' ? currentThemeIndex : 0]?.value || 'default');
    }

    /**
     * Creates a theme card element for the carousel
     * @param {Object} theme - The theme object to create a card for
     * @param {number} index - The index of the theme in availableThemes
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

        if (index === currentThemeIndex) {
            card.classList.add('active');
        }

        card.addEventListener('click', () => {
            applyAndScrollToTheme(index);
        });

        card.appendChild(textDiv);

        // Marks a theme the user saved from their own settings, as opposed to one
        // the AI generated. pointer-events:none so it never swallows the card click.
        if (theme.isUserPreset) {
            const badge = document.createElement('span');
            badge.className = 'theme-card-badge';
            badge.title = 'Saved from your settings';
            badge.setAttribute('aria-label', 'Saved preset');
            badge.innerHTML = '<i data-lucide="bookmark"></i>';
            card.appendChild(badge);
        }

        if (theme.isGenerated && showDeleteCards) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'theme-card-delete';
            deleteBtn.setAttribute('aria-label', `Delete ${theme.name || 'theme'}`);
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDeleteTheme(theme);
            });
            card.appendChild(deleteBtn);
        }

        return card;
    }

    /**
     * Applies the theme at the given index and scrolls the carousel to it.
     * @param {number} index - The index of the theme in availableThemes.
     */
    function applyAndScrollToTheme(index) {
        if (!availableThemes || index < 0 || index >= availableThemes.length) {
            console.error("Invalid theme index for apply/scroll:", index);
            return;
        }

        const theme = availableThemes[index];
        if (!theme) {
            console.error("Could not find theme at index:", index);
            return;
        }

        currentThemeIndex = index;

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

        // Cross-page sync: fire-and-forget push so other tabs/pages pick up
        // the selection via their onSnapshot subscription.
        // Guarded by suppressSync to prevent feedback loops when applying a
        // remote change.
        if (!suppressSync && theme.value !== lastPushedActiveTheme) {
            lastPushedActiveTheme = theme.value;
            getLibraryClient()
                .then(client => client.setActiveTheme(theme.value, myClientId))
                .catch(() => {}); // silent — sync is best-effort
        }
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

            // Add nav bar delete button for active generated themes
            let deleteNavBtn = mountedRoot.querySelector('#nav-theme-delete-btn');
            if (theme.isGenerated && showDeleteCards) {
                if (!deleteNavBtn) {
                    deleteNavBtn = document.createElement('button');
                    deleteNavBtn.type = 'button';
                    deleteNavBtn.id = 'nav-theme-delete-btn';
                    deleteNavBtn.className = 'theme-nav-delete-btn';
                    deleteNavBtn.innerHTML = '<i data-lucide="trash-2"></i> Delete';
                    nameElement.parentNode.insertBefore(deleteNavBtn, nameElement.nextSibling);
                }
                deleteNavBtn.style.display = 'inline-flex';

                // Re-bind click listener with latest theme reference
                const newBtn = deleteNavBtn.cloneNode(true);
                newBtn.innerHTML = '<i data-lucide="trash-2"></i> Delete';
                deleteNavBtn.parentNode.replaceChild(newBtn, deleteNavBtn);
                newBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    confirmDeleteTheme(theme);
                });

                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            } else if (deleteNavBtn) {
                deleteNavBtn.style.display = 'none';
            }

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
                if(wrapper.scrollTo) wrapper.scrollTo({
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
        const localCustomFonts = (availableFonts || []).filter(f => f.custom);

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
                    availableFonts = [...missingLocalFonts, ...fonts];
                    console.log(`Updated available fonts list with ${availableFonts.length} fonts (${missingLocalFonts.length} local + ${fonts.length} from proxy).`);

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


export { mount, addThemeToCarousel as addTheme, addThemeToCarousel, updateThemeDetails, highlightActiveCard, applyAndScrollToTheme, scrollToThemeCard, loadGoogleFont, applyThemeFromCarousel as applyTheme, applyThemeFromCarousel };
