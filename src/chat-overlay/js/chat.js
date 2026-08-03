import { mount, addTheme, getThemes, applyTheme, updateThemeDetails, highlightActiveCard, applyAndScrollToTheme, scrollToThemeCard, loadGoogleFont, availableFonts, availableThemes, currentThemeIndex } from './theme-carousel.js';
// ES6 Module Imports
import { UIHelpers } from './modules/ui-helpers.js';
import { ScrollManager } from './modules/scroll-manager.js';
import { BadgeManager } from './modules/badge-manager.js';
import { PronounManager } from './modules/pronoun-manager.js';
import { ConfigManager } from './modules/config-manager.js';
import { ChatRenderer } from './modules/chat-renderer.js';
import { CheermoteManager } from './modules/cheermote-manager.js';
import { ChatConnection } from './modules/chat-connection.js';
import { ThirdPartyEmoteManager } from './modules/third-party-emote-manager.js';
import { FontManager } from './modules/font-manager.js';
import { ThemeManager } from './modules/theme-manager.js';
import { SettingsPanelManager } from './modules/settings-panel-manager.js';
import { SceneSyncManager } from './modules/scene-sync-manager.js';
import { bindSettingsEvents } from "./modules/chat-event-bindings.js";

// Wait for DOM ready to run this code
(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    function initApp() {
        // Mount the theme carousel into its container before any DOM lookups
        // below (e.g. #theme-preview), since mount() is what injects that
        // markup. onApply is wired to themeManager below via a mutable
        // reference — mount() only registers event listeners here, it doesn't
        // invoke onApply synchronously, so themeManager being assigned later
        // (once constructed) is safe.
        let themeManager;
        const themeCarouselMountEl = document.getElementById('theme-carousel-mount');
        if (themeCarouselMountEl && typeof mount === 'function') {
            mount(themeCarouselMountEl, {
                onApply: (theme) => themeManager && themeManager.applyTheme(theme.value)
            });
        } else {
            console.warn('[chat.js] mount not found; theme carousel will not render.');
        }

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
        const saveThemePresetBtn = document.getElementById('save-theme-preset-btn');
        const fontSizeSlider = document.getElementById('font-size');
        const fontSizeValue = document.getElementById('font-size-value');
        const bgColorInput = document.getElementById('bg-color');
        const bgColorHex = document.getElementById('bg-color-hex');
        const bgOpacityInput = document.getElementById('bg-opacity');
        const bgOpacityValue = document.getElementById('bg-opacity-value');
        const borderColorInput = document.getElementById('border-color');
        const borderColorHex = document.getElementById('border-color-hex');
        const textColorInput = document.getElementById('text-color');
        const textColorHex = document.getElementById('text-color-hex');
        const usernameColorInput = document.getElementById('username-color');
        const usernameColorHex = document.getElementById('username-color-hex');
        const timestampColorInput = document.getElementById('timestamp-color');
        const timestampColorHex = document.getElementById('timestamp-color-hex');
        const pronounBadgeColorInput = document.getElementById('pronoun-badge-color');
        const pronounBadgeColorHex = document.getElementById('pronoun-badge-color-hex');
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
        const thirdPartyEmotesToggle = document.getElementById('third-party-emotes-toggle');
        const thirdPartyChannelEmotesToggle = document.getElementById('third-party-channel-emotes-toggle');
        const thirdPartyFilter7tvTwitchDisallowedToggle = document.getElementById('third-party-filter-7tv-twitch-disallowed-toggle');
        const thirdPartyFilter7tvSexualToggle = document.getElementById('third-party-filter-7tv-sexual-toggle');
        const thirdPartyFilter7tvEpilepsyToggle = document.getElementById('third-party-filter-7tv-epilepsy-toggle');
        const thirdPartyFilter7tvEdgyToggle = document.getElementById('third-party-filter-7tv-edgy-toggle');
        const bgImageOpacityInput = document.getElementById('bg-image-opacity');
        const bgImageOpacityValue = document.getElementById('bg-image-opacity-value');

        // --- SHARED DOM REFS BAG ---
        const popupSettingsBtn = document.getElementById("popup-settings-btn");

        const domRefs = {
            bgColorInput, bgColorHex, bgOpacityInput, bgOpacityValue, borderColorInput, borderColorHex,
            textColorInput, textColorHex, usernameColorInput, usernameColorHex,
            timestampColorInput, timestampColorHex, pronounBadgeColorInput, pronounBadgeColorHex,
            overrideUsernameColorsInput,
            bgImageOpacityInput, bgImageOpacityValue, borderRadiusPresets,
            boxShadowPresets, textShadowPresets, fontWeightPresets,
            fontSizeSlider, fontSizeValue, chatWidthInput, chatWidthValue,
            chatHeightInput, chatHeightValue, maxMessagesInput, showTimestampsInput,
            themePreview, chatWrapper, showBadgesToggle, showPronounsToggle,
            enlargeSingleEmotesToggle, thirdPartyEmotesToggle, thirdPartyChannelEmotesToggle, thirdPartyFilter7tvTwitchDisallowedToggle, thirdPartyFilter7tvSexualToggle, thirdPartyFilter7tvEpilepsyToggle, thirdPartyFilter7tvEdgyToggle, configPanel, twitchChannelForm, youtubeChannelForm, 
            twitchDisconnectBtn, youtubeDisconnectBtn, twitchChannelInput, youtubeChannelInput,
            initialConnectionPrompt, initialTwitchInput, initialYoutubeInput, initialConnectBtn, openSettingsFromPromptBtn,
            twitchConnectBtn, youtubeConnectBtn, settingsBtn, popupSettingsBtn, saveConfigBtn, cancelConfigBtn, resetConfigBtn,
            saveThemePresetBtn
        };

        // --- MODULE INITIALIZATION ---

        const configManager = new ConfigManager();
        const scrollManager = new ScrollManager(scrollArea, chatMessages);
        const badgeManager = new BadgeManager(configManager.config);
        const cheermoteManager = new CheermoteManager(configManager.config);
        const thirdPartyEmoteManager = new ThirdPartyEmoteManager(configManager.config);
        const pronounManager = new PronounManager();
        pronounManager.loadDefinitions();

        const chatRenderer = new ChatRenderer(configManager.config, scrollManager, badgeManager, pronounManager, cheermoteManager, thirdPartyEmoteManager);
        const chatConnection = new ChatConnection(configManager, chatRenderer, badgeManager, cheermoteManager, thirdPartyEmoteManager);

        const fontManager = new FontManager({
            fontSearchInput, fontSearchResults, prevFontBtn, nextFontBtn,
            configManager,
            onFontChange: () => themeManager.updateThemePreview()
        });

        themeManager = new ThemeManager({
            configManager, badgeManager, chatRenderer, fontManager, domRefs
        });

        const settingsPanel = new SettingsPanelManager({
            configManager, chatRenderer, chatConnection, badgeManager,
            fontManager, themeManager, thirdPartyEmoteManager, domRefs
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

                const isPopup = (mode === 'popup');
                popupContainer.style.display = isPopup ? 'block' : 'none';
                chatWrapper.style.display = isPopup ? 'none' : 'block';
                document.body.classList.toggle('popup-mode', isPopup);
                document.body.classList.toggle('window-mode', !isPopup);

                if (!applyVisualsOnly) {
                    if (popupMessages) popupMessages.innerHTML = '';
                    if (chatMessages) {
                        chatMessages.innerHTML = '';
                        chatRenderer.addSystemMessage(isPopup ? 'Switched to popup mode.' : 'Switched to window mode.');
                        chatRenderer.addChatMessage({ username: 'System', message: 'Chat mode switched.', color: configManager.config.usernameColor, tags: {} });
                    }
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

                    // Update direction class on existing popups
                    popupMessages.querySelectorAll('.popup-message').forEach(el => {
                        el.classList.remove('from-top', 'from-bottom', 'from-left', 'from-right');
                        el.classList.add(direction);
                    });

                    // Enforce maxMessages on active popups if maxMessages reduced
                    const maxMessages = configManager.config.popup.maxMessages;
                    if (maxMessages && maxMessages > 0) {
                        const activePopups = Array.from(popupMessages.querySelectorAll('.popup-message:not([data-removing])'));
                        if (activePopups.length > maxMessages) {
                            const removeCount = activePopups.length - maxMessages;
                            for (let i = 0; i < removeCount; i++) {
                                chatRenderer.removePopup(activePopups[i]);
                            }
                        }
                    }
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

        bindSettingsEvents(domRefs, {
            configManager, themeManager, chatRenderer, chatConnection, thirdPartyEmoteManager, settingsPanel, switchChatMode, updateModeSpecificSettingsVisibility
        });

        // --- INITIALIZATION ---

        const sceneName = UIHelpers.getUrlParameter('scene') || 'default';
        const syncToken = UIHelpers.getUrlParameter('sync');
        const isDemoMode = UIHelpers.getUrlParameter('demo') === '1';

        configManager.loadSavedConfig(sceneName, syncToken);
        configManager.applyConfiguration(configManager.config);
        badgeManager.config = configManager.config;
        chatRenderer.config = configManager.config;
        themeManager.lastAppliedThemeValue = configManager.config.theme || 'default';

        if (configManager.pendingUpgradeNotice && !isDemoMode) {
            configManager.pendingUpgradeNotice = false;
            // Long enough to read, short enough that it clears itself off a live stream.
            chatRenderer.addSystemMessage('Third-party emotes (BTTV, FFZ, 7TV) are now supported — enable them in Settings.', true, 8000);
        }

        UIHelpers.fixCssVariables();

        // Instantiate and wire SceneSyncManager
        const sceneSyncManager = new SceneSyncManager();
        settingsPanel.setSceneSyncManager(sceneSyncManager);

        settingsPanel.updateConfigPanelFromConfig();

        if (isDemoMode) {
            // Start scene sync even in demo mode so saves from the iframe's config
            // panel push to Firestore (picked up by the scene creator's subscription).
            sceneSyncManager.start({
                sceneName,
                configManager,
                badgeManager,
                chatRenderer,
                thirdPartyEmoteManager,
                settingsPanel,
                chatConnection
            });

            // Demo Mode: suppress connection prompts, disable auto-connect, listen for postMessage
            if (initialConnectionPrompt) {
                initialConnectionPrompt.style.display = 'none';
            }

            const demoMessages = [
                { username: 'StreamFan', message: 'Hello! Loving the overlay design! ✨', color: '#9147ff' },
                { username: 'PixelMaster', message: 'That style looks super clean 🔥', color: '#00f0ff' },
                { username: 'CozyVibes', message: 'Great color palette!', color: '#ff79c6' },
                { username: 'NightOwl', message: 'Customization works live! 🎉', color: '#50fa7b' }
            ];

            let demoIndex = 0;
            // Initial sample message
            chatRenderer.addChatMessage(demoMessages[0]);
            demoIndex++;

            setInterval(() => {
                const msg = demoMessages[demoIndex % demoMessages.length];
                chatRenderer.addChatMessage({ username: msg.username, message: msg.message, color: msg.color, tags: {} });
                demoIndex++;
            }, 3500);

            // Listen to postMessage for live preview from Creator form
            window.addEventListener('message', (event) => {
                // Only the same-origin scene creator may drive the preview
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'PREVIEW_CONFIG_UPDATE' && event.data.config) {
                    configManager.applyConfiguration(event.data.config);
                    badgeManager.config = configManager.config;
                    chatRenderer.config = configManager.config;
                    if (thirdPartyEmoteManager) thirdPartyEmoteManager.config = configManager.config;
                    UIHelpers.fixCssVariables();
                    settingsPanel.updateConfigPanelFromConfig();
                    themeManager.lastAppliedThemeValue = configManager.config.theme || 'default';

                    if (configManager.config.chatMode === 'popup') {
                        const popupMessages = document.getElementById('popup-messages');
                        const activePopups = popupMessages ? popupMessages.querySelectorAll('.popup-message:not([data-removing])') : [];
                        if (!popupMessages || activePopups.length === 0) {
                            const msg = demoMessages[demoIndex % demoMessages.length];
                            chatRenderer.addChatMessage({ username: msg.username, message: msg.message, color: msg.color, tags: {} });
                            demoIndex++;
                        }
                    }
                }
            });
        } else {
            // Normal Mode: start live sync if token exists, and handle auto-connect
            sceneSyncManager.start({
                sceneName,
                configManager,
                badgeManager,
                chatRenderer,
                thirdPartyEmoteManager,
                settingsPanel,
                chatConnection
            });

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
                if (savedTwitch && !chatConnection.twitch.isActive()) chatConnection.connectTwitch(savedTwitch);
                if (savedYouTube && !chatConnection.youtube.isActive()) chatConnection.connectYouTube(savedYouTube);
            } else {
                updateConnectionStateUI(false);
                if (twitchChannelInput) twitchChannelInput.value = '';
                if (initialTwitchInput) initialTwitchInput.value = '';
                if (youtubeChannelInput) youtubeChannelInput.value = '';
                if (initialYoutubeInput) initialYoutubeInput.value = '';
            }
        }

        // Apply chat mode
        if (configManager.config.chatMode === 'popup') {
            switchChatMode('popup', true);
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
