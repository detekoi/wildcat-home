// ES6 Module Imports
import { UIHelpers } from './modules/ui-helpers.js';
import { ScrollManager } from './modules/scroll-manager.js';
import { BadgeManager } from './modules/badge-manager.js';
import { PronounManager } from './modules/pronoun-manager.js';
import { ConfigManager } from './modules/config-manager.js';
import { ChatRenderer } from './modules/chat-renderer.js';
import { ChatConnection } from './modules/chat-connection.js';
import { FontManager } from './modules/font-manager.js';
import { ThemeManager } from './modules/theme-manager.js';
import { SettingsPanelManager } from './modules/settings-panel-manager.js';

// Wait for DOM ready to run this code
(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    function initApp() {
        // --- DOM ELEMENT LOOKUPS ---

        const initialConnectionPrompt = document.getElementById('initial-connection-prompt');
        const initialTwitchInput = document.getElementById('initial-twitch-input');
        const initialYoutubeInput = document.getElementById('initial-youtube-input');
        const initialConnectBtn = document.getElementById('initial-connect-btn');
        const openSettingsFromPromptBtn = document.getElementById('open-settings-from-prompt');

        // Chat containers
        const chatContainer = document.getElementById('chat-container');
        const chatWrapper = document.getElementById('chat-wrapper');
        const popupContainer = document.getElementById('popup-container');
        const chatMessages = document.getElementById('chat-messages');
        const scrollArea = document.getElementById('chat-scroll-area');

        // Settings panel controls
        const twitchConnectBtn = document.getElementById('twitch-connect-btn');
        const twitchDisconnectBtn = document.getElementById('twitch-disconnect-btn');
        const twitchChannelInput = document.getElementById('twitch-channel-input');
        const youtubeConnectBtn = document.getElementById('youtube-connect-btn');
        const youtubeDisconnectBtn = document.getElementById('youtube-disconnect-btn');
        const youtubeChannelInput = document.getElementById('youtube-channel-input');
        const settingsBtn = document.getElementById('settings-btn');
        const configPanel = document.getElementById('config-panel');
        const saveConfigBtn = document.getElementById('save-config');
        const cancelConfigBtn = document.getElementById('cancel-config');
        const resetConfigBtn = document.getElementById('reset-config');
        const fontSizeSlider = document.getElementById('font-size');
        const fontSizeValue = document.getElementById('font-size-value');
        const bgColorInput = document.getElementById('bg-color');
        const bgOpacityInput = document.getElementById('bg-opacity');
        const bgOpacityValue = document.getElementById('bg-opacity-value');
        const borderColorInput = document.getElementById('border-color');
        const textColorInput = document.getElementById('text-color');
        const usernameColorInput = document.getElementById('username-color');
        const overrideUsernameColorsInput = document.getElementById('override-username-colors');
        const chatWidthInput = document.getElementById('chat-width');
        const chatWidthValue = document.getElementById('chat-width-value');
        const chatHeightInput = document.getElementById('chat-height');
        const chatHeightValue = document.getElementById('chat-height-value');
        const maxMessagesInput = document.getElementById('max-messages');
        const showTimestampsInput = document.getElementById('show-timestamps');
        const borderRadiusPresets = document.getElementById('border-radius-presets');
        const boxShadowPresets = document.getElementById('box-shadow-presets');
        const textShadowPresets = document.getElementById('text-shadow-presets');
        const fontWeightPresets = document.getElementById('font-weight-presets');
        const prevFontBtn = document.getElementById('prev-font');
        const nextFontBtn = document.getElementById('next-font');
        const fontSearchInput = document.getElementById('font-search-input');
        const fontSearchResults = document.getElementById('font-search-results');
        const themePreview = document.getElementById('theme-preview');
        const twitchChannelForm = document.getElementById('twitch-channel-form');
        const youtubeChannelForm = document.getElementById('youtube-channel-form');
        const showBadgesToggle = document.getElementById('show-badges-toggle');
        const showPronounsToggle = document.getElementById('show-pronouns-toggle');
        const enlargeSingleEmotesToggle = document.getElementById('enlarge-single-emotes-toggle');
        const bgImageOpacityInput = document.getElementById('bg-image-opacity');
        const bgImageOpacityValue = document.getElementById('bg-image-opacity-value');

        // --- SHARED DOM REFS BAG ---
        const domRefs = {
            bgColorInput, bgOpacityInput, bgOpacityValue, borderColorInput,
            textColorInput, usernameColorInput, overrideUsernameColorsInput,
            bgImageOpacityInput, bgImageOpacityValue, borderRadiusPresets,
            boxShadowPresets, textShadowPresets, fontWeightPresets,
            fontSizeSlider, fontSizeValue, chatWidthInput, chatWidthValue,
            chatHeightInput, chatHeightValue, maxMessagesInput, showTimestampsInput,
            themePreview, chatWrapper, showBadgesToggle, showPronounsToggle,
            enlargeSingleEmotesToggle, configPanel, twitchChannelForm, youtubeChannelForm, 
            twitchDisconnectBtn, youtubeDisconnectBtn, twitchChannelInput, youtubeChannelInput
        };

        // --- MODULE INITIALIZATION ---

        const configManager = new ConfigManager();
        const scrollManager = new ScrollManager(scrollArea, chatMessages);
        const badgeManager = new BadgeManager(configManager.config);
        const pronounManager = new PronounManager();
        pronounManager.loadDefinitions();

        const chatRenderer = new ChatRenderer(configManager.config, scrollManager, badgeManager, pronounManager);
        const chatConnection = new ChatConnection(configManager, chatRenderer, badgeManager);

        const fontManager = new FontManager({
            fontSearchInput, fontSearchResults, prevFontBtn, nextFontBtn,
            configManager,
            onFontChange: () => themeManager.updateThemePreview()
        });

        const themeManager = new ThemeManager({
            configManager, badgeManager, chatRenderer, fontManager, domRefs
        });

        const settingsPanel = new SettingsPanelManager({
            configManager, chatRenderer, chatConnection, badgeManager,
            fontManager, themeManager, domRefs
        });

        // --- GLOBAL BRIDGES ---
        // theme-carousel.js and theme-generator.js are non-module scripts
        // that call these via window.*
        window.applyTheme = (themeName) => themeManager.applyTheme(themeName);
        window.updateThemePreview = () => themeManager.updateThemePreview();

        // --- CHAT MODE SWITCHING ---

        function switchChatMode(mode, applyVisualsOnly = false) {
            try {
                configManager.updateConfig('chatMode', mode);

                if (!popupContainer || !chatContainer || !chatWrapper) {
                    console.error('Required chat containers not found in DOM');
                    return;
                }

                const popupMessages = document.getElementById('popup-messages');
                if (popupMessages) popupMessages.innerHTML = '';

                const isPopup = (mode === 'popup');
                popupContainer.style.display = isPopup ? 'block' : 'none';
                chatWrapper.style.display = isPopup ? 'none' : 'block';
                document.body.classList.toggle('popup-mode', isPopup);
                document.body.classList.toggle('window-mode', !isPopup);

                if (!applyVisualsOnly && chatMessages) {
                    chatMessages.innerHTML = '';
                    chatRenderer.addSystemMessage(isPopup ? 'Switched to popup mode.' : 'Switched to window mode.');
                    chatRenderer.addChatMessage({ username: 'System', message: 'Chat mode switched.', color: configManager.config.usernameColor, tags: {} });
                }

                if (isPopup && popupMessages && configManager.config.popup) {
                    const direction = configManager.config.popup.direction || 'from-bottom';
                    const position = { top: 'auto', bottom: '10px' };
                    if (['from-top', 'from-left', 'from-right'].includes(direction)) {
                        position.top = '10px'; position.bottom = 'auto';
                    }
                    popupMessages.removeAttribute('style');
                    popupMessages.style.top = position.top;
                    popupMessages.style.bottom = position.bottom;
                }

                updateModeSpecificSettingsVisibility(mode);

            } catch (error) {
                console.error('Error switching chat mode:', error);
                chatRenderer.addSystemMessage('Error switching chat mode.');
            }
        }

        function updateModeSpecificSettingsVisibility(mode) {
            const isPopup = mode === 'popup';
            document.querySelectorAll('.popup-setting').forEach(el => el.style.display = isPopup ? 'flex' : 'none');
            document.querySelectorAll('.window-only-setting').forEach(el => el.style.display = isPopup ? 'none' : 'flex');
        }

        configManager.setSwitchChatModeCallback(switchChatMode);

        // --- CONNECTION STATE UI ---

        chatConnection.onConnectionChange((platform, isConnected, channelName) => {
            const isAnyActive = chatConnection.twitch.isActive() || chatConnection.youtube.isActive();
            updateConnectionStateUI(isAnyActive);
            if (platform === 'twitch') {
                if (twitchDisconnectBtn) {
                    twitchDisconnectBtn.style.display = isConnected ? 'block' : 'none';
                    if (isConnected) twitchDisconnectBtn.textContent = `Disconnect from ${channelName}`;
                }
                if (twitchChannelForm) twitchChannelForm.style.display = isConnected ? 'none' : 'flex';
                if (document.getElementById('twitch-status')) document.getElementById('twitch-status').textContent = isConnected ? 'Connected' : '';
            } else if (platform === 'youtube') {
                if (youtubeDisconnectBtn) {
                    youtubeDisconnectBtn.style.display = isConnected ? 'block' : 'none';
                    if (isConnected) youtubeDisconnectBtn.textContent = `Disconnect from ${channelName}`;
                }
                if (youtubeChannelForm) youtubeChannelForm.style.display = isConnected ? 'none' : 'flex';
                if (document.getElementById('youtube-status')) document.getElementById('youtube-status').textContent = isConnected ? 'Connected' : '';
            }
            
            chatRenderer.config = configManager.config;
        });

        function updateConnectionStateUI(isConnected) {
            const isPopupMode = configManager.config.chatMode === 'popup';
            if (initialConnectionPrompt) initialConnectionPrompt.style.display = isConnected ? 'none' : 'flex';
            if (popupContainer) popupContainer.style.display = isConnected && isPopupMode ? 'block' : 'none';
            if (chatWrapper) chatWrapper.style.display = isConnected && !isPopupMode ? 'block' : 'none';
            document.body.classList.toggle('disconnected', !isConnected);
        }

        // --- UI EVENT HANDLERS ---

        // Background color + opacity
        function updateBgColor() {
            if (!bgColorInput || !bgOpacityInput) return;
            const hexColor = bgColorInput.value;
            const opacity = parseInt(bgOpacityInput.value) / 100;
            const rgbaColorForCSS = UIHelpers.hexToRgba(hexColor, opacity);
            document.documentElement.style.setProperty('--chat-bg-color', rgbaColorForCSS);
            document.documentElement.style.setProperty('--popup-bg-color', rgbaColorForCSS);
            if (bgOpacityValue) bgOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
            themeManager.updateThemePreview();
        }
        bgColorInput?.addEventListener('input', updateBgColor);
        bgOpacityInput?.addEventListener('input', updateBgColor);

        // Background image opacity
        function updateBgImageOpacity() {
            if (!bgImageOpacityInput) return;
            const opacity = parseInt(bgImageOpacityInput.value) / 100;
            document.documentElement.style.setProperty('--chat-bg-image-opacity', opacity);
            document.documentElement.style.setProperty('--popup-bg-image-opacity', opacity);
            if (bgImageOpacityValue) bgImageOpacityValue.textContent = `${bgImageOpacityInput.value}%`;
            themeManager.updateThemePreview();
        }
        if (bgImageOpacityInput) bgImageOpacityInput.addEventListener('input', updateBgImageOpacity);

        // Color preset button click handlers
        document.querySelectorAll('.color-btn').forEach(button => {
            const color = button.getAttribute('data-color');
            if (color && color !== 'chroma-key') button.style.backgroundColor = color;

            if (color === 'transparent' || ['#ffffff', '#ffdeec', '#f5f2e6'].includes(color)) {
                button.style.border = '1px solid #888';
            }
            if (['#000000', '#121212', '#1a1a1a', '#0c0c28', '#4e3629'].includes(color)) {
                button.style.color = 'white';
            } else if (color !== 'chroma-key') {
                button.style.color = 'black';
            }

            button.addEventListener('click', (e) => {
                const color = e.target.getAttribute('data-color');
                const target = e.target.getAttribute('data-target');
                if (!target || !color) return;

                document.querySelectorAll(`.color-btn[data-target="${target}"]`).forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');

                switch (target) {
                    case 'bg':
                        if (color === 'chroma-key') {
                            // Chroma key mode: green page background, transparent chat bg
                            document.body.classList.add('chroma-key');
                            if (bgColorInput) bgColorInput.value = '#000000';
                            if (bgOpacityInput) bgOpacityInput.value = 0;
                            configManager.updateConfig('chromaKey', true);
                        } else {
                            document.body.classList.remove('chroma-key');
                            configManager.updateConfig('chromaKey', false);
                            if (color === 'transparent') {
                                if (bgColorInput) bgColorInput.value = '#000000';
                                if (bgOpacityInput) bgOpacityInput.value = 0;
                            } else {
                                if (bgColorInput) bgColorInput.value = color;
                            }
                        }
                        updateBgColor();
                        break;
                    case 'border':
                        if (color === 'transparent') {
                            document.documentElement.style.setProperty('--chat-border-color', 'transparent');
                            document.documentElement.style.setProperty('--popup-border-color', 'transparent');
                        } else {
                            if (borderColorInput) borderColorInput.value = color;
                            document.documentElement.style.setProperty('--chat-border-color', color);
                            document.documentElement.style.setProperty('--popup-border-color', color);
                        }
                        break;
                    case 'text':
                        if (textColorInput) textColorInput.value = color;
                        document.documentElement.style.setProperty('--chat-text-color', color);
                        document.documentElement.style.setProperty('--popup-text-color', color);
                        break;
                    case 'username':
                        if (usernameColorInput) usernameColorInput.value = color;
                        document.documentElement.style.setProperty('--username-color', color);
                        document.documentElement.style.setProperty('--popup-username-color', color);
                        break;
                }
                themeManager.updateColorPreviews();
            });
        });

        // Direct color input handlers
        borderColorInput?.addEventListener('input', () => {
            const value = borderColorInput.value;
            const finalColor = value === 'transparent' ? 'transparent' : value;
            document.documentElement.style.setProperty('--chat-border-color', finalColor);
            document.documentElement.style.setProperty('--popup-border-color', finalColor);
            themeManager.updateColorPreviews();
            themeManager.updateThemePreview();
        });
        textColorInput?.addEventListener('input', () => {
            document.documentElement.style.setProperty('--chat-text-color', textColorInput.value);
            document.documentElement.style.setProperty('--popup-text-color', textColorInput.value);
            themeManager.updateColorPreviews();
            themeManager.updateThemePreview();
        });
        usernameColorInput?.addEventListener('input', () => {
            document.documentElement.style.setProperty('--username-color', usernameColorInput.value);
            document.documentElement.style.setProperty('--popup-username-color', usernameColorInput.value);
            themeManager.updateColorPreviews();
            themeManager.updateThemePreview();
        });

        // Font size slider
        fontSizeSlider?.addEventListener('input', () => {
            const value = fontSizeSlider.value;
            if (fontSizeValue) fontSizeValue.textContent = `${value}px`;
            document.documentElement.style.setProperty('--font-size', `${value}px`);
            configManager.updateConfig('fontSize', parseInt(value, 10));
            themeManager.updateThemePreview();
        });

        // Chat width/height sliders
        chatWidthInput?.addEventListener('input', () => {
            const value = chatWidthInput.value;
            if (chatWidthValue) chatWidthValue.textContent = `${value}%`;
            document.documentElement.style.setProperty('--chat-width', `${value}%`);
        });
        chatHeightInput?.addEventListener('input', () => {
            const value = chatHeightInput.value;
            if (chatHeightValue) chatHeightValue.textContent = `${value}%`;
            document.documentElement.style.setProperty('--chat-height', `${value}%`);
        });

        // Border radius presets
        function applyBorderRadius(value) {
            const cssValue = UIHelpers.getBorderRadiusValue(value);
            if (!cssValue) return;
            document.documentElement.style.setProperty('--chat-border-radius', cssValue);
            configManager.updateConfig('borderRadius', value);
            UIHelpers.highlightBorderRadiusButton(cssValue, borderRadiusPresets);
            themeManager.updateThemePreview();
        }
        borderRadiusPresets?.querySelectorAll('.preset-btn')
            .forEach(btn => btn.addEventListener('click', () => applyBorderRadius(btn.dataset.value)));

        // Box shadow presets
        function applyBoxShadow(preset) {
            const cssValue = UIHelpers.getBoxShadowValue(preset);
            if (!cssValue) return;
            document.documentElement.style.setProperty('--chat-box-shadow', cssValue);
            configManager.updateConfig('boxShadow', preset);
            UIHelpers.highlightBoxShadowButton(preset, boxShadowPresets);
            themeManager.updateThemePreview();
        }
        boxShadowPresets?.querySelectorAll('.preset-btn')
            .forEach(btn => btn.addEventListener('click', () => applyBoxShadow(btn.dataset.value)));

        // Text shadow presets
        function applyTextShadow(preset) {
            const cssValue = UIHelpers.getTextShadowValue(preset);
            if (!cssValue) return;
            document.documentElement.style.setProperty('--chat-text-shadow', cssValue);
            configManager.updateConfig('textShadow', preset);
            UIHelpers.highlightTextShadowButton(preset, textShadowPresets);
            themeManager.updateThemePreview();
        }
        textShadowPresets?.querySelectorAll('.preset-btn')
            .forEach(btn => btn.addEventListener('click', () => applyTextShadow(btn.dataset.value)));

        // Font weight presets
        function applyFontWeight(value) {
            document.documentElement.style.setProperty('--font-weight', value);
            configManager.updateConfig('fontWeight', value);
            UIHelpers.highlightFontWeightButton(value, fontWeightPresets);
            themeManager.updateThemePreview();
        }
        fontWeightPresets?.querySelectorAll('.preset-btn')
            .forEach(btn => btn.addEventListener('click', () => applyFontWeight(btn.dataset.value)));

        // Chat mode radios
        document.querySelectorAll('input[name="chat-mode"]').forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    switchChatMode(e.target.value, false);
                    updateModeSpecificSettingsVisibility(e.target.value);
                }
            });
        });

        // Popup animation direction
        document.querySelectorAll('input[name="popup-direction"]').forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (configManager.config.popup) configManager.updateConfig('popup', { ...configManager.config.popup, direction: e.target.value });
                    if (configManager.config.chatMode === 'popup') {
                        const popupMessages = document.getElementById('popup-messages');
                        if (popupMessages && configManager.config.popup) {
                            const direction = configManager.config.popup.direction || 'from-bottom';
                            const position = { top: 'auto', bottom: '10px' };
                            if (['from-top', 'from-left', 'from-right'].includes(direction)) {
                                position.top = '10px'; position.bottom = 'auto';
                            }
                            popupMessages.removeAttribute('style');
                            popupMessages.style.top = position.top;
                            popupMessages.style.bottom = position.bottom;
                        }
                    }
                }
            });
        });

        // Popup duration slider
        document.getElementById('popup-duration')?.addEventListener('input', (e) => {
            if (configManager.config.popup) {
                configManager.updateConfig('popup', { ...configManager.config.popup, duration: parseInt(e.target.value) });
            }
            const valueDisplay = document.getElementById('popup-duration-value');
            if (valueDisplay && configManager.config.popup) valueDisplay.textContent = `${configManager.config.popup.duration}s`;
        });

        // Popup max messages
        document.getElementById('popup-max-messages')?.addEventListener('change', (e) => {
            if (configManager.config.popup) {
                configManager.updateConfig('popup', { ...configManager.config.popup, maxMessages: parseInt(e.target.value) });
            }
        });

        // Window mode max messages
        maxMessagesInput?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1) {
                configManager.updateConfig('maxMessages', value);
                chatRenderer.config = configManager.config;
                if (configManager.config.chatMode === 'window') {
                    chatRenderer.limitMessages();
                }
            }
        });

        // Username color override toggle
        overrideUsernameColorsInput?.addEventListener('change', () => {
            const isChecked = overrideUsernameColorsInput.checked;
            configManager.updateConfig('overrideUsernameColors', isChecked);
            chatRenderer.config = configManager.config;
            document.documentElement.classList.toggle('override-username-colors', isChecked);
            themeManager.updateThemePreview();
        });

        // Badge toggle
        const showPlatformBadgesToggle = document.getElementById('show-platform-badges-toggle');
        if (showPlatformBadgesToggle) {
            showPlatformBadgesToggle.addEventListener('change', () => {
                configManager.updateConfig('showPlatformBadges', showPlatformBadgesToggle.checked);
                chatRenderer.config = configManager.config;
            });
        }
        
        if (showBadgesToggle) {
            showBadgesToggle.addEventListener('change', () => themeManager.updateThemePreview());
        }

        // Pronoun toggle
        if (showPronounsToggle) {
            showPronounsToggle.addEventListener('change', () => {
                configManager.updateConfig('showPronouns', showPronounsToggle.checked);
                chatRenderer.config = configManager.config;
                themeManager.updateThemePreview();
            });
        }

        // --- SETTINGS PANEL BUTTON HANDLERS ---

        if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
            settingsBtn.addEventListener('click', (e) => { e?.preventDefault(); settingsPanel.openSettingsPanel(); });
            settingsBtn.dataset.listenerAttached = 'true';
        }
        const popupSettingsBtn = document.getElementById('popup-settings-btn');
        if (popupSettingsBtn && !popupSettingsBtn.dataset.listenerAttached) {
            popupSettingsBtn.addEventListener('click', (e) => { e?.preventDefault(); e?.stopPropagation(); settingsPanel.openSettingsPanel(); });
            popupSettingsBtn.dataset.listenerAttached = 'true';
        }

        if (saveConfigBtn && !saveConfigBtn.dataset.listenerAttached) {
            saveConfigBtn.addEventListener('click', (e) => { e?.preventDefault(); settingsPanel.saveConfiguration(); });
            saveConfigBtn.dataset.listenerAttached = 'true';
        }

        if (cancelConfigBtn && !cancelConfigBtn.dataset.listenerAttached) {
            cancelConfigBtn.addEventListener('click', () => settingsPanel.closeConfigPanel(true));
            cancelConfigBtn.dataset.listenerAttached = 'true';
        }

        if (resetConfigBtn && !resetConfigBtn.dataset.listenerAttached) {
            resetConfigBtn.addEventListener('click', () => {
                settingsPanel.applyDefaultSettings();
                configManager.applyConfiguration(configManager.config);
                settingsPanel.updateConfigPanelFromConfig();
                chatRenderer.addSystemMessage("Settings reset to default.");
            });
            resetConfigBtn.dataset.listenerAttached = 'true';
        }

        // --- CONNECTION HANDLERS ---

        function connectToChat() {
            const twitchTarget = twitchChannelInput?.value || initialTwitchInput?.value || '';
            const ytTarget = youtubeChannelInput?.value || initialYoutubeInput?.value || '';
            
            if (!twitchTarget && !ytTarget) {
                chatRenderer.addSystemMessage('Please enter a Twitch channel or YouTube stream URL/handle');
                return;
            }
            if (twitchTarget && !chatConnection.twitch.isActive()) chatConnection.connectTwitch(twitchTarget);
            if (ytTarget && !chatConnection.youtube.isActive()) chatConnection.connectYouTube(ytTarget);
        }

        // Initial connection prompt handlers
        if (initialConnectBtn) {
            initialConnectBtn.addEventListener('click', () => {
                if (twitchChannelInput && initialTwitchInput) twitchChannelInput.value = initialTwitchInput.value;
                if (youtubeChannelInput && initialYoutubeInput) youtubeChannelInput.value = initialYoutubeInput.value;
                connectToChat();
            });
            const checkEnter = (e) => {
                if (e.key === 'Enter') {
                    if (twitchChannelInput && initialTwitchInput) twitchChannelInput.value = initialTwitchInput.value;
                    if (youtubeChannelInput && initialYoutubeInput) youtubeChannelInput.value = initialYoutubeInput.value;
                    connectToChat();
                }
            };
            initialTwitchInput?.addEventListener('keypress', checkEnter);
            initialYoutubeInput?.addEventListener('keypress', checkEnter);
        }

        if (openSettingsFromPromptBtn && configPanel) {
            openSettingsFromPromptBtn.addEventListener('click', () => {
                if (initialTwitchInput && twitchChannelInput) twitchChannelInput.value = initialTwitchInput.value;
                if (initialYoutubeInput && youtubeChannelInput) youtubeChannelInput.value = initialYoutubeInput.value;
                settingsPanel.openSettingsPanel();
            });
        }

        // Connect buttons in settings panel
        if (twitchConnectBtn && twitchChannelInput) {
            if (!twitchConnectBtn.dataset.listenerAttachedPanel) {
                twitchConnectBtn.addEventListener('click', () => chatConnection.connectTwitch(twitchChannelInput.value));
                twitchConnectBtn.dataset.listenerAttachedPanel = 'true';
            }
            twitchChannelInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation();
                    chatConnection.connectTwitch(twitchChannelInput.value);
                }
            });
            twitchChannelInput.addEventListener('input', () => {
                if (initialTwitchInput) initialTwitchInput.value = twitchChannelInput.value;
            });
        }
        
        if (youtubeConnectBtn && youtubeChannelInput) {
            if (!youtubeConnectBtn.dataset.listenerAttachedPanel) {
                youtubeConnectBtn.addEventListener('click', () => chatConnection.connectYouTube(youtubeChannelInput.value));
                youtubeConnectBtn.dataset.listenerAttachedPanel = 'true';
            }
            youtubeChannelInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation();
                    chatConnection.connectYouTube(youtubeChannelInput.value);
                }
            });
            youtubeChannelInput.addEventListener('input', () => {
                if (initialYoutubeInput) initialYoutubeInput.value = youtubeChannelInput.value;
            });
        }

        if (twitchDisconnectBtn) twitchDisconnectBtn.addEventListener('click', () => chatConnection.disconnectTwitch());
        if (youtubeDisconnectBtn) youtubeDisconnectBtn.addEventListener('click', () => chatConnection.disconnectYouTube());

        // --- INITIALIZATION ---

        const sceneName = UIHelpers.getUrlParameter('scene') || 'default';
        configManager.loadSavedConfig(sceneName);
        configManager.applyConfiguration(configManager.config);
        badgeManager.config = configManager.config;
        chatRenderer.config = configManager.config;
        themeManager.lastAppliedThemeValue = configManager.config.theme || 'default';

        UIHelpers.fixCssVariables();

        settingsPanel.updateConfigPanelFromConfig();

        // Auto-connect if last channel is saved
        const savedTwitch = configManager.config.lastTwitchChannel || configManager.config.lastChannel;
        const savedYouTube = configManager.config.lastYouTubeTarget;

        if (savedTwitch || savedYouTube) {
            updateConnectionStateUI(true);
            if (savedTwitch) {
                if (twitchChannelInput) twitchChannelInput.value = savedTwitch;
                if (initialTwitchInput) initialTwitchInput.value = savedTwitch;
            }
            if (savedYouTube) {
                if (youtubeChannelInput) youtubeChannelInput.value = savedYouTube;
                if (initialYoutubeInput) initialYoutubeInput.value = savedYouTube;
            }
            connectToChat();
        } else {
            updateConnectionStateUI(false);
            if (twitchChannelInput) twitchChannelInput.value = '';
            if (initialTwitchInput) initialTwitchInput.value = '';
            if (youtubeChannelInput) youtubeChannelInput.value = '';
            if (initialYoutubeInput) initialYoutubeInput.value = '';
        }

        // Apply chat mode
        if (configManager.config.chatMode === 'popup') {
            switchChatMode('popup', true);
            chatRenderer.addChatMessage({ username: 'Test', message: 'Test message', color: configManager.config.usernameColor, tags: {} });
        }

        // Event listeners for theme changes
        document.addEventListener('theme-changed', () => themeManager.updateThemePreview());
        document.addEventListener('theme-carousel-ready', () => themeManager.updateThemePreview());
        document.addEventListener('theme-generated-and-added', (event) => {
            if (!(event.detail && event.detail.themeValue)) {
                console.warn("[Event Listener] Received theme-generated-and-added event without valid themeValue.");
                return;
            }
            themeManager.applyTheme(event.detail.themeValue);
            
            // Auto-save the config when a new theme is generated so the selection persists on reload
            const sceneName = UIHelpers.getUrlParameter('scene') || 'default';
            configManager.saveConfig(sceneName);
        });

        themeManager.updateColorPreviews();
    }
})();
