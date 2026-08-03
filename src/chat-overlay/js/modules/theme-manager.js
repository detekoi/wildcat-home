/**
 * Theme Manager Module
 * Handles theme application, preview rendering, and color button highlighting
 */

import { UIHelpers } from './ui-helpers.js';
import { mount, addTheme, getThemes, applyTheme, updateThemeDetails, highlightActiveCard, applyAndScrollToTheme, scrollToThemeCard, loadGoogleFont, availableFonts, availableThemes, currentThemeIndex } from '../theme-carousel.js';

export class ThemeManager {
    /**
     * @param {Object} opts
     * @param {Object} opts.configManager - ConfigManager instance
     * @param {Object} opts.badgeManager - BadgeManager instance
     * @param {Object} opts.chatRenderer - ChatRenderer instance
     * @param {Object} opts.fontManager - FontManager instance
     * @param {Object} opts.domRefs - Bag of DOM element references
     */
    constructor({ configManager, badgeManager, chatRenderer, fontManager, domRefs }) {
        this._configManager = configManager;
        this._badgeManager = badgeManager;
        this._chatRenderer = chatRenderer;
        this._fontManager = fontManager;
        this._dom = domRefs;

        this._lastAppliedThemeValue = 'default';
    }

    // --- Public API ---

    get lastAppliedThemeValue() {
        return this._lastAppliedThemeValue;
    }

    set lastAppliedThemeValue(value) {
        this._lastAppliedThemeValue = value;
    }

    /**
     * Apply a selected theme by name/value.
     */
    applyTheme(themeName) {
        if (!availableThemes?.length) {
            console.error('Available themes not initialized yet.');
            return;
        }
        let theme = availableThemes.find(t => t.value === themeName || t.name === themeName);
        if (!theme) {
            console.warn(`Theme "${themeName}" not found. Applying default.`);
            theme = availableThemes.find(t => t.value === 'default') || availableThemes[0];
            if (!theme) return;
        }

        // Parse theme background color and opacity
        let themeBgHex = '#121212';
        let themeBgOpacity = 0.85;
        if (theme.bgColor && typeof theme.bgColor === 'string') {
            const bgColorLower = theme.bgColor.trim().toLowerCase();
            if (bgColorLower.startsWith('rgba')) {
                try {
                    const parts = bgColorLower.substring(5, bgColorLower.indexOf(')')).split(',');
                    if (parts.length === 4) {
                        const r = parseInt(parts[0].trim(), 10);
                        const g = parseInt(parts[1].trim(), 10);
                        const b = parseInt(parts[2].trim(), 10);
                        const a = parseFloat(parts[3].trim());
                        themeBgHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
                        themeBgOpacity = !isNaN(a) ? Math.max(0, Math.min(1, a)) : 0.85;
                    }
                } catch (e) {
                    console.error(`[applyTheme] Error parsing rgba string "${theme.bgColor}":`, e);
                }
            } else if (bgColorLower.startsWith('#')) {
                themeBgHex = theme.bgColor;
                themeBgOpacity = theme.bgColorOpacity ?? 0.85;
            }
        } else {
            themeBgOpacity = theme.bgColorOpacity ?? 0.85;
        }

        // Update config with theme settings
        this._configManager.updateConfig('theme', theme.value);
        this._configManager.updateConfig('bgColor', themeBgHex);
        this._configManager.updateConfig('bgColorOpacity', themeBgOpacity);
        this._configManager.updateConfig('borderColor', theme.borderColor === 'transparent' ? 'transparent' : (theme.borderColor || '#9147ff'));
        this._configManager.updateConfig('textColor', theme.textColor || '#efeff1');
        this._configManager.updateConfig('usernameColor', theme.usernameColor || '#9147ff');
        this._configManager.updateConfig('timestampColor', theme.timestampColor || '#adadb8');
        this._configManager.updateConfig('pronounBadgeColor', theme.pronounBadgeColor || 'timestamp');
        this._configManager.updateConfig('borderRadius', theme.borderRadius || theme.borderRadiusValue || '8px');
        this._configManager.updateConfig('boxShadow', theme.boxShadow || theme.boxShadowValue || 'none');
        this._configManager.updateConfig('textShadow', theme.textShadow || 'none');
        this._configManager.updateConfig('bgImage', theme.backgroundImage || null);
        this._configManager.updateConfig('bgImageOpacity', theme.bgImageOpacity ?? 0.55);

        // Clear chroma key when applying a theme (applyConfiguration handles the body class)
        this._configManager.updateConfig('chromaKey', false);

        // Enable top-fade automatically only when background is fully transparent
        if (theme.topFade !== undefined) {
            this._configManager.updateConfig('topFade', theme.topFade);
        } else {
            const isTransparentBg = theme.bgColorOpacity === 0;
            this._configManager.updateConfig('topFade', isTransparentBg);
        }
        document.body.classList.toggle('top-fade', !!this._configManager.config.topFade);
        const topFadeToggle = document.getElementById('top-fade-toggle');
        if (topFadeToggle) topFadeToggle.checked = !!this._configManager.config.topFade;

        // Update font family from theme
        if (theme.fontFamily) {
            let fontIndex = availableFonts?.findIndex(f => {
                const themeFont = typeof theme.fontFamily === 'string' ? theme.fontFamily.trim() : '';
                return (f.name?.trim().toLowerCase() === themeFont.toLowerCase()) || (f.value?.trim() === themeFont);
            }) ?? -1;

            if (fontIndex === -1) {
                if (theme.isGoogleFont && theme.googleFontFamily) {
                    // Font is a Google Font outside the local top-100 list — add it dynamically
                    const fontObj = {
                        name: theme.fontFamily,
                        value: `'${theme.googleFontFamily}', sans-serif`,
                        description: `${theme.googleFontFamily} from Google Fonts`,
                        isGoogleFont: true,
                        googleFontFamily: theme.googleFontFamily
                    };
                    this._fontManager.addAndSelectGoogleFont(fontObj);
                    // addAndSelectGoogleFont already calls updateFontDisplay; also update config
                    const addedIdx = availableFonts?.findIndex(f => f.name === fontObj.name) ?? 0;
                    this._configManager.updateConfig('fontFamily', availableFonts[addedIdx]?.value || fontObj.value);
                } else {
                    console.warn(`[applyTheme] Theme font "${theme.fontFamily}" not found in local list. Using default.`);
                    fontIndex = availableFonts?.findIndex(f => f.value?.includes('Atkinson')) ?? 0;
                    this._fontManager.currentFontIndex = fontIndex;
                    this._configManager.updateConfig('fontFamily', availableFonts[this._fontManager.currentFontIndex]?.value || "'Atkinson Hyperlegible Next', sans-serif");
                    this._fontManager.updateFontDisplay();
                }
            } else {
                this._fontManager.currentFontIndex = fontIndex;
                this._configManager.updateConfig('fontFamily', availableFonts[this._fontManager.currentFontIndex]?.value || "'Atkinson Hyperlegible Next', sans-serif");
                this._fontManager.updateFontDisplay();
            }

        } else {
            this._configManager.updateConfig('fontFamily', availableFonts?.[this._fontManager.currentFontIndex]?.value || "'Atkinson Hyperlegible Next', sans-serif");
        }

        // Apply the merged configuration visually
        this._configManager.applyConfiguration(this._configManager.config);

        // Update module config references
        this._badgeManager.config = this._configManager.config;
        this._chatRenderer.config = this._configManager.config;

        // Update UI controls
        const { bgColorInput, bgColorHex, bgOpacityInput, bgOpacityValue, borderColorInput, borderColorHex,
            textColorInput, textColorHex, usernameColorInput, usernameColorHex,
            timestampColorInput, timestampColorHex, pronounBadgeColorInput, pronounBadgeColorHex,
            bgImageOpacityInput, bgImageOpacityValue, borderRadiusPresets, boxShadowPresets, textShadowPresets } = this._dom;

        if (bgColorInput) bgColorInput.style.backgroundColor = this._configManager.config.bgColor;
        if (bgColorHex) bgColorHex.value = this._configManager.config.bgColor.toUpperCase();
        if (bgOpacityInput && bgOpacityValue) {
            const opacityPercent = Math.round(this._configManager.config.bgColorOpacity * 100);
            bgOpacityInput.value = opacityPercent;
            bgOpacityValue.textContent = `${opacityPercent}%`;
        }
        if (borderColorInput) borderColorInput.style.backgroundColor = this._configManager.config.borderColor === 'transparent' ? 'transparent' : this._configManager.config.borderColor;
        if (borderColorHex) borderColorHex.value = this._configManager.config.borderColor.toUpperCase();
        if (textColorInput) textColorInput.style.backgroundColor = this._configManager.config.textColor;
        if (textColorHex) textColorHex.value = this._configManager.config.textColor.toUpperCase();
        if (usernameColorInput) usernameColorInput.style.backgroundColor = this._configManager.config.usernameColor;
        if (usernameColorHex) usernameColorHex.value = this._configManager.config.usernameColor.toUpperCase();
        if (timestampColorInput) timestampColorInput.style.backgroundColor = this._configManager.config.timestampColor || '#adadb8';
        if (timestampColorHex) timestampColorHex.value = (this._configManager.config.timestampColor || '#adadb8').toUpperCase();
        
        if (pronounBadgeColorInput) {
            const pColor = this._configManager.config.pronounBadgeColor;
            pronounBadgeColorInput.style.backgroundColor = (pColor === 'timestamp' || !pColor) ? (this._configManager.config.timestampColor || '#adadb8') : pColor;
        }
        if (pronounBadgeColorHex) {
            const pColor = this._configManager.config.pronounBadgeColor;
            pronounBadgeColorHex.value = (pColor === 'timestamp' || !pColor) ? 'TIMESTAMP' : pColor.toUpperCase();
        }

        if (bgImageOpacityInput && bgImageOpacityValue) {
            const imageOpacityPercent = Math.round(this._configManager.config.bgImageOpacity * 100);
            bgImageOpacityInput.value = imageOpacityPercent;
            bgImageOpacityValue.textContent = `${imageOpacityPercent}%`;
        }

        // Update preset button highlights
        UIHelpers.highlightBorderRadiusButton(UIHelpers.getBorderRadiusValue(this._configManager.config.borderRadius), borderRadiusPresets);
        UIHelpers.highlightBoxShadowButton(this._configManager.config.boxShadow, boxShadowPresets);
        UIHelpers.highlightTextShadowButton(this._configManager.config.textShadow, textShadowPresets);
        this.highlightActiveColorButtons();

        this.updateThemePreview();
        this._lastAppliedThemeValue = theme.value;
    }

    /**
     * Update the theme preview display in the settings panel.
     */
    updateThemePreview() {
        const { themePreview, showTimestampsInput, bgColorHex, bgOpacityInput,
            borderColorHex, textColorHex, usernameColorHex, timestampColorHex, pronounBadgeColorHex, borderRadiusPresets,
            boxShadowPresets, textShadowPresets, fontSizeSlider, showBadgesToggle,
            chatWrapper, bgImageOpacityInput } = this._dom;

        if (!themePreview) return;

        const showTimestamps = showTimestampsInput?.checked ?? this._configManager.config?.showTimestamps ?? true;
        const bgColor = bgColorHex?.value || '#1e1e1e';
        const bgColorOpacity = (bgOpacityInput ? parseInt(bgOpacityInput.value) : (this._configManager.config?.bgColorOpacity ?? 0.85) * 100) / 100.0;
        const borderColor = borderColorHex?.value || '#444444';
        const textColor = textColorHex?.value || '#efeff1';
        const usernameColor = usernameColorHex?.value || '#9147ff';
        
        const timestampColor = timestampColorHex?.value || this._configManager.config?.timestampColor || '#adadb8';
        const pronounBtn = document.querySelector('.color-btn[data-target="pronounBadge"][data-color="timestamp"]');
        const isPronounSameAsTs = (pronounBtn && pronounBtn.classList.contains('active')) ||
                                 (this._configManager.config?.pronounBadgeColor === 'timestamp');
        const pronounBadgeColor = isPronounSameAsTs
            ? timestampColor
            : (pronounBadgeColorHex?.value || this._configManager.config?.pronounBadgeColor || '#adadb8');

        const fontFamily = this._fontManager.getCurrentFontValue();
        const activeBorderRadiusBtn = borderRadiusPresets?.querySelector('.preset-btn.active');
        const borderRadiusValue = activeBorderRadiusBtn?.dataset.value ?? this._configManager.config?.borderRadius ?? '8px';
        const borderRadius = UIHelpers.getBorderRadiusValue(borderRadiusValue);
        const activeBoxShadowBtn = boxShadowPresets?.querySelector('.preset-btn.active');
        const boxShadowValue = activeBoxShadowBtn?.dataset.value ?? this._configManager.config?.boxShadow ?? 'none';
        const boxShadow = UIHelpers.getBoxShadowValue(boxShadowValue);
        const activeTextShadowBtn = textShadowPresets?.querySelector('.preset-btn.active');
        const textShadowValue = activeTextShadowBtn?.dataset.value ?? this._configManager.config?.textShadow ?? 'none';
        const textShadow = UIHelpers.getTextShadowValue(textShadowValue);
        const bgImage = this._configManager.config?.bgImage || 'none';

        // Update chat wrapper background image
        if (chatWrapper) {
            const bgImageValue = bgImage === 'none' ? 'none' : (bgImage.startsWith('url') ? bgImage : `url("${bgImage}")`);
            document.documentElement.style.setProperty('--chat-bg-image', bgImageValue);
            document.documentElement.style.setProperty('--popup-bg-image', bgImageValue);
        }

        // Background image opacity logic
        let currentPreviewOpacity = themePreview.style.getPropertyValue('--preview-bg-image-opacity');
        let bgImageOpacity;
        if (currentPreviewOpacity !== '' && !isNaN(parseFloat(currentPreviewOpacity))) {
            bgImageOpacity = parseFloat(currentPreviewOpacity);
        } else {
            const bgImageOpacityValueFromConfig = this._configManager.config?.bgImageOpacity;
            bgImageOpacity = bgImageOpacityValueFromConfig !== undefined && bgImageOpacityValueFromConfig !== null
                ? bgImageOpacityValueFromConfig
                : (bgImageOpacityInput ? parseInt(bgImageOpacityInput.value, 10) / 100.0 : 0.55);
        }
        themePreview.style.setProperty('--preview-bg-image-opacity', bgImageOpacity.toFixed(2));

        const borderTransparentButton = document.querySelector('.color-btn[data-target="border"][data-color="transparent"]');
        const finalBorderColor = (borderTransparentButton?.classList.contains('active')) ? 'transparent' : borderColor;

        let finalBgColor;
        const bgTransparentButton = document.querySelector('.color-btn[data-target="bg"][data-color="transparent"]');
        if (bgTransparentButton?.classList.contains('active')) {
            finalBgColor = 'transparent';
        } else {
            try {
                finalBgColor = UIHelpers.hexToRgba(bgColor, bgColorOpacity);
            } catch (e) {
                console.error(`Error converting hex ${bgColor} for preview:`, e);
                finalBgColor = `rgba(30, 30, 30, ${bgColorOpacity.toFixed(2)})`;
            }
        }

        const previewStyle = themePreview.style;
        previewStyle.setProperty('--preview-bg-color', finalBgColor);
        previewStyle.setProperty('--preview-border-color', finalBorderColor);
        previewStyle.setProperty('--preview-text-color', textColor);
        previewStyle.setProperty('--preview-username-color', usernameColor);
        previewStyle.setProperty('--preview-timestamp-color', timestampColor);
        previewStyle.setProperty('--preview-pronoun-badge-color', pronounBadgeColor);
        previewStyle.setProperty('--preview-font-family', fontFamily);
        previewStyle.fontFamily = fontFamily;
        previewStyle.setProperty('--preview-border-radius', borderRadius);
        previewStyle.setProperty('--preview-box-shadow', boxShadow);
        previewStyle.setProperty('--preview-text-shadow', textShadow);
        previewStyle.setProperty('--preview-bg-image', bgImage === 'none' ? 'none' : `url("${bgImage}")`);

        const fontSize = fontSizeSlider?.value || this._configManager.config?.fontSize || 14;
        previewStyle.fontSize = `${fontSize}px`;

        const ts1 = showTimestamps ? '<span class="timestamp">12:34 </span>' : '';
        const ts2 = showTimestamps ? '<span class="timestamp">12:35 </span>' : '';

        let previewBadgesHtml = '';
        const shouldShowBadgesInPreview = showBadgesToggle?.checked ?? this._configManager.config.showBadges;

        if (shouldShowBadgesInPreview) {
            let firstGlobalBadgeInfo = null;
            if (this._badgeManager.globalBadges?.data) {
                const firstSetId = Object.keys(this._badgeManager.globalBadges.data)[0];
                if (firstSetId && this._badgeManager.globalBadges.data[firstSetId]) {
                    const firstVersionId = Object.keys(this._badgeManager.globalBadges.data[firstSetId])[0];
                    if (firstVersionId) {
                        firstGlobalBadgeInfo = this._badgeManager.globalBadges.data[firstSetId][firstVersionId];
                    }
                }
            }
            if (firstGlobalBadgeInfo?.imageUrl) {
                previewBadgesHtml = `<img class="chat-badge" src="${firstGlobalBadgeInfo.imageUrl}" alt="${firstGlobalBadgeInfo.title || 'badge'}" title="${firstGlobalBadgeInfo.title || 'badge'}" style="height: calc(var(--font-size) * 1.3); vertical-align: middle; margin-right: 3px;">`;
            }
        }

        const showPronounsToggle = document.getElementById('show-pronouns-toggle');
        const shouldShowPronounsInPreview = showPronounsToggle?.checked ?? this._configManager.config.showPronouns;
        const previewPronounHtml = shouldShowPronounsInPreview ? `<span class="pronoun-badge" style="color: var(--preview-pronoun-badge-color); background-color: rgba(255, 255, 255, 0.1); border-radius: 4px; padding: 2px 4px; font-size: 0.8em; margin-right: 5px; vertical-align: middle; text-transform: uppercase; font-weight: 600; display: inline-block; line-height: 1;">she/her</span>` : '';

        themePreview.innerHTML = `
            <div class="preview-chat-message">
                ${ts1}${previewBadgesHtml}${previewPronounHtml}<span class="username" style="color: var(--preview-username-color);">Username:</span> <span>Example chat message</span>
            </div>
            <div class="preview-chat-message">
                ${ts2}${previewBadgesHtml}${previewPronounHtml}<span class="username" style="color: var(--preview-username-color);">AnotherUser:</span> <span>This is how your chat will look</span>
            </div>
        `.trim();
    }

    /**
     * Update color previews and highlights.
     */
    updateColorPreviews() {
        this.highlightActiveColorButtons();
        this.updateThemePreview();
    }

    /**
     * Highlight active color buttons based on current input/CSS state.
     */
    highlightActiveColorButtons() {
        const { bgColorHex, bgOpacityInput, borderColorHex, textColorHex, usernameColorHex, timestampColorHex, pronounBadgeColorHex } = this._dom;

        // Background color (normalize to lowercase for comparison with data-color attributes)
        const bgColorValue = (bgColorHex?.value || '#121212').toLowerCase();
        const bgOpacityVal = bgOpacityInput ? parseInt(bgOpacityInput.value) : 85;
        const isChromaKeyActive = !!this._configManager.config.chromaKey;
        document.querySelectorAll('.color-btn[data-target="bg"]').forEach(btn => {
            const btnColor = btn.getAttribute('data-color');
            let isActive;
            if (btnColor === 'chroma-key') {
                isActive = isChromaKeyActive;
            } else if (isChromaKeyActive) {
                isActive = false;
            } else if (btnColor === 'transparent') {
                isActive = (bgColorValue === '#000000' && bgOpacityVal === 0);
            } else {
                isActive = (btnColor === bgColorValue && bgOpacityVal > 0);
            }
            btn.classList.toggle('active', isActive);
        });

        // Border color
        const currentBorderCSS = document.documentElement.style.getPropertyValue('--chat-border-color').trim();
        const borderColorInputValue = (borderColorHex?.value || '#9147ff').toLowerCase();
        document.querySelectorAll('.color-btn[data-target="border"]').forEach(btn => {
            const btnColor = btn.getAttribute('data-color');
            let isActive = (btnColor === 'transparent')
                ? (currentBorderCSS === 'transparent')
                : (currentBorderCSS !== 'transparent' && btnColor === borderColorInputValue);
            btn.classList.toggle('active', isActive);
        });

        // Text color
        const textColorValue = (textColorHex?.value || '#efeff1').toLowerCase();
        document.querySelectorAll('.color-btn[data-target="text"]')
            .forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-color') === textColorValue));

        // Username color
        const usernameColorValue = (usernameColorHex?.value || '#9147ff').toLowerCase();
        document.querySelectorAll('.color-btn[data-target="username"]')
            .forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-color') === usernameColorValue));

        // Timestamp color
        const timestampColorValue = (timestampColorHex?.value || '#adadb8').toLowerCase();
        document.querySelectorAll('.color-btn[data-target="timestamp"]')
            .forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-color') === timestampColorValue));

        // Pronoun badge color
        const pronounBadgeColorValue = (pronounBadgeColorHex?.value || '#adadb8').toLowerCase();
        // Only check the button's live DOM state, not the saved config (config isn't updated until Save)
        const isPronounSameAsTsActive = !!document.querySelector('.color-btn[data-target="pronounBadge"][data-color="timestamp"].active');
        document.querySelectorAll('.color-btn[data-target="pronounBadge"]').forEach(btn => {
            const btnColor = btn.getAttribute('data-color');
            let isActive;
            if (btnColor === 'timestamp') {
                isActive = isPronounSameAsTsActive;
                // Dynamically act as a color swatch for the timestamp color
                btn.style.backgroundColor = timestampColorValue;
                let r = 0, g = 0, b = 0;
                if (timestampColorValue.startsWith('#')) {
                    const hexStr = timestampColorValue.length === 4 
                        ? timestampColorValue[1]+timestampColorValue[1]+timestampColorValue[2]+timestampColorValue[2]+timestampColorValue[3]+timestampColorValue[3]
                        : timestampColorValue.slice(1, 7);
                    r = parseInt(hexStr.slice(0, 2), 16) || 0;
                    g = parseInt(hexStr.slice(2, 4), 16) || 0;
                    b = parseInt(hexStr.slice(4, 6), 16) || 0;
                } else if (timestampColorValue.startsWith('rgb')) {
                    const rgbMatch = timestampColorValue.match(/\d+/g);
                    if (rgbMatch && rgbMatch.length >= 3) {
                        r = parseInt(rgbMatch[0], 10);
                        g = parseInt(rgbMatch[1], 10);
                        b = parseInt(rgbMatch[2], 10);
                    }
                }
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                btn.style.color = luminance > 0.5 ? 'black' : 'white';
            } else {
                isActive = (!isPronounSameAsTsActive && btnColor === pronounBadgeColorValue);
            }
            btn.classList.toggle('active', isActive);
        });
    }
}
