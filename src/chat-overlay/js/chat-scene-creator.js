/**
 * Chat Scene Creator JavaScript Module
 * Orchestrates chat scene creation, settings customization, live preview streaming, and Firestore web sync.
 */

import { ConfigManager } from './modules/config-manager.js';
import { UIHelpers } from './modules/ui-helpers.js';
import { CreatorFormRenderer } from './modules/creator-form-renderer.js';
import { CreatorInstanceManager } from './modules/creator-instance-manager.js';
import { CreatorSyncManager } from './modules/creator-sync-manager.js';
import { CreatorIOManager } from './modules/creator-io-manager.js';
import { CreatorDragHandler } from './modules/creator-drag-handler.js';

document.addEventListener('DOMContentLoaded', () => {
    class ChatSceneCreatorApp {
        constructor() {
            this.configManagerHelper = new ConfigManager();
            this.dom = {};

            this.initializeDOM();

            // Instantiate modules
            this.formRenderer = new CreatorFormRenderer({
                configManager: this.configManagerHelper,
                previewIframe: this.dom.previewIframe
            });

            this.instanceManager = new CreatorInstanceManager({
                getDefaultConfig: () => this.configManagerHelper.getDefaultConfig(),
                onNotification: (title, msg, type) => UIHelpers.showNotification(title, msg, type)
            });

            this.syncManager = new CreatorSyncManager({
                onNotification: (title, msg, type) => UIHelpers.showNotification(title, msg, type),
                onRemoteUpdate: (instance) => {
                    this.formRenderer.populateForm(instance, this.dom);
                    this.formRenderer.sendPreviewUpdate();
                }
            });

            this.dragHandler = new CreatorDragHandler(this.dom.instanceList, {
                getOrder: () => this.instanceManager.instanceOrder,
                onReorder: (newOrder) => {
                    this.instanceManager.instanceOrder = newOrder;
                    this.instanceManager.saveInstances();
                    this.renderInstanceList();
                }
            });

            // Initialize UI
            this.formRenderer.renderSchemaForm(document.getElementById('generatedSchemaForm'));
            this.instanceManager.loadInstances();
            this.setupEventListeners();
            this.setupPreviewBgSelector();
            this.formRenderer.setupFormLivePreview();
            this.dragHandler.attach();

            // Select initial instance
            if (this.instanceManager.instanceOrder.length > 0) {
                const firstId = this.instanceManager.instanceOrder[0];
                if (this.instanceManager.instances[firstId]) {
                    this.selectInstance(firstId);
                } else {
                    this.instanceManager.showEmptyState(this.dom);
                }
            } else {
                this.instanceManager.showEmptyState(this.dom);
            }
        }

        initializeDOM() {
            this.dom = {
                instanceList: document.getElementById('instanceList'),
                createInstanceBtn: document.getElementById('createInstanceBtn'),
                importBtn: document.getElementById('importBtn'),
                exportAllBtn: document.getElementById('exportAllBtn'),
                workspaceTitle: document.getElementById('workspaceTitle'),
                workspaceActions: document.getElementById('workspaceActions'),
                configLayout: document.getElementById('configLayout'),
                emptyState: document.getElementById('emptyState'),
                emptyStateCreateBtn: document.getElementById('emptyStateCreateBtn'),
                obsSetup: document.getElementById('obsSetup'),
                duplicateBtn: document.getElementById('duplicateBtn'),
                deleteBtn: document.getElementById('deleteBtn'),
                exportBtn: document.getElementById('exportBtn'),
                instanceName: document.getElementById('instanceName'),
                instanceId: document.getElementById('instanceId'),
                creatorTwitchChannel: document.getElementById('creatorTwitchChannel'),
                creatorYoutubeTarget: document.getElementById('creatorYoutubeTarget'),
                applyChannelBtn: document.getElementById('applyChannelBtn'),
                saveSettingsBtn: document.getElementById('saveSettingsBtn'),
                instanceUrlConfig: document.getElementById('instanceUrlConfig'),
                instanceUrlSetup: document.getElementById('instanceUrlSetup'),
                copyUrlBtnConfig: document.getElementById('copyUrlBtnConfig'),
                copyUrlBtnSetup: document.getElementById('copyUrlBtnSetup'),
                previewIframe: document.getElementById('previewIframe'),
                previewIframeContainer: document.getElementById('previewIframeContainer'),
                previewBgBtns: document.querySelectorAll('.preview-bg-btn'),
                previewBgColorInput: document.getElementById('previewBgColorInput'),
                previewCustomSwatch: document.getElementById('previewCustomSwatch'),
                instanceModal: document.getElementById('instanceModal'),
                modalTitle: document.getElementById('modalTitle'),
                modalInstanceName: document.getElementById('modalInstanceName'),
                modalCancelBtn: document.getElementById('modalCancelBtn'),
                modalCreateBtn: document.getElementById('modalCreateBtn'),
                importSceneBtn: document.getElementById('importSceneBtn'),
                importSceneModal: document.getElementById('importSceneModal'),
                importSceneToken: document.getElementById('importSceneToken'),
                importModalCancelBtn: document.getElementById('importModalCancelBtn'),
                importModalConfirmBtn: document.getElementById('importModalConfirmBtn')
            };
        }

        renderInstanceList() {
            this.instanceManager.renderInstanceList(this.dom.instanceList, (id) => this.selectInstance(id));
        }

        async selectInstance(instanceId) {
            const instance = this.instanceManager.instances[instanceId];
            if (!instance) {
                UIHelpers.showNotification('Error', 'Instance not found.', 'error');
                return;
            }

            this.instanceManager.currentInstanceId = instanceId;

            if (this.dom.emptyState) this.dom.emptyState.style.display = 'none';
            if (this.dom.configLayout) this.dom.configLayout.style.display = 'grid';
            if (this.dom.workspaceActions) this.dom.workspaceActions.style.display = 'flex';
            if (this.dom.workspaceTitle) this.dom.workspaceTitle.textContent = instance.name;

            document.querySelectorAll('.instance-item').forEach(item => {
                item.classList.toggle('active', item.dataset.id === instanceId);
            });

            this.formRenderer.populateForm(instance, this.dom);
            this.syncManager.updateInstanceUrl(instance, instanceId, this.dom);

            // Backfill scenes created before tokens were minted automatically. Must run
            // before subscribing so the subscription always has a token to attach to.
            await this.ensureSyncTokenAndPush(instanceId);

            this.syncManager.subscribeToRemoteChanges(
                instance.syncToken,
                instanceId,
                (id) => this.instanceManager.instances[id],
                () => this.instanceManager.saveInstances(),
                () => this.instanceManager.currentInstanceId
            );

            if (this.dom.previewIframe) {
                this.dom.previewIframe.src = `chat.html?demo=1&scene=${encodeURIComponent(instanceId)}`;
                this.dom.previewIframe.addEventListener('load', () => this.formRenderer.sendPreviewUpdate(), { once: true });
            }
            this.formRenderer.sendPreviewUpdate();
        }

        async saveCurrentInstance({ includeChannel = false } = {}) {
            const currentId = this.instanceManager.currentInstanceId;
            const instance = this.instanceManager.instances[currentId];
            if (!currentId || !instance) {
                UIHelpers.showNotification('Error', 'No chat scene selected.', 'error');
                return;
            }

            instance.name = this.dom.instanceName.value.trim() || instance.name;
            instance.lastModified = new Date().toISOString();

            const updatedConfig = this.formRenderer.readFormConfig(instance.config, this.dom, { includeChannel });
            instance.config = updatedConfig;

            this.instanceManager.saveInstances();
            localStorage.setItem(`chatConfig-${currentId}`, JSON.stringify(updatedConfig));

            if (this.dom.workspaceTitle) this.dom.workspaceTitle.textContent = instance.name;
            this.renderInstanceList();

            if (instance.syncToken) {
                const pushResult = await this.syncManager.pushToCloud(instance.syncToken, updatedConfig, instance.name);
                if (pushResult.success) {
                    UIHelpers.showNotification('Success', 'Chat scene saved and synced live to OBS.', 'success');
                } else {
                    UIHelpers.showNotification('Saved Locally', 'Saved locally, but cloud push failed.', 'warning');
                }
            } else {
                UIHelpers.showNotification('Success', 'Chat scene saved locally.', 'success');
            }
        }

        async applyChannel() {
            if (!this.instanceManager.currentInstanceId) return;
            const twitch = this.dom.creatorTwitchChannel?.value?.trim();
            const youtube = this.dom.creatorYoutubeTarget?.value?.trim();

            await this.saveCurrentInstance({ includeChannel: true });
            this.formRenderer.sendPreviewUpdate();
            UIHelpers.showNotification('Channel Connection Updated', `Connected to Twitch: ${twitch || 'None'}, YouTube: ${youtube || 'None'}`);
        }

        // Mint and push must happen atomically: a token that exists locally but has no
        // matching Firestore doc yet is a race waiting to happen. The overlay's own
        // handleSnapshot treats a missing doc as "nobody has claimed this yet" and uploads
        // its local config to claim it — so if the OBS browser source connects before this
        // push lands, it silently overwrites the streamer's in-progress edits here.
        async ensureSyncTokenAndPush(instanceId) {
            const instance = this.instanceManager.instances[instanceId];
            if (!instance) return;

            const minted = this.instanceManager.ensureSyncToken(instanceId);
            if (!minted) return;

            const pushResult = await this.syncManager.pushToCloud(minted, instance.config, instance.name);
            if (!pushResult.success) {
                UIHelpers.showNotification('Sync Pending', 'Scene saved locally; cloud sync will retry on next save.', 'warning');
            }

            this.syncManager.updateInstanceUrl(instance, instanceId, this.dom);
        }

        importScene() {
            if (this.dom.importSceneToken) this.dom.importSceneToken.value = '';
            if (this.dom.importSceneModal) this.dom.importSceneModal.style.display = 'flex';
        }

        closeImportSceneModal() {
            if (this.dom.importSceneModal) this.dom.importSceneModal.style.display = 'none';
        }

        confirmImportScene() {
            const token = this.dom.importSceneToken?.value?.trim();
            if (!token) {
                UIHelpers.showNotification('Error', 'Enter a sync token to link.', 'error');
                return;
            }

            // Two local scenes on one token would share a Firestore doc and overwrite each
            // other — the same failure duplicate mints a fresh token to avoid.
            const existingId = Object.keys(this.instanceManager.instances)
                .find((id) => this.instanceManager.instances[id].syncToken === token);
            if (existingId) {
                this.closeImportSceneModal();
                this.selectInstance(existingId);
                UIHelpers.showNotification('Already Linked', 'That scene is already in this browser.');
                return;
            }

            // Linking gets its own scene rather than repointing the selected one, which would
            // orphan that scene's OBS source. Sharing the remote token is the entire point
            // here, unlike duplicate. Deliberately no push: this scene's config is still
            // empty defaults and would overwrite the remote scene — the Firestore snapshot
            // populates it instead.
            const newId = this.instanceManager.createInstance('Linked Scene');
            this.instanceManager.instances[newId].syncToken = token;
            this.instanceManager.saveInstances();

            this.closeImportSceneModal();
            this.renderInstanceList();
            this.selectInstance(newId);
            UIHelpers.showNotification('Scene Linked', 'Pulling this scene\'s settings from the cloud.');
        }

        // createInstance/duplicateCurrentInstance mint a syncToken but have no sync manager
        // access to push it — same atomicity requirement as ensureSyncTokenAndPush above.
        async pushFreshTokenToCloud(instance) {
            if (!instance || !instance.syncToken) return;
            const pushResult = await this.syncManager.pushToCloud(instance.syncToken, instance.config, instance.name);
            if (!pushResult.success) {
                UIHelpers.showNotification('Sync Pending', 'Scene saved locally; cloud sync will retry on next save.', 'warning');
            }
        }

        setupEventListeners() {
            if (this.dom.createInstanceBtn) {
                this.dom.createInstanceBtn.addEventListener('click', () => {
                    this.instanceManager.openInstanceModal(this.dom.instanceModal, this.dom.modalInstanceName);
                });
            }
            if (this.dom.emptyStateCreateBtn) {
                this.dom.emptyStateCreateBtn.addEventListener('click', () => {
                    this.instanceManager.openInstanceModal(this.dom.instanceModal, this.dom.modalInstanceName);
                });
            }
            if (this.dom.modalCancelBtn) {
                this.dom.modalCancelBtn.addEventListener('click', () => {
                    this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                });
            }
            if (this.dom.modalCreateBtn) {
                this.dom.modalCreateBtn.addEventListener('click', async () => {
                    const newId = this.instanceManager.createInstance(this.dom.modalInstanceName.value);
                    this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                    this.renderInstanceList();
                    await this.selectInstance(newId);
                    await this.pushFreshTokenToCloud(this.instanceManager.instances[newId]);
                });
            }

            if (this.dom.saveSettingsBtn) this.dom.saveSettingsBtn.addEventListener('click', () => this.saveCurrentInstance({ includeChannel: false }));
            if (this.dom.applyChannelBtn) this.dom.applyChannelBtn.addEventListener('click', () => this.applyChannel());

            if (this.dom.duplicateBtn) {
                this.dom.duplicateBtn.addEventListener('click', async () => {
                    const newId = this.instanceManager.duplicateCurrentInstance();
                    if (newId) {
                        this.renderInstanceList();
                        await this.selectInstance(newId);
                        await this.pushFreshTokenToCloud(this.instanceManager.instances[newId]);
                    }
                });
            }

            if (this.dom.deleteBtn) {
                this.dom.deleteBtn.addEventListener('click', () => {
                    const deletedId = this.instanceManager.deleteCurrentInstance();
                    if (deletedId) {
                        this.renderInstanceList();
                        if (this.instanceManager.instanceOrder.length > 0) {
                            this.selectInstance(this.instanceManager.instanceOrder[0]);
                        } else {
                            this.instanceManager.showEmptyState(this.dom);
                        }
                    }
                });
            }

            if (this.dom.exportBtn) {
                this.dom.exportBtn.addEventListener('click', () => {
                    const instance = this.instanceManager.instances[this.instanceManager.currentInstanceId];
                    if (instance) CreatorIOManager.exportInstance(instance);
                });
            }

            if (this.dom.exportAllBtn) {
                this.dom.exportAllBtn.addEventListener('click', () => {
                    CreatorIOManager.exportAllInstances(this.instanceManager.instances, this.instanceManager.instanceOrder);
                });
            }

            if (this.dom.importBtn) {
                this.dom.importBtn.addEventListener('click', () => {
                    CreatorIOManager.importInstanceFile(
                        (parsed) => {
                            let importedCount = 0;
                            if (parsed.instances && parsed.instanceOrder) {
                                this.instanceManager.instances = { ...this.instanceManager.instances, ...parsed.instances };
                                parsed.instanceOrder.forEach(id => {
                                    if (!this.instanceManager.instanceOrder.includes(id)) {
                                        this.instanceManager.instanceOrder.push(id);
                                    }
                                });
                                importedCount = Object.keys(parsed.instances).length;
                            } else if (parsed.id && parsed.name && parsed.config) {
                                const newId = typeof crypto !== 'undefined' && crypto.randomUUID
                                    ? `scene_${crypto.randomUUID()}`
                                    : `scene_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                                parsed.id = newId;
                                this.instanceManager.instances[newId] = parsed;
                                this.instanceManager.instanceOrder.push(newId);
                                importedCount = 1;
                            } else {
                                UIHelpers.showNotification('Import Failed', 'JSON file does not match a recognized scene configuration schema.', 'error');
                                return;
                            }
                            this.instanceManager.saveInstances();
                            this.renderInstanceList();
                            UIHelpers.showNotification('Imported', `Chat scene(s) imported successfully.`);
                        },
                        (err) => UIHelpers.showNotification('Import Failed', 'Invalid JSON file.', 'error')
                    );
                });
            }

            const toggleObsSetupBtn = document.getElementById('toggleObsSetupBtn');
            if (toggleObsSetupBtn) {
                toggleObsSetupBtn.addEventListener('click', () => {
                    if (this.dom.obsSetup.style.display === 'none') {
                        this.dom.obsSetup.style.display = 'block';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="eye-off" class="lucide-inline"></i> Hide OBS Setup Instructions';
                    } else {
                        this.dom.obsSetup.style.display = 'none';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="monitor" class="lucide-inline"></i> Detailed OBS Setup Instructions';
                    }
                    if (window.lucide) window.lucide.createIcons();
                });
            }

            if (this.dom.copyUrlBtnConfig) {
                this.dom.copyUrlBtnConfig.addEventListener('click', () => CreatorIOManager.copyUrl(this.dom.instanceUrlConfig.textContent));
            }
            if (this.dom.copyUrlBtnSetup) {
                this.dom.copyUrlBtnSetup.addEventListener('click', () => CreatorIOManager.copyUrl(this.dom.instanceUrlSetup.textContent));
            }

            if (this.dom.instanceModal) {
                this.dom.instanceModal.addEventListener('click', (e) => {
                    if (e.target === this.dom.instanceModal) {
                        this.instanceManager.closeInstanceModal(this.dom.instanceModal);
                    }
                });
            }

            if (this.dom.importSceneBtn) this.dom.importSceneBtn.addEventListener('click', () => this.importScene());
            if (this.dom.importModalCancelBtn) this.dom.importModalCancelBtn.addEventListener('click', () => this.closeImportSceneModal());
            if (this.dom.importModalConfirmBtn) this.dom.importModalConfirmBtn.addEventListener('click', () => this.confirmImportScene());
            if (this.dom.importSceneModal) {
                this.dom.importSceneModal.addEventListener('click', (e) => {
                    if (e.target === this.dom.importSceneModal) {
                        this.closeImportSceneModal();
                    }
                });
            }
        }

        setupPreviewBgSelector() {
            const container = this.dom.previewIframeContainer;
            const btns = this.dom.previewBgBtns;
            const colorInput = this.dom.previewBgColorInput;
            const customSwatch = this.dom.previewCustomSwatch;

            if (!container || !btns || !btns.length || !colorInput) return;

            const STORAGE_KEY = 'chat_overlay_preview_bg';

            const getSavedBg = () => {
                try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    return saved ? JSON.parse(saved) : { type: 'checkerboard', color: '#121212' };
                } catch (e) {
                    return { type: 'checkerboard', color: '#121212' };
                }
            };

            const saveBg = (bgState) => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(bgState));
                } catch (e) {
                    // silent fallback
                }
            };

            let currentBg = getSavedBg();
            if (colorInput && currentBg.color) {
                colorInput.value = currentBg.color;
                if (customSwatch) customSwatch.style.background = currentBg.color;
            }

            const applyBg = (type, customColor) => {
                container.classList.remove('bg-checkerboard');
                container.style.backgroundImage = '';

                if (type === 'dark') {
                    container.style.backgroundColor = '#000000';
                } else if (type === 'light') {
                    container.style.backgroundColor = '#ffffff';
                } else if (type === 'custom') {
                    const hex = customColor || colorInput.value || '#121212';
                    container.style.backgroundColor = hex;
                    if (customSwatch) customSwatch.style.background = hex;
                } else {
                    type = 'checkerboard';
                    container.classList.add('bg-checkerboard');
                }

                btns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.bgType === type);
                });

                currentBg = { type, color: colorInput.value };
                saveBg(currentBg);
            };

            btns.forEach(btn => {
                const type = btn.dataset.bgType;
                if (type !== 'custom') {
                    btn.addEventListener('click', () => applyBg(type));
                }
            });

            if (colorInput) {
                const handleCustomInput = (e) => {
                    const hex = e.target.value;
                    if (customSwatch) customSwatch.style.background = hex;
                    applyBg('custom', hex);
                };
                colorInput.addEventListener('input', handleCustomInput);
                colorInput.addEventListener('change', handleCustomInput);
                colorInput.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyBg('custom', colorInput.value);
                });
            }

            applyBg(currentBg.type, currentBg.color);
        }
    }

    window.chatSceneCreatorApp = new ChatSceneCreatorApp();
});

