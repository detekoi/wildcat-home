/**
 * Settings Panel Manager Module
 * Handles the settings panel lifecycle: open, close, save, reset, and syncing UI controls
 */

import { UIHelpers } from './ui-helpers.js';
import { CONFIG_VERSION } from './config-manager.js';
import { mount, addTheme, getThemes, applyTheme, updateThemeDetails, highlightActiveCard, applyAndScrollToTheme, scrollToThemeCard, loadGoogleFont, availableFonts, availableThemes, currentThemeIndex, getAvailableThemes } from '../theme-carousel.js';
import { buildThemeFromConfig, isUserPreset, MAX_PRESET_NAME_LENGTH } from './theme-preset-builder.js';
import { promptForThemeName } from './theme-name-modal.js';
import { MAX_LIBRARY_THEMES } from './theme-library-client.js';

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
    constructor({ configManager, chatRenderer, chatConnection, badgeManager, fontManager, themeManager, thirdPartyEmoteManager, sceneSyncManager, domRefs }) {
        this._configManager = configManager;
        this._chatRenderer = chatRenderer;
        this._chatConnection = chatConnection;
        this._badgeManager = badgeManager;
        this._fontManager = fontManager;
        this._themeManager = themeManager;
        this._thirdPartyEmoteManager = thirdPartyEmoteManager;
        this._sceneSyncManager = sceneSyncManager || null;
        this._dom = domRefs;

        // Snapshot for cancel/revert
        this._initialConfigBeforeEdit = null;
    }

    /**
     * Set SceneSyncManager instance
     */
    setSceneSyncManager(sceneSyncManager) {
        this._sceneSyncManager = sceneSyncManager;
    }

    // --- Public API ---

    /**
     * Open the settings panel, snapshotting the current config for revert.
     */
    openSettingsPanel() {
        const { configPanel } = this._dom;
        if (!configPanel) return;

        this._initialConfigBeforeEdit = null;
        try {
            this._initialConfigBeforeEdit = JSON.parse(JSON.stringify(this._configManager.config));
        } catch (error) {
            console.error("Error storing config state for revert:", error);
            this._chatRenderer.addSystemMessage("Error: Could not store settings state for revert.");
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
                if (this._thirdPartyEmoteManager) this._thirdPartyEmoteManager.config = this._configManager.config;
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
     * Read a complete config object out of the panel's live DOM.
     *
     * Extracted from saveConfiguration() so it can also back "save as preset".
     * This has to read the DOM rather than this._configManager.config: the colour
     * inputs only write CSS custom properties as you edit them
     * (chat-event-bindings.js syncHexInputAndSwatch) and do not reach the config
     * until a save happens — so building anything from the stored config would
     * silently capture the *previous* colours.
     *
     * Side-effect free; callers decide what to do with the result.
     * @returns {Object} A full config object reflecting the panel's current state.
     */
    readPanelConfig() {
            const getValue = (element, defaultValue, isNumber = false, isBool = false, isOpacity = false) => {
                if (!element) return defaultValue;
                if (isBool) return element.checked;
                let value = element.value;
                if (isNumber) return parseInt(value, 10) || defaultValue;
                if (isOpacity) return !isNaN(parseFloat(value)) ? parseFloat(value) / 100.0 : defaultValue;
                return value || defaultValue;
            };
            const getColor = (inputElement, buttonSelector, defaultColor) => {
                const isBg = buttonSelector.includes('bg');
                const isBorder = buttonSelector.includes('border');
                const isText = buttonSelector.includes('text');
                const isUsername = buttonSelector.includes('username');
                const isTimestamp = buttonSelector.includes('timestamp');
                const isPronoun = buttonSelector.includes('pronounBadge');

                const targetType = isBg ? 'bg' : isBorder ? 'border' : isText ? 'text' : isUsername ? 'username' : isTimestamp ? 'timestamp' : 'pronounBadge';
                const activeButton = document.querySelector(`${buttonSelector}.active`);
                const activeColor = activeButton?.dataset.color;

                if (targetType === 'bg') {
                    const hexFromInput = inputElement?.value;
                    const isTransparentActive = document.querySelector('.color-btn[data-target="bg"][data-color="transparent"]')?.classList.contains('active');
                    const currentOpacity = getOpacity(this._dom.bgOpacityInput, -1);
                    if (isTransparentActive && currentOpacity === 0) return '#000000';
                    if (hexFromInput) return hexFromInput;
                    return defaultColor;
                } else if (targetType === 'pronounBadge') {
                    if (activeButton) {
                        return activeColor; // Can be 'timestamp' or hex
                    }
                    return inputElement?.value || defaultColor;
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
                fontSizeSlider, bgColorHex, bgOpacityInput, borderColorHex, textColorHex,
                usernameColorHex, timestampColorHex, pronounBadgeColorHex, overrideUsernameColorsInput, chatWidthInput, chatHeightInput,
                maxMessagesInput, showTimestampsInput, borderRadiusPresets, boxShadowPresets,
                textShadowPresets, fontWeightPresets, showBadgesToggle, showPronounsToggle,
                enlargeSingleEmotesToggle, bgImageOpacityInput
            } = this._dom;

            const topFadeToggle = document.getElementById('top-fade-toggle');

            const currentFontValue = this._fontManager.getCurrentFontValue();
            const currentThemeValue = this._themeManager.lastAppliedThemeValue || this._configManager.config.theme || 'default';
            const bgImageOpacityValue = getOpacity(bgImageOpacityInput, this._configManager.config.bgImageOpacity ?? 0.55);
            const currentBgColorHex = getColor(bgColorHex, '.color-buttons [data-target="bg"]', this._configManager.config.bgColor || '#121212');
            const currentBgOpacity = getOpacity(bgOpacityInput, this._configManager.config.bgColorOpacity ?? 0.85);
            const currentFullTheme = availableThemes?.find(t => t.value === currentThemeValue) || {};

            const newConfig = {
                // newConfig replaces the config wholesale, so the schema version has to be carried
                // through explicitly or saving from the panel would silently unversion the config.
                configVersion: this._configManager.config.configVersion ?? CONFIG_VERSION,
                theme: currentThemeValue,
                fontFamily: currentFontValue,
                googleFontFamily: this._configManager.config.googleFontFamily || null,
                fontSize: getValue(fontSizeSlider, this._configManager.config.fontSize || 14, true),
                bgColor: currentBgColorHex,
                bgColorOpacity: currentBgOpacity,
                borderColor: getColor(borderColorHex, '.color-buttons [data-target="border"]', this._configManager.config.borderColor || '#444444'),
                textColor: getColor(textColorHex, '.color-buttons [data-target="text"]', this._configManager.config.textColor || '#efeff1'),
                usernameColor: getColor(usernameColorHex, '.color-buttons [data-target="username"]', this._configManager.config.usernameColor || '#9147ff'),
                timestampColor: getColor(timestampColorHex, '.color-buttons [data-target="timestamp"]', this._configManager.config.timestampColor || '#adadb8'),
                pronounBadgeColor: getColor(pronounBadgeColorHex, '.color-buttons [data-target="pronounBadge"]', this._configManager.config.pronounBadgeColor || '#adadb8'),
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
                lastTwitchChannel: this._chatConnection.getTwitchChannel() || this._dom.twitchChannelInput?.value?.trim() || this._configManager.config.lastTwitchChannel || this._configManager.config.lastChannel,
                lastYouTubeTarget: this._chatConnection.getYouTubeTarget() || this._dom.youtubeChannelInput?.value?.trim() || this._configManager.config.lastYouTubeTarget,
                showSuperChats: getValue(document.getElementById('show-superchats-toggle'), this._configManager.config.showSuperChats ?? true, false, true),
                showMembershipEvents: getValue(document.getElementById('show-memberships-toggle'), this._configManager.config.showMembershipEvents ?? true, false, true),
                showPlatformBadges: getValue(document.getElementById('show-platform-badges-toggle'), this._configManager.config.showPlatformBadges ?? true, false, true),
                showBadges: getValue(showBadgesToggle, this._configManager.config.showBadges, false, true),
                showPronouns: getValue(showPronounsToggle, this._configManager.config.showPronouns, false, true),
                badgeEndpointUrlGlobal: this._configManager.config.badgeEndpointUrlGlobal,
                badgeEndpointUrlChannel: this._configManager.config.badgeEndpointUrlChannel,
                badgeCacheGlobalTTL: this._configManager.config.badgeCacheGlobalTTL,
                badgeCacheChannelTTL: this._configManager.config.badgeCacheChannelTTL,
                badgeFallbackHide: true,
                cheermoteEndpointUrl: this._configManager.config.cheermoteEndpointUrl,
                cheermoteCacheTTL: this._configManager.config.cheermoteCacheTTL,
                thirdPartyEmotes: getValue(document.getElementById('third-party-emotes-toggle'), this._configManager.config.thirdPartyEmotes ?? true, false, true),
                thirdPartyChannelEmotes: getValue(document.getElementById('third-party-channel-emotes-toggle'), this._configManager.config.thirdPartyChannelEmotes ?? true, false, true),
                thirdPartyFilter7tvTwitchDisallowed: getValue(document.getElementById('third-party-filter-7tv-twitch-disallowed-toggle'), this._configManager.config.thirdPartyFilter7tvTwitchDisallowed ?? true, false, true),
                thirdPartyFilter7tvSexual: getValue(document.getElementById('third-party-filter-7tv-sexual-toggle'), this._configManager.config.thirdPartyFilter7tvSexual ?? false, false, true),
                thirdPartyFilter7tvEpilepsy: getValue(document.getElementById('third-party-filter-7tv-epilepsy-toggle'), this._configManager.config.thirdPartyFilter7tvEpilepsy ?? true, false, true),
                thirdPartyFilter7tvEdgy: getValue(document.getElementById('third-party-filter-7tv-edgy-toggle'), this._configManager.config.thirdPartyFilter7tvEdgy ?? false, false, true),
                thirdPartyEmoteCacheGlobalTTL: this._configManager.config.thirdPartyEmoteCacheGlobalTTL,
                thirdPartyEmoteCacheChannelTTL: this._configManager.config.thirdPartyEmoteCacheChannelTTL,
                enlargeSingleEmotes: getValue(enlargeSingleEmotesToggle, this._configManager.config.enlargeSingleEmotes, false, true),
                topFade: getValue(topFadeToggle, this._configManager.config.topFade ?? false, false, true),
                hideCommands: getValue(document.getElementById('hide-commands-toggle'), this._configManager.config.hideCommands ?? false, false, true),
                chromaKey: this._configManager.config.chromaKey ?? false,
                preChromaKeyOpacity: this._configManager.config.preChromaKeyOpacity,
                preChromaKeyColor: this._configManager.config.preChromaKeyColor,
            };

            return newConfig;
    }

    /**
     * Save the current configuration from all form values.
     */
    saveConfiguration() {
        try {
            const newConfig = this.readPanelConfig();

            this._configManager.config = newConfig;
            this._configManager.applyConfiguration(this._configManager.config);
            this._badgeManager.config = this._configManager.config;
            this._chatRenderer.config = this._configManager.config;
            if (this._thirdPartyEmoteManager) this._thirdPartyEmoteManager.config = this._configManager.config;

            const scene = UIHelpers.getUrlParameter('scene') || 'default';
            this._configManager.saveConfig(scene);

            if (this._sceneSyncManager) {
                if (!this._sceneSyncManager.syncToken) {
                    if (window.parent !== window) {
                        console.warn('[SettingsPanelManager] No sync token present in iframe; skipping cloud push.');
                    } else {
                        // Must be UUID-shaped on every path: the proxy's validateToken
                        // middleware 400s anything else, so the old `sync-${Date.now()}`
                        // fallback minted a token that could never sync.
                        const newToken = UIHelpers.generateUUID();
                        this._sceneSyncManager.setSyncToken(newToken);
                        const url = new URL(window.location.href);
                        url.searchParams.set('sync', newToken);
                        if (!url.searchParams.has('scene')) url.searchParams.set('scene', scene);
                        window.history.replaceState(null, '', url.toString());
                    }
                }
                if (this._sceneSyncManager.syncToken) {
                    this._sceneSyncManager.pushConfig(newConfig);
                }
            }
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
     * Snapshot the panel's current look as a named theme preset in the shared cloud
     * library. The counterpart to the AI generator: same destination, but the user's
     * own settings as the source.
     */
    async saveCurrentSettingsAsPreset() {
        const config = this.readPanelConfig();
        const existingThemes = getAvailableThemes() || [];
        const presetCount = existingThemes.filter(isUserPreset).length;

        const name = await promptForThemeName({
            title: 'Save Theme Preset',
            // This panel has no image upload of its own, so be explicit about where
            // a preset's background image comes from rather than letting it surprise.
            message: 'Save the current colors, font, radius and shadows as a reusable preset. '
                + 'The background image comes from the theme you currently have selected.',
            note: existingThemes.length >= MAX_LIBRARY_THEMES
                ? `Your theme library is full (${MAX_LIBRARY_THEMES}). Saving will remove the oldest theme.`
                : '',
            defaultValue: `My Preset ${presetCount + 1}`,
            maxLength: MAX_PRESET_NAME_LENGTH
        });

        if (!name) return;

        const theme = buildThemeFromConfig(config, { name, existingThemes });

        // addTheme() is optimistic — it inserts locally and pushes in the background —
        // so without this an unreachable proxy would look like a successful save right
        // up until the preset vanished on reload.
        let pushTimeoutId = null;
        const onPushResult = (e) => {
            if (e.detail?.theme?.value !== theme.value) return;
            if (pushTimeoutId) clearTimeout(pushTimeoutId);
            document.removeEventListener('theme-library-push-result', onPushResult);

            if (!e.detail.ok) {
                UIHelpers.showNotification(
                    'Preset Not Synced',
                    'Could not reach the theme library. This preset will be lost when you reload.',
                    'warning'
                );
                return;
            }

            UIHelpers.showNotification(
                'Preset Saved',
                e.detail.imageDropped
                    ? `"${theme.name}" was saved, but its background image was too large to store.`
                    : `"${theme.name}" was added to your theme library.`,
                e.detail.imageDropped ? 'warning' : 'success'
            );
        };
        pushTimeoutId = setTimeout(() => {
            document.removeEventListener('theme-library-push-result', onPushResult);
        }, 15000);
        document.addEventListener('theme-library-push-result', onPushResult);

        const added = addTheme(theme);

        // Select the new preset without re-applying it: the panel already looks
        // exactly like it, so applyTheme() would only redo font resolution and risk
        // disturbing unsaved state.
        this._themeManager.lastAppliedThemeValue = added.value;
        this._configManager.updateConfig('theme', added.value);
        updateThemeDetails(added);
        highlightActiveCard(added.value);
    }

    /**
     * Reset to default settings.
     */
    applyDefaultSettings() {
        this._configManager.resetToDefaults();
        this._badgeManager.config = this._configManager.config;
        this._chatRenderer.config = this._configManager.config;
        if (this._thirdPartyEmoteManager) this._thirdPartyEmoteManager.config = this._configManager.config;
    }

    /**
     * Populate all config panel UI controls from the current config state.
     */
    updateConfigPanelFromConfig() {
        const { configPanel, bgColorInput, bgColorHex, bgOpacityInput, bgOpacityValue, borderColorInput, borderColorHex,
            textColorInput, textColorHex, usernameColorInput, usernameColorHex,
            timestampColorInput, timestampColorHex, pronounBadgeColorInput, pronounBadgeColorHex,
            overrideUsernameColorsInput, fontSizeSlider,
            fontSizeValue, chatWidthInput, chatWidthValue, chatHeightInput, chatHeightValue,
            maxMessagesInput, showTimestampsInput, borderRadiusPresets, boxShadowPresets,
            textShadowPresets, fontWeightPresets, twitchChannelInput, youtubeChannelInput, twitchChannelForm, youtubeChannelForm, twitchDisconnectBtn, youtubeDisconnectBtn,
            showBadgesToggle, enlargeSingleEmotesToggle } = this._dom;

        if (!configPanel) return;

        const hexColor = this._configManager.config.bgColor || '#121212';
        const isChromaKey = !!this._configManager.config.chromaKey;
        const opacityPercent = isChromaKey ? 0 : Math.round((this._configManager.config.bgColorOpacity ?? 0.85) * 100);
        if (bgColorInput) bgColorInput.style.backgroundColor = isChromaKey ? '#00b140' : hexColor;
        if (bgColorHex) bgColorHex.value = (isChromaKey ? '#00b140' : hexColor).toUpperCase();
        if (bgOpacityInput && bgOpacityValue) {
            bgOpacityInput.value = opacityPercent;
            bgOpacityValue.textContent = `${opacityPercent}%`;
        }

        if (borderColorInput) borderColorInput.style.backgroundColor = this._configManager.config.borderColor === 'transparent' ? 'transparent' : this._configManager.config.borderColor;
        if (borderColorHex) borderColorHex.value = (this._configManager.config.borderColor || '#9147ff').toUpperCase();
        if (textColorInput) textColorInput.style.backgroundColor = this._configManager.config.textColor || '#efeff1';
        if (textColorHex) textColorHex.value = (this._configManager.config.textColor || '#efeff1').toUpperCase();
        if (usernameColorInput) usernameColorInput.style.backgroundColor = this._configManager.config.usernameColor || '#9147ff';
        if (usernameColorHex) usernameColorHex.value = (this._configManager.config.usernameColor || '#9147ff').toUpperCase();

        const timestampColorVal = this._configManager.config.timestampColor || '#adadb8';
        if (timestampColorInput) timestampColorInput.style.backgroundColor = timestampColorVal;
        if (timestampColorHex) timestampColorHex.value = timestampColorVal.toUpperCase();

        const pronounBadgeColorVal = this._configManager.config.pronounBadgeColor || 'timestamp';
        if (pronounBadgeColorInput) {
            pronounBadgeColorInput.style.backgroundColor = pronounBadgeColorVal === 'timestamp' ? timestampColorVal : pronounBadgeColorVal;
        }
        if (pronounBadgeColorHex) {
            pronounBadgeColorHex.value = pronounBadgeColorVal.toUpperCase();
        }

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
        const savedThemeVal = this._configManager.config.theme || 'default';
        if (this._themeManager) {
            this._themeManager.lastAppliedThemeValue = savedThemeVal;
        }
        const themeIndex = availableThemes?.findIndex(t => t.value === savedThemeVal) ?? -1;
        const currentThemeIdx = (themeIndex !== -1) ? themeIndex : (availableThemes?.findIndex(t => t.value === 'default') ?? 0);
        const currentTheme = availableThemes?.[currentThemeIdx];
        if (currentTheme) {
            updateThemeDetails(currentTheme);
            highlightActiveCard(currentTheme.value);
            scrollToThemeCard(currentThemeIdx);
        }

        if (twitchChannelInput) twitchChannelInput.value = this._configManager.config.lastTwitchChannel || this._configManager.config.lastChannel || '';
        if (youtubeChannelInput) youtubeChannelInput.value = this._configManager.config.lastYouTubeTarget || '';

        const isTwitchConnected = this._chatConnection.isTwitchConnected();
        const isYouTubeConnected = this._chatConnection.isYouTubeConnected();

        if (twitchChannelForm) twitchChannelForm.style.display = isTwitchConnected ? 'none' : 'flex';
        if (youtubeChannelForm) youtubeChannelForm.style.display = isYouTubeConnected ? 'none' : 'flex';

        if (twitchDisconnectBtn) {
            twitchDisconnectBtn.style.display = isTwitchConnected ? 'block' : 'none';
            if (isTwitchConnected) twitchDisconnectBtn.textContent = `Disconnect from ${this._chatConnection.getTwitchChannel() || this._configManager.config.lastTwitchChannel}`;
        }
        if (youtubeDisconnectBtn) {
            youtubeDisconnectBtn.style.display = isYouTubeConnected ? 'block' : 'none';
            if (isYouTubeConnected) youtubeDisconnectBtn.textContent = `Disconnect from ${this._chatConnection.getYouTubeTarget() || this._configManager.config.lastYouTubeTarget}`;
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

        const topFadeToggle = document.getElementById('top-fade-toggle');
        if (topFadeToggle) topFadeToggle.checked = this._configManager.config.topFade ?? false;

        const showSuperchatsToggle = document.getElementById('show-superchats-toggle');
        if (showSuperchatsToggle) showSuperchatsToggle.checked = this._configManager.config.showSuperChats ?? true;
        const showMembershipsToggle = document.getElementById('show-memberships-toggle');
        if (showMembershipsToggle) showMembershipsToggle.checked = this._configManager.config.showMembershipEvents ?? true;
        const showPlatformBadgesToggle = document.getElementById('show-platform-badges-toggle');
        if (showPlatformBadgesToggle) showPlatformBadgesToggle.checked = this._configManager.config.showPlatformBadges ?? true;

        const hideCommandsToggle = document.getElementById('hide-commands-toggle');
        if (hideCommandsToggle) hideCommandsToggle.checked = this._configManager.config.hideCommands ?? false;

        const thirdPartyEmotesToggle = document.getElementById('third-party-emotes-toggle');
        if (thirdPartyEmotesToggle) thirdPartyEmotesToggle.checked = this._configManager.config.thirdPartyEmotes ?? true;

        const thirdPartyChannelEmotesToggle = document.getElementById('third-party-channel-emotes-toggle');
        if (thirdPartyChannelEmotesToggle) thirdPartyChannelEmotesToggle.checked = this._configManager.config.thirdPartyChannelEmotes ?? true;

        const thirdPartyFilter7tvTwitchDisallowedToggle = document.getElementById('third-party-filter-7tv-twitch-disallowed-toggle');
        if (thirdPartyFilter7tvTwitchDisallowedToggle) thirdPartyFilter7tvTwitchDisallowedToggle.checked = this._configManager.config.thirdPartyFilter7tvTwitchDisallowed ?? true;

        const thirdPartyFilter7tvSexualToggle = document.getElementById('third-party-filter-7tv-sexual-toggle');
        if (thirdPartyFilter7tvSexualToggle) thirdPartyFilter7tvSexualToggle.checked = this._configManager.config.thirdPartyFilter7tvSexual ?? false;

        const thirdPartyFilter7tvEpilepsyToggle = document.getElementById('third-party-filter-7tv-epilepsy-toggle');
        if (thirdPartyFilter7tvEpilepsyToggle) thirdPartyFilter7tvEpilepsyToggle.checked = this._configManager.config.thirdPartyFilter7tvEpilepsy ?? true;

        const thirdPartyFilter7tvEdgyToggle = document.getElementById('third-party-filter-7tv-edgy-toggle');
        if (thirdPartyFilter7tvEdgyToggle) thirdPartyFilter7tvEdgyToggle.checked = this._configManager.config.thirdPartyFilter7tvEdgy ?? false;

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
