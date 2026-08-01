/**
 * Chat Scene Creator JavaScript Module
 * Handles management of chat overlay scenes, settings customization, live preview streaming, and Firestore web sync.
 */

import { ConfigManager, CONFIG_VERSION } from './modules/config-manager.js';
import { getProxyBaseUrl } from './modules/scene-sync-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    class ChatSceneCreator {
        constructor() {
            this.configManagerHelper = new ConfigManager();
            this.instances = {}; // Stores instance data { id: { name, syncToken, config, ... } }
            this.instanceOrder = [];
            this.currentInstanceId = null;
            this.draggedItemId = null;
            this.firestoreUnsubscribe = null;
            this.db = null;
            // Per-session id so our own Firestore echoes can be told apart from
            // edits made in the OBS panel or another creator tab.
            this.myClientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `creator-${Date.now()}-${Math.random()}`;

            this.initializeDOM();
            this.loadInstances();
            this.setupEventListeners();
            this.setupFormLivePreview();
        }

        // Initialize DOM references
        initializeDOM() {
            this.instanceList = document.getElementById('instanceList');
            this.createInstanceBtn = document.getElementById('createInstanceBtn');
            this.importBtn = document.getElementById('importBtn');
            this.exportAllBtn = document.getElementById('exportAllBtn');

            this.workspaceTitle = document.getElementById('workspaceTitle');
            this.workspaceActions = document.getElementById('workspaceActions');
            this.configLayout = document.getElementById('configLayout');
            this.emptyState = document.getElementById('emptyState');
            this.emptyStateCreateBtn = document.getElementById('emptyStateCreateBtn');
            this.obsSetup = document.getElementById('obsSetup');

            this.duplicateBtn = document.getElementById('duplicateBtn');
            this.deleteBtn = document.getElementById('deleteBtn');
            this.exportBtn = document.getElementById('exportBtn');

            // Form inputs
            this.instanceName = document.getElementById('instanceName');
            this.instanceId = document.getElementById('instanceId');

            this.creatorTwitchChannel = document.getElementById('creatorTwitchChannel');
            this.creatorYoutubeTarget = document.getElementById('creatorYoutubeTarget');
            this.applyChannelBtn = document.getElementById('applyChannelBtn');

            this.creatorTheme = document.getElementById('creatorTheme');
            this.creatorBgColor = document.getElementById('creatorBgColor');
            this.creatorBgOpacity = document.getElementById('creatorBgOpacity');
            this.bgOpacityVal = document.getElementById('bgOpacityVal');
            this.creatorTextColor = document.getElementById('creatorTextColor');
            this.creatorUsernameColor = document.getElementById('creatorUsernameColor');
            this.creatorBorderColor = document.getElementById('creatorBorderColor');
            this.creatorTimestampColor = document.getElementById('creatorTimestampColor');

            this.creatorFontFamily = document.getElementById('creatorFontFamily');
            this.creatorFontSize = document.getElementById('creatorFontSize');
            this.creatorFontWeight = document.getElementById('creatorFontWeight');
            this.creatorChatWidth = document.getElementById('creatorChatWidth');
            this.creatorChatHeight = document.getElementById('creatorChatHeight');
            this.creatorBorderRadius = document.getElementById('creatorBorderRadius');

            this.creatorShowTimestamps = document.getElementById('creatorShowTimestamps');
            this.creatorShowBadges = document.getElementById('creatorShowBadges');
            this.creatorShowPronouns = document.getElementById('creatorShowPronouns');
            this.creatorThirdPartyEmotes = document.getElementById('creatorThirdPartyEmotes');
            this.creatorTopFade = document.getElementById('creatorTopFade');
            this.creatorChromaKey = document.getElementById('creatorChromaKey');

            this.saveSettingsBtn = document.getElementById('saveSettingsBtn');

            // Sync controls
            this.syncBadge = document.getElementById('syncBadge');
            this.enableSyncBtn = document.getElementById('enableSyncBtn');
            this.regenerateTokenBtn = document.getElementById('regenerateTokenBtn');
            this.linkExistingTokenBtn = document.getElementById('linkExistingTokenBtn');
            this.disableSyncBtn = document.getElementById('disableSyncBtn');

            // URL & Preview
            this.instanceUrlConfig = document.getElementById('instanceUrlConfig');
            this.instanceUrlSetup = document.getElementById('instanceUrlSetup');
            this.copyUrlBtnConfig = document.getElementById('copyUrlBtnConfig');
            this.copyUrlBtnSetup = document.getElementById('copyUrlBtnSetup');
            this.previewIframe = document.getElementById('previewIframe');

            // Modal elements
            this.instanceModal = document.getElementById('instanceModal');
            this.modalTitle = document.getElementById('modalTitle');
            this.modalInstanceName = document.getElementById('modalInstanceName');
            this.modalCancelBtn = document.getElementById('modalCancelBtn');
            this.modalCreateBtn = document.getElementById('modalCreateBtn');
        }

        // Get default overlay configuration
        getDefaultConfig() {
            return this.configManagerHelper.getDefaultConfig();
        }

        // Load instances from localStorage
        loadInstances() {
            try {
                const instanceRegistry = localStorage.getItem('twitch-chat-overlay-instances');
                if (instanceRegistry) {
                    this.instances = JSON.parse(instanceRegistry);
                } else {
                    this.instances = {};
                }
            } catch (error) {
                console.error('Error loading instances:', error);
                this.showNotification('Error', 'Failed to load saved instance data.', 'error');
                this.instances = {};
            }

            const savedOrder = localStorage.getItem('twitch-chat-overlay-instanceOrder');
            if (savedOrder) {
                try {
                    this.instanceOrder = JSON.parse(savedOrder);
                    const instanceIds = Object.keys(this.instances);
                    this.instanceOrder = this.instanceOrder.filter(id => instanceIds.includes(id));
                    instanceIds.forEach(id => {
                        if (!this.instanceOrder.includes(id)) {
                            this.instanceOrder.push(id);
                        }
                    });
                } catch (error) {
                    console.error('Error loading instance order:', error);
                    this.instanceOrder = Object.keys(this.instances);
                }
            } else {
                this.instanceOrder = Object.keys(this.instances);
            }

            this.renderInstanceList();

            if (this.instanceOrder.length > 0) {
                const firstInstanceId = this.instanceOrder[0];
                if (this.instances[firstInstanceId]) {
                    this.selectInstance(firstInstanceId);
                } else {
                    this.showEmptyState();
                }
            } else {
                this.showEmptyState();
                if (Object.keys(this.instances).length === 0) {
                    this.showCreateInstanceModal();
                }
            }
        }

        // Save instances to localStorage
        saveInstances() {
            try {
                localStorage.setItem('twitch-chat-overlay-instances', JSON.stringify(this.instances));
                localStorage.setItem('twitch-chat-overlay-instanceOrder', JSON.stringify(this.instanceOrder));
            } catch (error) {
                console.error('Error saving instances:', error);
                this.showNotification('Error', 'Failed to save data. LocalStorage may be full.', 'error');
            }
        }

        // Render instance list items
        renderInstanceList() {
            this.instanceList.innerHTML = '';

            this.instanceOrder.forEach(instanceId => {
                const instance = this.instances[instanceId];
                if (!instance) return;

                const instanceItem = document.createElement('div');
                instanceItem.className = `instance-item ${instanceId === this.currentInstanceId ? 'active' : ''}`;
                instanceItem.dataset.id = instanceId;
                instanceItem.draggable = true;

                const details = document.createElement('div');
                details.className = 'instance-details';
                details.style.pointerEvents = 'none';

                const nameEl = document.createElement('div');
                nameEl.className = 'instance-name';
                nameEl.textContent = instance.name;

                const metaEl = document.createElement('div');
                metaEl.className = 'instance-meta';
                metaEl.textContent = instance.syncToken ? `Synced (ID: ${instanceId})` : `ID: ${instanceId}`;

                details.appendChild(nameEl);
                details.appendChild(metaEl);
                instanceItem.appendChild(details);

                instanceItem.addEventListener('click', () => {
                    this.selectInstance(instanceId);
                });

                instanceItem.addEventListener('dragstart', this.handleDragStart.bind(this));
                instanceItem.addEventListener('dragend', this.handleDragEnd.bind(this));

                this.instanceList.appendChild(instanceItem);
            });
        }

        // Setup event listeners for actions & buttons
        setupEventListeners() {
            this.createInstanceBtn.addEventListener('click', () => this.showCreateInstanceModal());
            this.emptyStateCreateBtn.addEventListener('click', () => this.showCreateInstanceModal());
            this.modalCancelBtn.addEventListener('click', () => this.hideModal());
            this.modalCreateBtn.addEventListener('click', () => this.createInstance());

            this.modalInstanceName.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createInstance();
                }
            });

            this.saveSettingsBtn.addEventListener('click', () => this.saveCurrentInstance());
            this.duplicateBtn.addEventListener('click', () => this.duplicateInstance());
            this.deleteBtn.addEventListener('click', () => this.deleteInstance());

            this.exportBtn.addEventListener('click', () => this.exportCurrentInstance());
            this.exportAllBtn.addEventListener('click', () => this.exportAllInstances());
            this.importBtn.addEventListener('click', () => this.importInstances());

            this.copyUrlBtnConfig.addEventListener('click', () => this.copyInstanceUrl());
            if (this.copyUrlBtnSetup) {
                this.copyUrlBtnSetup.addEventListener('click', () => this.copyInstanceUrl());
            }

            const toggleObsBtn = document.getElementById('toggleObsSetupBtn');
            if (toggleObsBtn) {
                toggleObsBtn.addEventListener('click', () => {
                    if (this.obsSetup) {
                        const isHidden = this.obsSetup.style.display === 'none' || !this.obsSetup.style.display;
                        this.obsSetup.style.display = isHidden ? 'block' : 'none';
                    }
                });
            }

            // List-level drag & drop targets (attached once here; per-item dragstart/dragend
            // are attached in renderInstanceList, which rebuilds the items each render)
            this.instanceList.addEventListener('dragover', this.handleDragOver.bind(this));
            this.instanceList.addEventListener('dragenter', this.handleDragEnter.bind(this));
            this.instanceList.addEventListener('dragleave', this.handleDragLeave.bind(this));
            this.instanceList.addEventListener('drop', this.handleDrop.bind(this));

            // Sync action listeners
            if (this.enableSyncBtn) this.enableSyncBtn.addEventListener('click', () => this.enableSync());
            if (this.regenerateTokenBtn) this.regenerateTokenBtn.addEventListener('click', () => this.regenerateToken());
            if (this.disableSyncBtn) this.disableSyncBtn.addEventListener('click', () => this.disableSync());
            if (this.linkExistingTokenBtn) this.linkExistingTokenBtn.addEventListener('click', () => this.linkExistingToken());
            if (this.applyChannelBtn) this.applyChannelBtn.addEventListener('click', () => this.applyChannel());
        }

        // Real-time live preview setup
        setupFormLivePreview() {
            const inputs = [
                this.creatorTheme, this.creatorBgColor, this.creatorBgOpacity,
                this.creatorTextColor, this.creatorUsernameColor, this.creatorBorderColor,
                this.creatorTimestampColor, this.creatorFontFamily, this.creatorFontSize,
                this.creatorFontWeight, this.creatorChatWidth, this.creatorChatHeight,
                this.creatorBorderRadius, this.creatorShowTimestamps, this.creatorShowBadges,
                this.creatorShowPronouns, this.creatorThirdPartyEmotes, this.creatorTopFade,
                this.creatorChromaKey
            ];

            inputs.forEach(input => {
                if (!input) return;
                const eventType = input.type === 'checkbox' || input.type === 'range' || input.tagName === 'SELECT' ? 'change' : 'input';
                input.addEventListener(eventType, () => {
                    if (input === this.creatorBgOpacity && this.bgOpacityVal) {
                        this.bgOpacityVal.textContent = input.value;
                    }
                    this.sendPreviewUpdate();
                });
            });
        }

        // Send form configuration to preview iframe via postMessage
        sendPreviewUpdate() {
            if (!this.previewIframe || !this.previewIframe.contentWindow) return;
            const config = this.readFormConfig();
            this.previewIframe.contentWindow.postMessage({
                type: 'PREVIEW_CONFIG_UPDATE',
                config: config
            }, window.location.origin);
        }

        // Select and load an instance
        selectInstance(instanceId) {
            if (!this.instances[instanceId]) {
                this.showNotification('Error', 'Instance not found.', 'error');
                return;
            }

            this.currentInstanceId = instanceId;
            const instance = this.instances[instanceId];

            this.emptyState.style.display = 'none';
            this.configLayout.style.display = 'grid';
            this.workspaceActions.style.display = 'flex';
            this.workspaceTitle.textContent = instance.name;

            document.querySelectorAll('.instance-item').forEach(item => {
                item.classList.toggle('active', item.dataset.id === instanceId);
            });

            this.populateForm(instance);
            this.updateInstanceUrl();
            this.subscribeToRemoteChanges(instance.syncToken);

            // Trigger preview update once iframe loads or is ready
            setTimeout(() => this.sendPreviewUpdate(), 300);
        }

        // Subscribe to Firestore for live external edits (e.g. from OBS settings panel)
        async subscribeToRemoteChanges(syncToken) {
            if (this.firestoreUnsubscribe) {
                this.firestoreUnsubscribe();
                this.firestoreUnsubscribe = null;
            }

            if (!syncToken) return;

            try {
                const [firebaseApp, firebaseFirestore] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
                ]);

                const app = firebaseApp.getApps().length === 0 
                    ? firebaseApp.initializeApp({ projectId: 'chat-themer' }) 
                    : firebaseApp.getApps()[0];

                let db;
                try {
                    db = firebaseFirestore.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
                } catch (e) {
                    db = firebaseFirestore.getFirestore(app);
                }
                const docRef = firebaseFirestore.doc(db, 'sceneConfigs', syncToken);

                this.firestoreUnsubscribe = firebaseFirestore.onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists() && docSnap.data().config) {
                        const data = docSnap.data();
                        // Echo suppression: our own saves bounce back through Firestore and
                        // would otherwise revert anything typed since the Save.
                        if (data.updatedBy && data.updatedBy === this.myClientId) return;
                        const instance = this.instances[this.currentInstanceId];
                        if (instance) {
                            instance.config = data.config;
                            this.saveInstances();
                            this.populateForm(instance);
                            this.sendPreviewUpdate();
                        }
                    }
                }, (err) => console.warn('[Creator] Firestore subscription error:', err));
            } catch (e) {
                console.warn('[Creator] Could not initialize Firestore remote listener:', e);
            }
        }

        // Populate form with instance values
        populateForm(instance) {
            const config = { ...this.getDefaultConfig(), ...(instance.config || {}) };

            this.instanceName.value = instance.name || '';
            this.instanceId.value = this.currentInstanceId;

            if (this.creatorTwitchChannel) this.creatorTwitchChannel.value = config.lastTwitchChannel || config.lastChannel || '';
            if (this.creatorYoutubeTarget) this.creatorYoutubeTarget.value = config.lastYouTubeTarget || '';

            if (this.creatorTheme) this.creatorTheme.value = config.theme || 'default';
            if (this.creatorBgColor) this.creatorBgColor.value = config.bgColor || '#121212';
            if (this.creatorBgOpacity) {
                this.creatorBgOpacity.value = config.bgColorOpacity ?? 0.8;
                if (this.bgOpacityVal) this.bgOpacityVal.textContent = this.creatorBgOpacity.value;
            }
            if (this.creatorTextColor) this.creatorTextColor.value = config.textColor || '#efeff1';
            if (this.creatorUsernameColor) this.creatorUsernameColor.value = config.usernameColor || '#9147ff';
            if (this.creatorBorderColor) this.creatorBorderColor.value = config.borderColor || '#444444';
            if (this.creatorTimestampColor) this.creatorTimestampColor.value = config.timestampColor || '#adadb8';

            if (this.creatorFontFamily) this.creatorFontFamily.value = config.fontFamily || "'Inter', 'Helvetica Neue', Arial, sans-serif";
            if (this.creatorFontSize) this.creatorFontSize.value = config.fontSize || 14;
            if (this.creatorFontWeight) this.creatorFontWeight.value = config.fontWeight || 'normal';
            if (this.creatorChatWidth) this.creatorChatWidth.value = config.chatWidth || 95;
            if (this.creatorChatHeight) this.creatorChatHeight.value = config.chatHeight || 95;
            if (this.creatorBorderRadius) this.creatorBorderRadius.value = config.borderRadius || '8px';

            if (this.creatorShowTimestamps) this.creatorShowTimestamps.checked = !!config.showTimestamps;
            if (this.creatorShowBadges) this.creatorShowBadges.checked = !!config.showBadges;
            if (this.creatorShowPronouns) this.creatorShowPronouns.checked = !!config.showPronouns;
            if (this.creatorThirdPartyEmotes) this.creatorThirdPartyEmotes.checked = !!config.thirdPartyEmotes;
            if (this.creatorTopFade) this.creatorTopFade.checked = !!config.topFade;
            if (this.creatorChromaKey) this.creatorChromaKey.checked = !!config.chromaKey;

            // Sync controls UI state
            if (instance.syncToken) {
                if (this.syncBadge) {
                    this.syncBadge.textContent = 'Web Sync: Active';
                    this.syncBadge.style.background = '#e8f5e9';
                    this.syncBadge.style.color = '#2e7d32';
                }
                if (this.enableSyncBtn) this.enableSyncBtn.style.display = 'none';
                if (this.regenerateTokenBtn) this.regenerateTokenBtn.style.display = 'inline-flex';
                if (this.disableSyncBtn) this.disableSyncBtn.style.display = 'inline-flex';
            } else {
                if (this.syncBadge) {
                    this.syncBadge.textContent = 'Web Sync: Disabled';
                    this.syncBadge.style.background = '#e0e0e0';
                    this.syncBadge.style.color = '#555';
                }
                if (this.enableSyncBtn) this.enableSyncBtn.style.display = 'inline-flex';
                if (this.regenerateTokenBtn) this.regenerateTokenBtn.style.display = 'none';
                if (this.disableSyncBtn) this.disableSyncBtn.style.display = 'none';
            }
        }

        // Read configuration object from form input elements.
        // Merges over the instance's last-known config so the ~30 settings the form
        // doesn't cover (popup mode, shadows, maxMessages, bgImage, emote filters, ...)
        // survive a web-side save instead of being reset to defaults.
        // Channel fields are only written when includeChannel is set (the explicit
        // "Apply Channel" action), and an empty field means "leave unchanged".
        readFormConfig({ includeChannel = false } = {}) {
            const defaults = this.getDefaultConfig();
            const existing = this.instances[this.currentInstanceId]?.config || {};
            const config = {
                ...defaults,
                ...existing,
                configVersion: CONFIG_VERSION,
                theme: this.creatorTheme?.value || defaults.theme,
                bgColor: this.creatorBgColor?.value || defaults.bgColor,
                bgColorOpacity: parseFloat(this.creatorBgOpacity?.value ?? defaults.bgColorOpacity),
                textColor: this.creatorTextColor?.value || defaults.textColor,
                usernameColor: this.creatorUsernameColor?.value || defaults.usernameColor,
                borderColor: this.creatorBorderColor?.value || defaults.borderColor,
                timestampColor: this.creatorTimestampColor?.value || defaults.timestampColor,
                fontFamily: this.creatorFontFamily?.value || defaults.fontFamily,
                fontSize: parseInt(this.creatorFontSize?.value || defaults.fontSize, 10),
                fontWeight: this.creatorFontWeight?.value || defaults.fontWeight,
                chatWidth: parseInt(this.creatorChatWidth?.value || defaults.chatWidth, 10),
                chatHeight: parseInt(this.creatorChatHeight?.value || defaults.chatHeight, 10),
                borderRadius: this.creatorBorderRadius?.value || defaults.borderRadius,
                showTimestamps: !!this.creatorShowTimestamps?.checked,
                showBadges: !!this.creatorShowBadges?.checked,
                showPronouns: !!this.creatorShowPronouns?.checked,
                thirdPartyEmotes: !!this.creatorThirdPartyEmotes?.checked,
                topFade: !!this.creatorTopFade?.checked,
                chromaKey: !!this.creatorChromaKey?.checked
            };

            if (includeChannel) {
                const twitch = this.creatorTwitchChannel?.value?.trim();
                const youtube = this.creatorYoutubeTarget?.value?.trim();
                if (twitch) config.lastTwitchChannel = twitch;
                if (youtube) config.lastYouTubeTarget = youtube;
            }

            return config;
        }

        // Save current instance configuration locally and push to Firestore if sync is enabled
        async saveCurrentInstance({ includeChannel = false } = {}) {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) {
                this.showNotification('Error', 'No chat scene selected.', 'error');
                return;
            }

            const instance = this.instances[this.currentInstanceId];
            instance.name = this.instanceName.value.trim() || instance.name;
            instance.lastModified = new Date().toISOString();

            const updatedConfig = this.readFormConfig({ includeChannel });
            instance.config = updatedConfig;

            this.saveInstances();
            localStorage.setItem(`chatConfig-${this.currentInstanceId}`, JSON.stringify(updatedConfig));

            this.workspaceTitle.textContent = instance.name;
            this.renderInstanceList();

            if (instance.syncToken) {
                const pushResult = await this.pushToCloud(instance.syncToken, updatedConfig, instance.name);
                if (pushResult.success) {
                    this.showNotification('Success', 'Chat scene saved and synced live to OBS.', 'success');
                } else {
                    this.showNotification('Saved Locally', 'Saved locally, but cloud push failed.', 'warning');
                }
            } else {
                this.showNotification('Success', 'Chat scene saved locally.', 'success');
            }
        }

        // Explicit "Apply Channel" action — the only path that writes channel fields,
        // so a regular Save can never re-point or wipe a live stream's chat connection.
        applyChannel() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            this.saveCurrentInstance({ includeChannel: true });
        }

        // Push scene config to backend Cloud Run proxy
        async pushToCloud(token, config, sceneName) {
            const endpoint = `${getProxyBaseUrl()}/scene-config/${token}`;
            const payload = {
                config,
                sceneName,
                configVersion: CONFIG_VERSION,
                updatedBy: this.myClientId
            };

            try {
                const res = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                return { success: res.ok };
            } catch (err) {
                console.error('[Creator] Push to cloud error:', err);
                return { success: false, error: err.message };
            }
        }

        // Enable live web sync for the active scene instance
        async enableSync() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;

            const instance = this.instances[this.currentInstanceId];
            const newToken = crypto.randomUUID();

            const configToPush = this.readFormConfig();
            const result = await this.pushToCloud(newToken, configToPush, instance.name);

            if (result.success) {
                instance.syncToken = newToken;
                this.saveInstances();
                this.populateForm(instance);
                this.updateInstanceUrl();
                this.renderInstanceList();
                this.subscribeToRemoteChanges(newToken);
                this.showNotification('Live Sync Enabled', 'Web customization active! Copy your updated OBS URL.', 'success');
            } else {
                this.showNotification('Error', 'Failed to initialize cloud sync token.', 'error');
            }
        }

        // Regenerate the secret sync token
        async regenerateToken() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];
            const oldToken = instance.syncToken;

            if (!confirm('Regenerate secret sync token? You will need to update the Browser Source URL in OBS.')) {
                return;
            }

            const newToken = crypto.randomUUID();
            const result = await this.pushToCloud(newToken, this.readFormConfig(), instance.name);

            if (result.success) {
                if (oldToken) {
                    fetch(`${getProxyBaseUrl()}/scene-config/${oldToken}`, { method: 'DELETE' }).catch(() => {});
                }
                instance.syncToken = newToken;
                this.saveInstances();
                this.populateForm(instance);
                this.updateInstanceUrl();
                this.subscribeToRemoteChanges(newToken);
                this.showNotification('Token Regenerated', 'New token created. Copy your updated OBS URL.', 'success');
            } else {
                this.showNotification('Error', 'Failed to regenerate sync token.', 'error');
            }
        }

        // Disable sync for the current instance
        async disableSync() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];

            // An OBS source still carrying &sync= will re-claim the token the next time it
            // loads (its doc-missing handler re-uploads local config), silently undoing this.
            if (!confirm('Disable web sync for this scene?\n\nImportant: also remove "&sync=..." from the Browser Source URL in OBS. If it stays there, the overlay will re-create the sync data next time it loads.')) {
                return;
            }

            if (instance.syncToken) {
                fetch(`${getProxyBaseUrl()}/scene-config/${instance.syncToken}`, { method: 'DELETE' }).catch(() => {});
            }

            instance.syncToken = null;
            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();
            this.renderInstanceList();
            if (this.firestoreUnsubscribe) this.firestoreUnsubscribe();
            this.showNotification('Sync Disabled', 'Web customization disabled for this scene.', 'info');
        }

        // Link an existing token from an OBS browser source
        async linkExistingToken() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];

            const inputToken = prompt('Enter the secret sync token (UUID) from your OBS Browser Source URL:');
            if (!inputToken) return;

            const trimmedToken = inputToken.trim();
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!UUID_REGEX.test(trimmedToken)) {
                this.showNotification('Invalid Token', 'The token must be a valid UUID format.', 'error');
                return;
            }

            try {
                const res = await fetch(`${getProxyBaseUrl()}/scene-config/${trimmedToken}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.config) {
                        instance.config = data.config;
                    }
                }
            } catch (err) {
                console.warn('[Creator] Link fetch failed:', err);
            }

            instance.syncToken = trimmedToken;
            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();
            this.renderInstanceList();
            this.subscribeToRemoteChanges(trimmedToken);
            this.showNotification('Scene Linked', 'Successfully linked to existing sync token.', 'success');
        }

        // Update displayed URL in Creator workspace
        updateInstanceUrl() {
            if (!this.currentInstanceId) return;

            const basePath = window.location.href.replace(/\/[^\/]*$/, '/chat.html');
            const instance = this.instances[this.currentInstanceId];
            
            let instanceUrl = `${basePath}?scene=${this.currentInstanceId}`;
            if (instance && instance.syncToken) {
                instanceUrl += `&sync=${instance.syncToken}`;
            }

            if (this.instanceUrlConfig) this.instanceUrlConfig.textContent = instanceUrl;
            if (this.instanceUrlSetup) this.instanceUrlSetup.textContent = instanceUrl;
        }

        // Copy instance URL to clipboard
        copyInstanceUrl() {
            const url = this.instanceUrlConfig.textContent;
            navigator.clipboard.writeText(url)
                .then(() => this.showNotification('Success', 'URL copied to clipboard.', 'success'))
                .catch(() => this.showNotification('Error', 'Failed to copy URL.', 'error'));
        }

        // Show create scene modal
        showCreateInstanceModal() {
            this.modalTitle.textContent = 'Create New Chat Scene';
            this.modalInstanceName.value = '';
            this.modalCreateBtn.textContent = 'Create';
            this.instanceModal.style.display = 'flex';
            setTimeout(() => this.modalInstanceName.focus(), 100);
        }

        hideModal() {
            this.instanceModal.style.display = 'none';
        }

        createInstance() {
            let name = this.modalInstanceName.value.trim();
            if (!name) {
                let counter = 1;
                let defaultName = `Scene ${counter}`;
                while (Object.values(this.instances).some(inst => inst.name === defaultName)) {
                    counter++;
                    defaultName = `Scene ${counter}`;
                }
                name = defaultName;
            }

            let id = this.generateInstanceId(name);
            const newInstance = {
                name: name,
                syncToken: null,
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                config: this.getDefaultConfig()
            };

            this.instances[id] = newInstance;
            this.instanceOrder.push(id);
            this.saveInstances();

            this.hideModal();
            this.renderInstanceList();
            this.selectInstance(id);
            this.showNotification('Success', `Chat scene '${name}' created.`, 'success');
        }

        generateInstanceId(name) {
            let id = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
            let counter = 1;
            let uniqueId = id;
            while (this.instances[uniqueId]) {
                uniqueId = `${id}-${counter}`;
                counter++;
            }
            return uniqueId;
        }

        duplicateInstance() {
            if (!this.currentInstanceId) return;
            const source = this.instances[this.currentInstanceId];
            const newName = `${source.name} (Copy)`;
            const newId = this.generateInstanceId(newName);

            const newInstance = {
                name: newName,
                syncToken: null, // Duplicated scenes start with standalone tokens
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                config: JSON.parse(JSON.stringify(source.config || {}))
            };

            this.instances[newId] = newInstance;
            const idx = this.instanceOrder.indexOf(this.currentInstanceId);
            if (idx !== -1) {
                this.instanceOrder.splice(idx + 1, 0, newId);
            } else {
                this.instanceOrder.push(newId);
            }

            this.saveInstances();
            this.renderInstanceList();
            this.selectInstance(newId);
            this.showNotification('Success', `Duplicated scene as '${newName}'.`, 'success');
        }

        deleteInstance() {
            if (!this.currentInstanceId) return;
            const instance = this.instances[this.currentInstanceId];

            if (!confirm(`Are you sure you want to delete '${instance.name}'?`)) return;

            if (this.firestoreUnsubscribe) {
                this.firestoreUnsubscribe();
                this.firestoreUnsubscribe = null;
            }

            if (instance.syncToken) {
                fetch(`${getProxyBaseUrl()}/scene-config/${instance.syncToken}`, { method: 'DELETE' }).catch(() => {});
            }

            delete this.instances[this.currentInstanceId];
            this.instanceOrder = this.instanceOrder.filter(id => id !== this.currentInstanceId);

            this.saveInstances();
            this.renderInstanceList();

            if (this.instanceOrder.length > 0) {
                this.selectInstance(this.instanceOrder[0]);
            } else {
                this.showEmptyState();
            }

            this.showNotification('Success', 'Scene deleted.', 'success');
        }

        exportCurrentInstance() {
            if (!this.currentInstanceId) return;
            const instance = this.instances[this.currentInstanceId];
            const exportData = {
                type: 'wildcat-chat-scene',
                version: '1.0',
                instance: { id: this.currentInstanceId, ...instance }
            };

            this.downloadJSON(exportData, `chat-scene-${this.currentInstanceId}.json`);
        }

        exportAllInstances() {
            const exportData = {
                type: 'wildcat-chat-scenes-bundle',
                version: '1.0',
                instances: this.instances,
                instanceOrder: this.instanceOrder
            };

            this.downloadJSON(exportData, 'wildcat-chat-scenes-all.json');
        }

        importInstances() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const data = JSON.parse(evt.target.result);
                        if (data.type === 'wildcat-chat-scene' && data.instance) {
                            const inst = data.instance;
                            const id = this.generateInstanceId(inst.name || 'imported-scene');
                            this.instances[id] = {
                                name: inst.name,
                                syncToken: inst.syncToken || null,
                                createdAt: inst.createdAt || new Date().toISOString(),
                                lastModified: new Date().toISOString(),
                                config: inst.config || {}
                            };
                            this.instanceOrder.push(id);
                            this.saveInstances();
                            this.renderInstanceList();
                            this.selectInstance(id);
                            this.showNotification('Success', 'Imported scene successfully.', 'success');
                        } else if (data.type === 'wildcat-chat-scenes-bundle' && data.instances) {
                            Object.keys(data.instances).forEach(id => {
                                const newId = this.generateInstanceId(data.instances[id].name || id);
                                this.instances[newId] = data.instances[id];
                                this.instanceOrder.push(newId);
                            });
                            this.saveInstances();
                            this.renderInstanceList();
                            this.showNotification('Success', 'Imported scene bundle successfully.', 'success');
                        } else {
                            this.showNotification('Error', 'Unrecognized scene JSON format.', 'error');
                        }
                    } catch (err) {
                        this.showNotification('Error', 'Failed to parse JSON file.', 'error');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        downloadJSON(obj, filename) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        showEmptyState() {
            this.currentInstanceId = null;
            this.emptyState.style.display = 'block';
            this.configLayout.style.display = 'none';
            this.workspaceActions.style.display = 'none';
            this.workspaceTitle.textContent = 'Select or Create a Chat Scene';
        }

        showNotification(title, message, type = 'info') {
            const container = document.getElementById('notification-container') || document.body;
            const notif = document.createElement('div');
            notif.className = `notification notification-${type}`;
            notif.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
                background: ${type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#0288d1'};
                color: #fff; border-radius: 8px; font-weight: 500; font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; transition: opacity 0.3s;
            `;
            notif.textContent = `${title}: ${message}`;
            container.appendChild(notif);
            setTimeout(() => {
                notif.style.opacity = '0';
                setTimeout(() => notif.remove(), 300);
            }, 3500);
        }

        // Drag & Drop handlers for instance list ordering
        handleDragStart(e) {
            this.draggedItemId = e.currentTarget.dataset.id;
            e.currentTarget.classList.add('dragging');
        }

        handleDragEnd(e) {
            e.currentTarget.classList.remove('dragging');
            document.querySelectorAll('.instance-item').forEach(item => item.classList.remove('drag-over'));
        }

        handleDragOver(e) {
            e.preventDefault();
        }

        handleDragEnter(e) {
            const target = e.target.closest('.instance-item');
            if (target && target.dataset.id !== this.draggedItemId) {
                target.classList.add('drag-over');
            }
        }

        handleDragLeave(e) {
            const target = e.target.closest('.instance-item');
            if (target) {
                target.classList.remove('drag-over');
            }
        }

        handleDrop(e) {
            e.preventDefault();
            const dropTarget = e.target.closest('.instance-item');
            if (!dropTarget || dropTarget.dataset.id === this.draggedItemId) return;

            const targetId = dropTarget.dataset.id;
            const fromIdx = this.instanceOrder.indexOf(this.draggedItemId);
            const toIdx = this.instanceOrder.indexOf(targetId);

            if (fromIdx !== -1 && toIdx !== -1) {
                this.instanceOrder.splice(fromIdx, 1);
                this.instanceOrder.splice(toIdx, 0, this.draggedItemId);
                this.saveInstances();
                this.renderInstanceList();
            }
        }
    }

    new ChatSceneCreator();
});
