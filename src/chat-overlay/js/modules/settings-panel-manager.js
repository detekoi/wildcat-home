/**
 * Settings Panel Manager Module
 * Handles the settings panel lifecycle: open, close, save, reset, and syncing UI controls
 */

import { UIHelpers } from './ui-helpers.js';

export class SettingsPanelManager {
    /**
     * @param {Object} opts
     * @param {Object} opts.configManager - ConfigManager instance
     * @param {Object} opts.chatRenderer - ChatRenderer instance
     * @param {Object} opts.chatConnection - ChatConnection instance
     * @param {Object} opts.badgeManager - BadgeManager instance
     * @param {Object} opts.fontManager - FontManager instance
     * @param {Object} opts.themeManager - ThemeManager instance
     * @param {Object} opts.domRefs - Bag of DOM element references
     */
    constructor({ configManager, chatRenderer, chatConnection, badgeManager, fontManager, themeManager, domRefs }) {
        this._configManager = configManager;
        this._chatRenderer = chatRenderer;
        this._chatConnection = chatConnection;
        this._badgeManager = badgeManager;
        this._fontManager = fontManager;
        this._themeManager = themeManager;
        this._dom = domRefs;

        // Snapshot for cancel/revert
        this._initialConfigBeforeEdit = null;
    }

    // --- Public API ---

    /**
     * Open the settings panel, snapshotting the current config for revert.
     */
    openSettingsPanel() {
        const { configPanel, channelForm, disconnectBtn } = this._dom;
        if (!configPanel) return;

        this._initialConfigBeforeEdit = null;
        try {
            this._initialConfigBeforeEdit = JSON.parse(JSON.stringify(this._configManager.config));
        } catch (error) {
            console.error("Error storing config state for revert:", error);
            this._chatRenderer.addSystemMessage("Error: Could not store settings state for revert.");
        }

        const isConnected = this._chatConnection.isConnected();
        if (channelForm) channelForm.style.display = isConnected ? 'none' : 'flex';
        if (disconnectBtn) {
            disconnectBtn.style.display = isConnected ? 'block' : 'none';
            if (isConnected) disconnectBtn.textContent = `Disconnect from ${this._chatConnection.getCurrentChannel()}`;
        }

        this.updateConfigPanelFromConfig();
        configPanel.classList.add('visible');
        configPanel.style.display = 'block';
    }

    /**
     * Close the settings panel, optionally reverting changes.
     */
    closeConfigPanel(shouldRevert = false) {
        if (shouldRevert && this._initialConfigBeforeEdit) {
            try {
                this._configManager.config = JSON.parse(JSON.stringify(this._initialConfigBeforeEdit));
                this._configManager.applyConfiguration(this._configManager.config);
                this._badgeManager.config = this._configManager.config;
                this._chatRenderer.config = this._configManager.config;
                this.updateConfigPanelFromConfig();
            } catch (error) {
                console.error("Error during revert:", error);
                this._chatRenderer.addSystemMessage("Error: Could not revert settings.");
            }
        }
        this._initialConfigBeforeEdit = null;
        const { configPanel } = this._dom;
        if (configPanel) {
            configPanel.classList.remove('visible');
            configPanel.style.display = 'none';
        }
    }

    /**
     * Save the current configuration from all form values.
     */
    saveConfiguration() {
        try {
            const getValue = (element, defaultValue, isNumber = false, isBool = false, isOpacity = false) => {
                if (!element) return defaultValue;
                if (isBool) return element.checked;
                let value = element.value;
                if (isNumber) return parseInt(value, 10) || defaultValue;
                if (isOpacity) return !isNaN(parseFloat(value)) ? parseFloat(value) / 100.0 : defaultValue;
                return value || defaultValue;
            };
            const getColor = (inputElement, buttonSelector, defaultColor) => {
                const targetType = buttonSelector.includes('bg') ? 'bg' : buttonSelector.includes('border') ? 'border' : buttonSelector.includes('text') ? 'text' : 'username';
                const activeButton = document.querySelector(`${buttonSelector}.active`);
                const activeColor = activeButton?.dataset.color;

                if (targetType === 'bg') {
                    const hexFromInput = inputElement?.value;
                    const isTransparentActive = document.querySelector('.color-btn[data-target="bg"][data-color="transparent"]')?.classList.contains('active');
                    const currentOpacity = getOpacity(this._dom.bgOpacityInput, -1);
                    if (isTransparentActive && currentOpacity === 0) return '#000000';
                    if (hexFromInput) return hexFromInput;
                    return defaultColor;
                } else {
                    if (activeButton) {
                        if (targetType === 'border' && activeColor === 'transparent') return 'transparent';
                        return activeColor;
                    }
                    return inputElement?.value || defaultColor;
                }
            };
            const getOpacity = (element, defaultValue) => {
                if (!element) return defaultValue;
                const parsedValue = parseFloat(element.value);
                return !isNaN(parsedValue) ? parsedValue / 100.0 : defaultValue;
            };

            const {
                fontSizeSlider, bgColorInput, bgOpacityInput, borderColorInput, textColorInput,
                usernameColorInput, overrideUsernameColorsInput, chatWidthInput, chatHeightInput,
                maxMessagesInput, showTimestampsInput, borderRadiusPresets, boxShadowPresets,
                textShadowPresets, fontWeightPresets, showBadgesToggle, showPronounsToggle,
                enlargeSingleEmotesToggle, bgImageOpacityInput
            } = this._dom;

            const currentFontValue = this._fontManager.getCurrentFontValue();
            const currentThemeValue = this._themeManager.lastAppliedThemeValue;
            const bgImageOpacityValue = getOpacity(bgImageOpacityInput, this._configManager.config.bgImageOpacity ?? 0.55);
            const currentBgColorHex = getColor(bgColorInput, '.color-buttons [data-target="bg"]', this._configManager.config.bgColor || '#121212');
            const currentBgOpacity = getOpacity(bgOpacityInput, this._configManager.config.bgColorOpacity ?? 0.85);
            const currentFullTheme = window.availableThemes?.find(t => t.value === currentThemeValue) || {};

            const newConfig = {
                theme: currentThemeValue,
                fontFamily: currentFontValue,
                fontSize: getValue(fontSizeSlider, this._configManager.config.fontSize || 14, true),
                bgColor: currentBgColorHex,
                bgColorOpacity: currentBgOpacity,
                borderColor: getColor(borderColorInput, '.color-buttons [data-target="border"]', this._configManager.config.borderColor || '#444444'),
                textColor: getColor(textColorInput, '.color-buttons [data-target="text"]', this._configManager.config.textColor || '#efeff1'),
                usernameColor: getColor(usernameColorInput, '.color-buttons [data-target="username"]', this._configManager.config.usernameColor || '#9147ff'),
                overrideUsernameColors: getValue(overrideUsernameColorsInput, this._configManager.config.overrideUsernameColors || false, false, true),
                bgImage: currentFullTheme.backgroundImage || this._configManager.config.bgImage || null,
                bgImageOpacity: bgImageOpacityValue,
                borderRadius: borderRadiusPresets?.querySelector('.preset-btn.active')?.dataset.value || this._configManager.config.borderRadius,
                boxShadow: boxShadowPresets?.querySelector('.preset-btn.active')?.dataset.value || this._configManager.config.boxShadow,
                textShadow: textShadowPresets?.querySelector('.preset-btn.active')?.dataset.value || this._configManager.config.textShadow,
                fontWeight: fontWeightPresets?.querySelector('.preset-btn.active')?.dataset.value || this._configManager.config.fontWeight || 'normal',
                chatMode: document.querySelector('input[name="chat-mode"]:checked')?.value || this._configManager.config.chatMode || 'window',
                chatWidth: getValue(chatWidthInput, this._configManager.config.chatWidth || 95, true),
                chatHeight: getValue(chatHeightInput, this._configManager.config.chatHeight || 95, true),
                maxMessages: getValue(maxMessagesInput, this._configManager.config.maxMessages || 50, true),
                showTimestamps: getValue(showTimestampsInput, this._configManager.config.showTimestamps ?? true, false, true),
                popup: {
                    direction: document.querySelector('input[name="popup-direction"]:checked')?.value || this._configManager.config.popup?.direction || 'from-bottom',
                    duration: getValue(document.getElementById('popup-duration'), this._configManager.config.popup?.duration || 5, true),
                    maxMessages: getValue(document.getElementById('popup-max-messages'), this._configManager.config.popup?.maxMessages || 3, true)
                },
                lastChannel: this._configManager.config.lastChannel,
                showBadges: getValue(showBadgesToggle, this._configManager.config.showBadges, false, true),
                showPronouns: getValue(showPronounsToggle, this._configManager.config.showPronouns, false, true),
                badgeEndpointUrlGlobal: this._configManager.config.badgeEndpointUrlGlobal,
                badgeEndpointUrlChannel: this._configManager.config.badgeEndpointUrlChannel,
                badgeCacheGlobalTTL: this._configManager.config.badgeCacheGlobalTTL,
                badgeCacheChannelTTL: this._configManager.config.badgeCacheChannelTTL,
                badgeFallbackHide: true,
                enlargeSingleEmotes: getValue(enlargeSingleEmotesToggle, this._configManager.config.enlargeSingleEmotes, false, true),
            };

            this._configManager.config = newConfig;
            this._configManager.applyConfiguration(this._configManager.config);
            this._badgeManager.config = this._configManager.config;
            this._chatRenderer.config = this._configManager.config;

            const scene = UIHelpers.getUrlParameter('scene') || 'default';
            this._configManager.saveConfig(scene);
            this.closeConfigPanel(false);

            if (this._configManager.config.chatMode === 'popup') {
                this._chatRenderer.addChatMessage({ username: 'Test', message: 'Test message', color: this._configManager.config.usernameColor, tags: {} });
            }

            // Re-fetch badges if settings changed
            this._badgeManager.fetchGlobalBadges(() => this._themeManager.updateThemePreview());
            if (this._chatConnection.currentBroadcasterId) {
                this._badgeManager.fetchChannelBadges(this._chatConnection.currentBroadcasterId);
            }

        } catch (error) {
            console.error("Error saving configuration:", error);
            this._chatRenderer.addSystemMessage("Error saving settings. Check console.");
        }
    }

    /**
     * Reset to default settings.
     */
    applyDefaultSettings() {
        this._configManager.resetToDefaults();
        this._badgeManager.config = this._configManager.config;
        this._chatRenderer.config = this._configManager.config;
    }

    /**
     * Populate all config panel UI controls from the current config state.
     */
    updateConfigPanelFromConfig() {
        const { configPanel, bgColorInput, bgOpacityInput, bgOpacityValue, borderColorInput,
            textColorInput, usernameColorInput, overrideUsernameColorsInput, fontSizeSlider,
            fontSizeValue, chatWidthInput, chatWidthValue, chatHeightInput, chatHeightValue,
            maxMessagesInput, showTimestampsInput, borderRadiusPresets, boxShadowPresets,
            textShadowPresets, fontWeightPresets, channelInput, channelForm, disconnectBtn,
            showBadgesToggle, enlargeSingleEmotesToggle } = this._dom;

        if (!configPanel) return;

        const hexColor = this._configManager.config.bgColor || '#121212';
        const opacityPercent = Math.round((this._configManager.config.bgColorOpacity ?? 0.85) * 100);
        if (bgColorInput) bgColorInput.value = hexColor;
        if (bgOpacityInput && bgOpacityValue) {
            bgOpacityInput.value = opacityPercent;
            bgOpacityValue.textContent = `${opacityPercent}%`;
        }

        if (borderColorInput) borderColorInput.value = this._configManager.config.borderColor === 'transparent' ? '#000000' : this._configManager.config.borderColor;
        if (textColorInput) textColorInput.value = this._configManager.config.textColor || '#efeff1';
        if (usernameColorInput) usernameColorInput.value = this._configManager.config.usernameColor || '#9147ff';
        this._themeManager.highlightActiveColorButtons();

        UIHelpers.highlightBorderRadiusButton(UIHelpers.getBorderRadiusValue(this._configManager.config.borderRadius), borderRadiusPresets);
        UIHelpers.highlightBoxShadowButton(this._configManager.config.boxShadow, boxShadowPresets);
        UIHelpers.highlightTextShadowButton(this._configManager.config.textShadow, textShadowPresets);
        UIHelpers.highlightFontWeightButton(this._configManager.config.fontWeight || 'normal', fontWeightPresets);

        if (overrideUsernameColorsInput) overrideUsernameColorsInput.checked = this._configManager.config.overrideUsernameColors;
        if (fontSizeSlider) fontSizeSlider.value = this._configManager.config.fontSize;
        if (fontSizeValue) fontSizeValue.textContent = `${this._configManager.config.fontSize}px`;
        if (chatWidthInput) chatWidthInput.value = this._configManager.config.chatWidth;
        if (chatWidthValue) chatWidthValue.textContent = `${this._configManager.config.chatWidth}%`;
        if (chatHeightInput) chatHeightInput.value = this._configManager.config.chatHeight;
        if (chatHeightValue) chatHeightValue.textContent = `${this._configManager.config.chatHeight}%`;
        if (maxMessagesInput) maxMessagesInput.value = this._configManager.config.maxMessages;
        if (showTimestampsInput) showTimestampsInput.checked = this._configManager.config.showTimestamps;

        const showPronounsToggle = document.getElementById('show-pronouns-toggle');
        if (showPronounsToggle) showPronounsToggle.checked = this._configManager.config.showPronouns;

        // Sync font manager to config
        this._fontManager.syncToConfig();
        this._fontManager.updateFontDisplay();

        // Sync theme carousel
        const themeIndex = window.availableThemes?.findIndex(t => t.value === this._configManager.config.theme) ?? -1;
        const currentThemeIdx = (themeIndex !== -1) ? themeIndex : (window.availableThemes?.findIndex(t => t.value === 'default') ?? 0);
        const currentTheme = window.availableThemes?.[currentThemeIdx];
        if (currentTheme) {
            if (typeof window.updateThemeDetails === 'function') window.updateThemeDetails(currentTheme);
            if (typeof window.highlightActiveCard === 'function') window.highlightActiveCard(currentTheme.value);
        }

        if (channelInput) channelInput.value = this._configManager.config.lastChannel || '';
        const isConnected = this._chatConnection.isConnected();
        if (channelForm) channelForm.style.display = isConnected ? 'none' : 'flex';
        if (disconnectBtn) {
            disconnectBtn.style.display = isConnected ? 'block' : 'none';
            if (isConnected) disconnectBtn.textContent = `Disconnect from ${this._chatConnection.getCurrentChannel() || this._configManager.config.lastChannel}`;
        }

        const currentMode = this._configManager.config.chatMode || 'window';
        document.querySelectorAll('input[name="chat-mode"]').forEach(radio => radio.checked = (radio.value === currentMode));
        this._updateModeSpecificSettingsVisibility(currentMode);

        const currentPopupDirection = this._configManager.config.popup?.direction || 'from-bottom';
        document.querySelectorAll('input[name="popup-direction"]').forEach(radio => radio.checked = (radio.value === currentPopupDirection));

        const popupDurationInput = document.getElementById('popup-duration');
        const popupDurationValue = document.getElementById('popup-duration-value');
        const popupMaxMessagesInput = document.getElementById('popup-max-messages');
        if (popupDurationInput && popupDurationValue) {
            const duration = this._configManager.config.popup?.duration || 5;
            popupDurationInput.value = duration;
            popupDurationValue.textContent = `${duration}s`;
        }
        if (popupMaxMessagesInput) {
            popupMaxMessagesInput.value = this._configManager.config.popup?.maxMessages || 3;
        }

        if (showBadgesToggle) showBadgesToggle.checked = this._configManager.config.showBadges;
        if (enlargeSingleEmotesToggle) enlargeSingleEmotesToggle.checked = this._configManager.config.enlargeSingleEmotes;

        this._themeManager.updateThemePreview();
    }

    // --- Private Methods ---

    /**
     * Show/hide mode-specific settings.
     */
    _updateModeSpecificSettingsVisibility(mode) {
        const isPopup = mode === 'popup';
        document.querySelectorAll('.popup-setting').forEach(el => el.style.display = isPopup ? 'flex' : 'none');
        document.querySelectorAll('.window-only-setting').forEach(el => el.style.display = isPopup ? 'none' : 'flex');
    }
}
