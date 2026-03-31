/**
 * Font Manager Module
 * Handles font selection, search dropdown, and remote Google Font discovery
 */

export class FontManager {
    /**
     * @param {Object} opts
     * @param {HTMLInputElement} opts.fontSearchInput - The search input element
     * @param {HTMLElement}      opts.fontSearchResults - The dropdown results container
     * @param {HTMLButtonElement} opts.prevFontBtn - Previous font button
     * @param {HTMLButtonElement} opts.nextFontBtn - Next font button
     * @param {Object}           opts.configManager - ConfigManager instance
     * @param {Function}         opts.onFontChange - Callback when font changes (for preview updates)
     */
    constructor({ fontSearchInput, fontSearchResults, prevFontBtn, nextFontBtn, configManager, onFontChange }) {
        this._fontSearchInput = fontSearchInput;
        this._fontSearchResults = fontSearchResults;
        this._prevFontBtn = prevFontBtn;
        this._nextFontBtn = nextFontBtn;
        this._configManager = configManager;
        this._onFontChange = onFontChange || (() => {});

        // Internal state
        this._currentFontIndex = 0;
        this._dropdownHighlightIndex = -1;
        this._searchDebounceTimer = null;
        this._searchAbortController = null;

        this._initEventListeners();
    }

    // --- Public API ---

    get currentFontIndex() {
        return this._currentFontIndex;
    }

    set currentFontIndex(value) {
        this._currentFontIndex = value;
    }

    /**
     * Returns the CSS font-family value for the currently selected font.
     */
    getCurrentFontValue() {
        return window.availableFonts?.[this._currentFontIndex]?.value ||
            this._configManager.config.fontFamily ||
            "'Atkinson Hyperlegible Next', sans-serif";
    }

    /**
     * Sync currentFontIndex to match configManager.config.fontFamily.
     */
    syncToConfig() {
        const fontIndex = window.availableFonts?.findIndex(
            f => f.value === this._configManager.config.fontFamily
        ) ?? -1;
        this._currentFontIndex = (fontIndex !== -1)
            ? fontIndex
            : (window.availableFonts?.findIndex(f => f.value?.includes('Atkinson')) ?? 0);
    }

    /**
     * Update font display in settings panel and apply to CSS.
     */
    updateFontDisplay() {
        if (!window.availableFonts?.length) {
            console.error('Available fonts not initialized yet.');
            if (this._fontSearchInput) this._fontSearchInput.value = 'Error';
            return;
        }
        if (this._currentFontIndex < 0 || this._currentFontIndex >= window.availableFonts.length) {
            console.warn(`Invalid currentFontIndex (${this._currentFontIndex}), resetting to 0.`);
            this._currentFontIndex = 0;
        }
        const currentFont = window.availableFonts[this._currentFontIndex];
        if (!currentFont) {
            console.error(`Could not find font at index ${this._currentFontIndex}`);
            if (this._fontSearchInput) this._fontSearchInput.value = 'Error';
            return;
        }

        if (this._fontSearchInput) this._fontSearchInput.value = currentFont.name;
        this._configManager.updateConfig('fontFamily', currentFont.value);
        document.documentElement.style.setProperty('--font-family', currentFont.value);

        // Load Google Font if applicable
        if (currentFont.isGoogleFont && currentFont.googleFontFamily && window.loadGoogleFont) {
            window.loadGoogleFont(currentFont.googleFontFamily, currentFont.googleFontUrl);
        }

        // Close dropdown when cycling
        this.closeFontDropdown();
        this._onFontChange();
    }

    /**
     * Close the font search dropdown.
     */
    closeFontDropdown() {
        if (this._fontSearchResults) {
            this._fontSearchResults.classList.remove('visible');
            this._fontSearchResults.innerHTML = '';
        }
        this._dropdownHighlightIndex = -1;
        clearTimeout(this._searchDebounceTimer);
        if (this._searchAbortController) {
            this._searchAbortController.abort();
            this._searchAbortController = null;
        }
    }

    /**
     * Dynamically add a Google Font and select it.
     * Public wrapper for use by ThemeManager when applying generated themes.
     * @param {Object|string} fontOrName - A font object or font name string
     */
    addAndSelectGoogleFont(fontOrName) {
        this._addAndSelectGoogleFont(fontOrName);
    }

    // --- Private Methods ---

    static _PROD_PROXY = 'https://theme-proxy-361545143046.us-central1.run.app';
    static _LOCAL_PROXY = 'http://localhost:8091';

    /**
     * Get the proxy API base URL for font search.
     * Returns local URL first; caller should fallback to prod on failure.
     */
    _getFontSearchApiUrl() {
        const isLocalhost = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '';
        return isLocalhost ? FontManager._LOCAL_PROXY : FontManager._PROD_PROXY;
    }

    /**
     * Create a font result item element.
     */
    _createFontResultItem(font) {
        const item = document.createElement('div');
        item.className = 'font-search-result';
        item.setAttribute('role', 'option');
        item.dataset.fontValue = font.value;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = font.name;
        nameSpan.style.fontFamily = font.value;
        if (font.isGoogleFont && font.googleFontFamily && window.loadGoogleFont) {
            window.loadGoogleFont(font.googleFontFamily, font.googleFontUrl);
        }
        item.appendChild(nameSpan);

        if (font.custom || font.isGoogleFont) {
            const catSpan = document.createElement('span');
            catSpan.className = 'font-category';
            catSpan.textContent = font.isGoogleFont ? '(Google)' : '(Custom)';
            item.appendChild(catSpan);
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._selectFontFromDropdown(font);
        });
        return item;
    }

    /**
     * Open the font search dropdown with local + remote results.
     */
    _openFontDropdown(query) {
        if (!this._fontSearchResults || !window.availableFonts?.length) return;
        const q = query.toLowerCase().trim();
        const matches = q
            ? window.availableFonts.filter(f => f.name.toLowerCase().includes(q))
            : window.availableFonts;

        this._fontSearchResults.innerHTML = '';
        this._dropdownHighlightIndex = -1;

        // Cancel any in-flight remote search
        if (this._searchAbortController) {
            this._searchAbortController.abort();
            this._searchAbortController = null;
        }
        clearTimeout(this._searchDebounceTimer);

        if (matches.length === 0 && !q) {
            const noResult = document.createElement('div');
            noResult.className = 'font-search-result';
            noResult.textContent = 'No fonts found';
            noResult.style.color = '#888';
            noResult.style.cursor = 'default';
            this._fontSearchResults.appendChild(noResult);
        } else {
            matches.forEach((font) => {
                this._fontSearchResults.appendChild(this._createFontResultItem(font));
            });
        }

        // If there's a search query ≥ 2 chars, also search remotely
        if (q && q.length >= 2) {
            const loadingEl = document.createElement('div');
            loadingEl.className = 'font-search-loading';
            loadingEl.id = 'font-remote-loading';
            loadingEl.innerHTML = '<div class="mini-spinner"></div>Searching Google Fonts…';
            this._fontSearchResults.appendChild(loadingEl);

            this._searchDebounceTimer = setTimeout(() => {
                this._fetchRemoteFonts(q, query.trim());
            }, 300);
        }

        this._fontSearchResults.classList.add('visible');
    }

    /**
     * Fetch fonts from a specific proxy URL. Returns the response JSON or null.
     */
    async _fetchFromProxy(proxyUrl, query, signal) {
        const response = await fetch(
            `${proxyUrl}/api/fonts/search?q=${encodeURIComponent(query)}`,
            { signal }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data) ? data : null;
    }

    /**
     * Fetch fonts from the proxy search endpoint and append results.
     * If the primary (local) proxy is unreachable, falls back to the production proxy.
     */
    async _fetchRemoteFonts(q, originalQuery) {
        this._searchAbortController = new AbortController();
        const primaryUrl = this._getFontSearchApiUrl();

        try {
            let remoteFonts = null;

            try {
                remoteFonts = await this._fetchFromProxy(primaryUrl, originalQuery, this._searchAbortController.signal);
            } catch (primaryErr) {
                if (primaryErr.name === 'AbortError') throw primaryErr;
                // Primary failed (likely local proxy not running) — try production
                if (primaryUrl !== FontManager._PROD_PROXY) {
                    console.info(`Local proxy unavailable, falling back to production proxy for font search.`);
                    remoteFonts = await this._fetchFromProxy(FontManager._PROD_PROXY, originalQuery, this._searchAbortController.signal);
                } else {
                    throw primaryErr;
                }
            }

            const loadingEl = document.getElementById('font-remote-loading');
            if (loadingEl) loadingEl.remove();

            if (!remoteFonts || remoteFonts.length === 0) return;

            const localNames = new Set(window.availableFonts.map(f => f.name.toLowerCase()));
            const newResults = remoteFonts.filter(f => !localNames.has(f.name.toLowerCase()));

            if (newResults.length === 0) return;
            if (!this._fontSearchResults?.classList.contains('visible')) return;

            const sectionLabel = document.createElement('div');
            sectionLabel.className = 'font-search-section-label';
            sectionLabel.textContent = 'More from Google Fonts';
            this._fontSearchResults.appendChild(sectionLabel);

            newResults.forEach((font) => {
                const item = document.createElement('div');
                item.className = 'font-search-result';
                item.setAttribute('role', 'option');
                item.dataset.fontValue = font.value;

                const nameSpan = document.createElement('span');
                nameSpan.textContent = font.name;
                nameSpan.style.fontFamily = font.value;
                if (font.isGoogleFont && font.googleFontFamily && window.loadGoogleFont) {
                    window.loadGoogleFont(font.googleFontFamily, font.googleFontUrl);
                }
                item.appendChild(nameSpan);

                const catSpan = document.createElement('span');
                catSpan.className = 'font-category';
                catSpan.textContent = `(${font.category || 'Google'})`;
                item.appendChild(catSpan);

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this._addAndSelectGoogleFont(font);
                });
                this._fontSearchResults.appendChild(item);
            });

        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('Remote font search failed:', err);
            const loadingEl = document.getElementById('font-remote-loading');
            if (loadingEl) loadingEl.remove();

            if (this._fontSearchResults?.classList.contains('visible')) {
                const tryItem = document.createElement('div');
                tryItem.className = 'font-search-result';
                tryItem.setAttribute('role', 'option');
                tryItem.dataset.fontValue = `'${originalQuery}', sans-serif`;

                // Build with DOM nodes to avoid XSS (CodeQL js/xss-through-dom)
                const span = document.createElement('span');
                span.style.color = 'var(--primary-light)';
                span.appendChild(document.createTextNode('Try "'));
                const strong = document.createElement('strong');
                strong.textContent = originalQuery;
                span.appendChild(strong);
                span.appendChild(document.createTextNode('" from Google Fonts'));
                tryItem.appendChild(span);

                tryItem.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this._addAndSelectGoogleFont(originalQuery);
                });
                this._fontSearchResults.appendChild(tryItem);
            }
        } finally {
            this._searchAbortController = null;
        }
    }

    /**
     * Dynamically add a Google Font and select it.
     */
    _addAndSelectGoogleFont(fontOrName) {
        let fontName, fontValue, fontObj;

        if (typeof fontOrName === 'object' && fontOrName.name) {
            fontObj = fontOrName;
            fontName = fontObj.name;
            fontValue = fontObj.value;
        } else {
            fontName = String(fontOrName);
            fontValue = `'${fontName}', sans-serif`;
            fontObj = {
                name: fontName,
                value: fontValue,
                description: `${fontName} from Google Fonts`,
                isGoogleFont: true,
                googleFontFamily: fontName
            };
        }

        if (window.loadGoogleFont) {
            window.loadGoogleFont(fontObj.googleFontFamily || fontName, fontObj.googleFontUrl);
        }

        const existingIdx = window.availableFonts.findIndex(f => f.name.toLowerCase() === fontName.toLowerCase());
        if (existingIdx === -1) {
            window.availableFonts.unshift(fontObj);
            this._currentFontIndex = 0;
        } else {
            this._currentFontIndex = existingIdx;
        }

        this.updateFontDisplay();
        this.closeFontDropdown();
        this._fontSearchInput?.blur();
    }

    /**
     * Select a font from the local dropdown results.
     */
    _selectFontFromDropdown(font) {
        const idx = window.availableFonts.findIndex(f => f.value === font.value);
        if (idx !== -1) {
            this._currentFontIndex = idx;
            this.updateFontDisplay();
        }
        this.closeFontDropdown();
        this._fontSearchInput?.blur();
    }

    /**
     * Navigate highlight within dropdown.
     */
    _highlightDropdownItem(direction) {
        const items = this._fontSearchResults?.querySelectorAll('.font-search-result[role="option"]');
        if (!items?.length) return;

        if (this._dropdownHighlightIndex >= 0 && this._dropdownHighlightIndex < items.length) {
            items[this._dropdownHighlightIndex].classList.remove('highlighted');
        }

        if (direction === 'down') {
            this._dropdownHighlightIndex = (this._dropdownHighlightIndex + 1) % items.length;
        } else {
            this._dropdownHighlightIndex = (this._dropdownHighlightIndex - 1 + items.length) % items.length;
        }

        items[this._dropdownHighlightIndex].classList.add('highlighted');
        items[this._dropdownHighlightIndex].scrollIntoView({ block: 'nearest' });
    }

    /**
     * Attach all event listeners.
     */
    _initEventListeners() {
        // Prev/next font buttons
        if (this._prevFontBtn && !this._prevFontBtn.dataset.listenerAttached) {
            this._prevFontBtn.addEventListener('click', () => {
                this._currentFontIndex = (this._currentFontIndex - 1 + (window.availableFonts?.length || 1)) % (window.availableFonts?.length || 1);
                this.updateFontDisplay();
            });
            this._prevFontBtn.dataset.listenerAttached = 'true';
        }
        if (this._nextFontBtn && !this._nextFontBtn.dataset.listenerAttached) {
            this._nextFontBtn.addEventListener('click', () => {
                this._currentFontIndex = (this._currentFontIndex + 1) % (window.availableFonts?.length || 1);
                this.updateFontDisplay();
            });
            this._nextFontBtn.dataset.listenerAttached = 'true';
        }

        // Font search input
        if (this._fontSearchInput) {
            this._fontSearchInput.addEventListener('focus', () => {
                this._fontSearchInput.select();
                this._openFontDropdown(this._fontSearchInput.value);
            });
            this._fontSearchInput.addEventListener('input', () => {
                this._openFontDropdown(this._fontSearchInput.value);
            });
            this._fontSearchInput.addEventListener('blur', () => {
                setTimeout(() => this.closeFontDropdown(), 150);
            });
            this._fontSearchInput.addEventListener('keydown', (e) => {
                if (!this._fontSearchResults?.classList.contains('visible')) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        this._openFontDropdown(this._fontSearchInput.value);
                        e.preventDefault();
                    }
                    return;
                }
                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        this._highlightDropdownItem('down');
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        this._highlightDropdownItem('up');
                        break;
                    case 'Enter':
                        e.preventDefault();
                        const items = this._fontSearchResults.querySelectorAll('.font-search-result[role="option"]');
                        let targetItem = null;
                        if (this._dropdownHighlightIndex >= 0 && this._dropdownHighlightIndex < items.length) {
                            targetItem = items[this._dropdownHighlightIndex];
                        } else if (items.length === 1) {
                            targetItem = items[0];
                        }
                        if (targetItem) {
                            targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        }
                        break;
                    case 'Escape':
                        this.closeFontDropdown();
                        const currentFont = window.availableFonts?.[this._currentFontIndex];
                        if (currentFont) this._fontSearchInput.value = currentFont.name;
                        this._fontSearchInput.blur();
                        break;
                }
            });
        }

        // React to font list updates from proxy
        document.addEventListener('fonts-updated', () => {
            console.log('Fonts updated event received in FontManager');
            const fontIndex = window.availableFonts?.findIndex(
                f => f.value === this._configManager.config.fontFamily
            ) ?? -1;
            if (fontIndex !== -1) {
                this._currentFontIndex = fontIndex;
            }
            this.updateFontDisplay();
        });
    }
}
