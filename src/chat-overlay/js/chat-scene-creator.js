/**
 * Chat Scene Creator JavaScript Module
 * Handles management of chat overlay scenes, settings customization, live preview streaming, and Firestore web sync.
 */

import { ConfigManager, CONFIG_VERSION, applyChromaKey } from './modules/config-manager.js';
import { CONFIG_SCHEMA, SCHEMA_GROUPS, RUNTIME_KEYS, getVisibleSchemaItems } from './modules/config-schema.js';
import { createFontPicker } from './modules/font-manager.js';
import { getProxyBaseUrl } from './modules/scene-sync-manager.js';
import { UIHelpers } from './modules/ui-helpers.js';

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
            this.currentBgImage = null;
            this.fontPicker = null;

            // Per-session id so our own Firestore echoes can be told apart from
            // edits made in the OBS panel or another creator tab.
            this.myClientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `creator-${Date.now()}-${Math.random()}`;

            this.renderSchemaForm();
            this.initializeDOM();
            this.loadInstances();
            this.setupEventListeners();
            this.setupFormLivePreview();
        }

        // Render schema-driven configuration controls into #generatedSchemaForm
        renderSchemaForm() {
            const container = document.getElementById('generatedSchemaForm');
            if (!container) return;

            container.innerHTML = '';

            SCHEMA_GROUPS.forEach(group => {
                // internal:true items (cache TTLs, hardcoded endpoints, schema bookkeeping)
                // are excluded here so they never render into the form; readFormConfig()
                // still round-trips their values via its {...defaults, ...existing} merge
                // since there's simply no #schema-input-<key> element for them to read from.
                const groupItems = getVisibleSchemaItems(group.id);
                if (groupItems.length === 0) return;

                const sectionEl = document.createElement(group.advanced ? 'details' : 'div');
                sectionEl.className = `settings-section ${group.advanced ? 'advanced-section' : ''}`;

                if (group.advanced) {
                    const summary = document.createElement('summary');
                    summary.className = 'advanced-summary';
                    summary.style.cursor = 'pointer';
                    summary.style.padding = '8px 0';
                    summary.style.fontWeight = '600';
                    summary.style.userSelect = 'none';
                    summary.innerHTML = `<span style="font-size: 15px; font-weight: 600;">${group.label}</span> <span class="badge-count" style="font-size: 12px; opacity: 0.6; margin-left: 6px;">(${groupItems.length})</span>`;
                    sectionEl.appendChild(summary);
                } else {
                    const h3 = document.createElement('h3');
                    h3.textContent = group.label;
                    sectionEl.appendChild(h3);
                }

                const groupDiv = document.createElement('div');
                groupDiv.className = 'settings-group';
                groupDiv.id = `group-${group.id}`;
                if (group.advanced) groupDiv.style.marginTop = '12px';

                groupItems.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'settings-row';
                    row.id = `schema-row-${item.key}`;

                    const label = document.createElement('label');
                    label.htmlFor = `schema-input-${item.key}`;
                    label.textContent = item.label;
                    row.appendChild(label);

                    if (item.control === 'font') {
                        const fontMount = document.createElement('div');
                        fontMount.id = 'fontPickerMount';
                        fontMount.style.flex = '1';
                        row.appendChild(fontMount);
                        groupDiv.appendChild(row);
                        return;
                    }

                    if (item.control === 'presets') {
                        const presetGroup = document.createElement('div');
                        presetGroup.className = 'preset-group';
                        presetGroup.id = `schema-presets-${item.key}`;

                        item.options.forEach(opt => {
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.dataset.key = item.key;
                            btn.dataset.value = opt.value;
                            btn.setAttribute('aria-label', `${opt.label} (${opt.value})`);

                            // Preview swatches read their real CSS from UIHelpers so the preview
                            // can never drift from the actual applied value. Only the swatch's
                            // own data-driven property (the border-radius amount / the shadow
                            // itself) is set inline — everything else lives in scene-creator.css.
                            if (item.key === 'borderRadius') {
                                btn.className = 'preset-btn radius-btn';
                                const swatch = document.createElement('span');
                                swatch.className = 'radius-swatch';
                                swatch.style.borderRadius = opt.value;
                                btn.appendChild(swatch);
                            } else if (item.key === 'boxShadow') {
                                btn.className = 'preset-btn shadow-btn';
                                // A mid-tone "stage" behind the light tile so the shadow has a
                                // surface to visibly contrast against — see scene-creator.css.
                                const stage = document.createElement('span');
                                stage.className = 'shadow-stage';
                                const tile = document.createElement('span');
                                tile.className = 'shadow-tile';
                                tile.style.boxShadow = UIHelpers.getBoxShadowValue(opt.value);
                                stage.appendChild(tile);
                                btn.appendChild(stage);
                                const label = document.createElement('span');
                                label.className = 'preset-label';
                                label.textContent = opt.label;
                                btn.appendChild(label);
                            } else if (item.key === 'textShadow') {
                                btn.className = 'preset-btn text-shadow-btn';
                                const sample = document.createElement('span');
                                sample.className = 'text-shadow-sample';
                                sample.style.textShadow = UIHelpers.getTextShadowValue(opt.value);
                                sample.textContent = 'Aa';
                                btn.appendChild(sample);
                                const label = document.createElement('span');
                                label.className = 'preset-label';
                                label.textContent = opt.label;
                                btn.appendChild(label);
                            } else {
                                btn.className = 'preset-btn';
                                btn.textContent = opt.label;
                            }

                            btn.addEventListener('click', () => {
                                presetGroup.querySelectorAll('.preset-btn').forEach(b => {
                                    b.classList.remove('active');
                                });
                                btn.classList.add('active');
                                this.sendPreviewUpdate();
                            });

                            presetGroup.appendChild(btn);
                        });

                        row.appendChild(presetGroup);
                        groupDiv.appendChild(row);
                        return;
                    }

                    if (item.control === 'popup_group') {
                        const popupContainer = document.createElement('div');
                        popupContainer.id = 'popupModeBlock';
                        popupContainer.style.padding = '12px';
                        popupContainer.style.background = 'var(--bg-secondary, #18181b)';
                        popupContainer.style.borderRadius = '8px';
                        popupContainer.style.marginTop = '8px';

                        popupContainer.innerHTML = `
                            <div class="settings-row" style="margin-bottom: 8px;">
                                <label for="schema-popup-direction">Animation Direction</label>
                                <select id="schema-popup-direction" class="form-control">
                                    <option value="from-bottom">From Bottom</option>
                                    <option value="from-top">From Top</option>
                                    <option value="fade-in">Fade In</option>
                                </select>
                            </div>
                            <div class="settings-row" style="margin-bottom: 8px;">
                                <label for="schema-popup-duration">Message Duration (seconds)</label>
                                <input type="number" id="schema-popup-duration" min="2" max="60" value="5" class="form-control">
                            </div>
                            <div class="settings-row">
                                <label for="schema-popup-maxMessages">Max Popup Messages</label>
                                <input type="number" id="schema-popup-maxMessages" min="1" max="10" value="3" class="form-control">
                            </div>
                        `;
                        groupDiv.appendChild(popupContainer);
                        return;
                    }

                    let input;
                    if (item.control === 'select') {
                        input = document.createElement('select');
                        input.id = `schema-input-${item.key}`;
                        input.className = 'form-control';
                        item.options.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.label;
                            input.appendChild(option);
                        });
                    } else if (item.control === 'checkbox') {
                        input = document.createElement('input');
                        input.type = 'checkbox';
                        input.id = `schema-input-${item.key}`;
                    } else if (item.control === 'color') {
                        input = document.createElement('input');
                        input.type = 'color';
                        input.id = `schema-input-${item.key}`;
                        input.value = item.default;
                    } else if (item.control === 'range') {
                        input = document.createElement('input');
                        input.type = 'range';
                        input.id = `schema-input-${item.key}`;
                        input.min = item.min;
                        input.max = item.max;
                        input.step = item.step;
                        input.value = item.default;
                        input.className = 'form-control';

                        const valDisplay = document.createElement('span');
                        valDisplay.id = `schema-val-${item.key}`;
                        valDisplay.style.marginLeft = '8px';
                        valDisplay.style.fontSize = '12px';
                        valDisplay.textContent = item.scale ? `${Math.round(item.default * item.scale)}%` : item.default;
                        row.appendChild(valDisplay);
                    } else {
                        input = document.createElement('input');
                        input.type = item.control === 'number' ? 'number' : 'text';
                        input.id = `schema-input-${item.key}`;
                        input.className = 'form-control';
                        if (item.min !== undefined) input.min = item.min;
                        if (item.max !== undefined) input.max = item.max;
                    }

                    row.appendChild(input);

                    // Add background image uploader controls if key is bgColor
                    if (item.key === 'bgColor') {
                        const bgImgBox = document.createElement('div');
                        bgImgBox.style.marginTop = '10px';
                        bgImgBox.style.padding = '10px';
                        bgImgBox.style.background = 'var(--bg-secondary, #18181b)';
                        bgImgBox.style.borderRadius = '6px';
                        bgImgBox.innerHTML = `
                            <label style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block;">Background Image</label>
                            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                                <input type="file" id="creatorBgFile" accept="image/*" style="font-size: 12px; flex: 1;">
                                <button type="button" class="btn btn-secondary" id="creatorBgClear" style="padding: 4px 8px; font-size: 12px;">Clear Image</button>
                            </div>
                            <div id="creatorBgPreview" style="font-size: 12px; opacity: 0.7;">No background image set</div>
                        `;
                        groupDiv.appendChild(row);
                        groupDiv.appendChild(bgImgBox);
                        return;
                    }

                    groupDiv.appendChild(row);
                });

                // Add AI Theme Generator Card under theme_colors group
                if (group.id === 'theme_colors') {
                    const aiCard = document.createElement('div');
                    aiCard.className = 'ai-theme-card';
                    aiCard.style.marginTop = '16px';
                    aiCard.style.padding = '12px';
                    aiCard.style.background = 'var(--bg-secondary, #18181b)';
                    aiCard.style.border = '1px dashed var(--primary-color, #9147ff)';
                    aiCard.style.borderRadius = '8px';
                    aiCard.innerHTML = `
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--primary-light, #a970ff);">AI Theme Generator</h4>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" id="creatorAiPrompt" class="form-control" placeholder="Describe vibe, e.g. 'Cyberpunk Neon Matrix'..." style="flex: 1;">
                            <button type="button" class="btn btn-secondary" id="creatorAiGenerateBtn"><i data-lucide="sparkles" class="lucide-inline"></i> Generate</button>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <label style="font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                <input type="checkbox" id="creatorAiIncludeBg" checked> Include AI Background Image
                            </label>
                            <span id="creatorAiStatus" style="font-size: 12px; opacity: 0.7;"></span>
                        </div>
                    `;
                    groupDiv.appendChild(aiCard);
                }

                sectionEl.appendChild(groupDiv);
                container.appendChild(sectionEl);
            });

            // Mount Font Picker inside fontPickerMount
            const fontMount = document.getElementById('fontPickerMount');
            if (fontMount) {
                this.fontPicker = createFontPicker(fontMount, {
                    initialValue: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                    // Scope the picker's own `--font-family` preview to its mount point, not
                    // document.documentElement — this page's chrome (nav/body/labels) also
                    // reads that variable, so writing it globally would restyle the whole
                    // Scene Creator UI instead of just the chat overlay being configured.
                    // The actual chat preview is driven separately via sendPreviewUpdate()
                    // (postMessage into the preview iframe), same as every other form control.
                    styleTarget: fontMount,
                    onSelect: () => this.sendPreviewUpdate()
                });
            }

            if (window.lucide) window.lucide.createIcons();
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

            // Background image controls
            const bgFile = document.getElementById('creatorBgFile');
            const bgClear = document.getElementById('creatorBgClear');
            if (bgFile) {
                bgFile.addEventListener('change', (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                        try {
                            const compressFn = window.compressImageToBase64JPEG || (async (url) => url);
                            this.currentBgImage = await compressFn(evt.target.result, 0.85);
                            const previewEl = document.getElementById('creatorBgPreview');
                            if (previewEl) previewEl.textContent = 'Custom image loaded';
                            this.sendPreviewUpdate();
                        } catch (err) {
                            console.error('Failed to process background image:', err);
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }
            if (bgClear) {
                bgClear.addEventListener('click', () => {
                    this.currentBgImage = null;
                    if (bgFile) bgFile.value = '';
                    const previewEl = document.getElementById('creatorBgPreview');
                    if (previewEl) previewEl.textContent = 'No background image set';
                    this.sendPreviewUpdate();
                });
            }

            // AI Theme Generator button
            const aiGenBtn = document.getElementById('creatorAiGenerateBtn');
            if (aiGenBtn) {
                aiGenBtn.addEventListener('click', async () => {
                    const promptInput = document.getElementById('creatorAiPrompt');
                    const includeBg = document.getElementById('creatorAiIncludeBg');
                    const statusEl = document.getElementById('creatorAiStatus');
                    const prompt = promptInput?.value?.trim();

                    if (!prompt) {
                        alert('Please enter a vibe or theme description.');
                        return;
                    }

                    try {
                        aiGenBtn.disabled = true;
                        if (statusEl) statusEl.textContent = 'Generating...';
                        const generateFn = window.generateThemeApi;
                        if (!generateFn) throw new Error('AI Theme Generator service unavailable.');

                        const result = await generateFn({
                            prompt,
                            generateImage: !!includeBg?.checked,
                            onStatusUpdate: (msg) => {
                                if (statusEl) statusEl.textContent = msg;
                            }
                        });

                        if (result && result.themeData) {
                            const theme = result.themeData;
                            if (theme.background_color) {
                                const parsed = UIHelpers.parseColor(theme.background_color);
                                const bgInput = document.getElementById('schema-input-bgColor');
                                const bgOpacityInput = document.getElementById('schema-input-bgColorOpacity');
                                if (bgInput && parsed.hex) bgInput.value = parsed.hex;
                                if (bgOpacityInput && parsed.opacity !== undefined) {
                                    bgOpacityInput.value = parsed.opacity;
                                    const valDisplay = document.getElementById('schema-val-bgColorOpacity');
                                    if (valDisplay) valDisplay.textContent = `${Math.round(parsed.opacity * 100)}%`;
                                }
                            }
                            if (theme.border_color) {
                                const parsed = UIHelpers.parseColor(theme.border_color);
                                const borderInput = document.getElementById('schema-input-borderColor');
                                if (borderInput && parsed.hex) borderInput.value = parsed.hex;
                            }
                            if (theme.text_color) {
                                const parsed = UIHelpers.parseColor(theme.text_color);
                                const textInput = document.getElementById('schema-input-textColor');
                                if (textInput && parsed.hex) textInput.value = parsed.hex;
                            }
                            if (theme.username_color) {
                                const parsed = UIHelpers.parseColor(theme.username_color);
                                const userColorInput = document.getElementById('schema-input-usernameColor');
                                if (userColorInput && parsed.hex) userColorInput.value = parsed.hex;
                            }
                            if (result.compressedImage) {
                                this.currentBgImage = result.compressedImage;
                                const previewEl = document.getElementById('creatorBgPreview');
                                if (previewEl) previewEl.textContent = 'AI Background Image generated';
                            }

                            if (statusEl) statusEl.textContent = 'Theme applied!';
                            this.sendPreviewUpdate();
                        }
                    } catch (err) {
                        console.error('AI Theme Generation failed:', err);
                        if (statusEl) statusEl.textContent = 'Failed: ' + err.message;
                    } finally {
                        aiGenBtn.disabled = false;
                    }
                });
            }
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
            }
        }

        // Setup UI event listeners
        setupEventListeners() {
            if (this.createInstanceBtn) this.createInstanceBtn.addEventListener('click', () => this.openInstanceModal());
            if (this.emptyStateCreateBtn) this.emptyStateCreateBtn.addEventListener('click', () => this.openInstanceModal());
            if (this.modalCancelBtn) this.modalCancelBtn.addEventListener('click', () => this.closeInstanceModal());
            if (this.modalCreateBtn) this.modalCreateBtn.addEventListener('click', () => this.createInstance());
            if (this.saveSettingsBtn) this.saveSettingsBtn.addEventListener('click', () => this.saveCurrentInstance({ includeChannel: false }));

            if (this.duplicateBtn) this.duplicateBtn.addEventListener('click', () => this.duplicateCurrentInstance());
            if (this.deleteBtn) this.deleteBtn.addEventListener('click', () => this.deleteCurrentInstance());
            if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportCurrentInstance());
            if (this.importBtn) this.importBtn.addEventListener('click', () => this.importInstance());
            if (this.exportAllBtn) this.exportAllBtn.addEventListener('click', () => this.exportAllInstances());

            const toggleObsSetupBtn = document.getElementById('toggleObsSetupBtn');
            if (toggleObsSetupBtn) {
                toggleObsSetupBtn.addEventListener('click', () => {
                    if (this.obsSetup.style.display === 'none') {
                        this.obsSetup.style.display = 'block';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="eye-off" class="lucide-inline"></i> Hide OBS Setup Instructions';
                    } else {
                        this.obsSetup.style.display = 'none';
                        toggleObsSetupBtn.innerHTML = '<i data-lucide="monitor" class="lucide-inline"></i> Detailed OBS Setup Instructions';
                    }
                    if (window.lucide) window.lucide.createIcons();
                });
            }

            if (this.copyUrlBtnConfig) this.copyUrlBtnConfig.addEventListener('click', () => this.copyUrl(this.instanceUrlConfig.textContent));
            if (this.copyUrlBtnSetup) this.copyUrlBtnSetup.addEventListener('click', () => this.copyUrl(this.instanceUrlSetup.textContent));

            if (this.instanceModal) {
                this.instanceModal.addEventListener('click', (e) => {
                    if (e.target === this.instanceModal) this.closeInstanceModal();
                });
            }

            this.instanceList.addEventListener('dragstart', this.handleDragStart.bind(this));
            this.instanceList.addEventListener('dragover', this.handleDragOver.bind(this));
            this.instanceList.addEventListener('dragenter', this.handleDragEnter.bind(this));
            this.instanceList.addEventListener('dragleave', this.handleDragLeave.bind(this));
            this.instanceList.addEventListener('drop', this.handleDrop.bind(this));

            if (this.enableSyncBtn) this.enableSyncBtn.addEventListener('click', () => this.enableSync());
            if (this.regenerateTokenBtn) this.regenerateTokenBtn.addEventListener('click', () => this.regenerateToken());
            if (this.disableSyncBtn) this.disableSyncBtn.addEventListener('click', () => this.disableSync());
            if (this.linkExistingTokenBtn) this.linkExistingTokenBtn.addEventListener('click', () => this.linkExistingToken());
            if (this.applyChannelBtn) this.applyChannelBtn.addEventListener('click', () => this.applyChannel());
        }

        // Real-time live preview setup
        setupFormLivePreview() {
            CONFIG_SCHEMA.forEach(item => {
                if (item.control === 'font' || item.control === 'presets') return;

                const input = document.getElementById(`schema-input-${item.key}`);
                if (!input) return;

                const eventType = input.type === 'checkbox' || input.type === 'range' || input.tagName === 'SELECT' ? 'change' : 'input';
                input.addEventListener(eventType, () => {
                    if (item.control === 'range') {
                        const valDisplay = document.getElementById(`schema-val-${item.key}`);
                        if (valDisplay) {
                            valDisplay.textContent = item.scale ? `${Math.round(input.value * item.scale)}%` : input.value;
                        }
                    }

                    if (item.key === 'chatMode') {
                        const isPopup = input.value === 'popup';
                        const popupBlock = document.getElementById('popupModeBlock');
                        if (popupBlock) popupBlock.style.display = isPopup ? 'block' : 'none';

                        const rowHeight = document.getElementById('schema-row-chatHeight');
                        const rowMaxMsg = document.getElementById('schema-row-maxMessages');
                        const rowTopFade = document.getElementById('schema-row-topFade');
                        if (rowHeight) rowHeight.style.display = isPopup ? 'none' : 'flex';
                        if (rowMaxMsg) rowMaxMsg.style.display = isPopup ? 'none' : 'flex';
                        if (rowTopFade) rowTopFade.style.display = isPopup ? 'none' : 'flex';
                    }

                    this.sendPreviewUpdate();
                });
            });

            // Listeners for popup sub-fields
            ['schema-popup-direction', 'schema-popup-duration', 'schema-popup-maxMessages'].forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.addEventListener('change', () => this.sendPreviewUpdate());
                    input.addEventListener('input', () => this.sendPreviewUpdate());
                }
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

            // Set preview iframe src and listen for load
            if (this.previewIframe) {
                this.previewIframe.src = `chat.html?demo=1&scene=${encodeURIComponent(instanceId)}`;
                this.previewIframe.addEventListener('load', () => this.sendPreviewUpdate(), { once: true });
            }
            this.sendPreviewUpdate();
        }

        // Subscribe to Firestore for live external edits
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
            this.currentBgImage = config.bgImage || null;

            this.instanceName.value = instance.name || '';
            this.instanceId.value = this.currentInstanceId;

            if (this.creatorTwitchChannel) this.creatorTwitchChannel.value = config.lastTwitchChannel || config.lastChannel || '';
            if (this.creatorYoutubeTarget) this.creatorYoutubeTarget.value = config.lastYouTubeTarget || '';

            CONFIG_SCHEMA.forEach(item => {
                if (item.control === 'font') {
                    if (this.fontPicker) this.fontPicker.setValue(config.fontFamily || item.default);
                    return;
                }
                if (item.control === 'presets') {
                    const container = document.getElementById(`schema-presets-${item.key}`);
                    if (container) {
                        container.querySelectorAll('.preset-btn').forEach(btn => {
                            const isActive = btn.dataset.value === (config[item.key] || item.default);
                            btn.classList.toggle('active', isActive);
                        });
                    }
                    return;
                }
                if (item.control === 'popup_group') {
                    const dirInput = document.getElementById('schema-popup-direction');
                    const durInput = document.getElementById('schema-popup-duration');
                    const maxMsgInput = document.getElementById('schema-popup-maxMessages');
                    if (dirInput) dirInput.value = config.popup?.direction || item.default.direction;
                    if (durInput) durInput.value = config.popup?.duration || item.default.duration;
                    if (maxMsgInput) maxMsgInput.value = config.popup?.duration !== undefined ? config.popup.maxMessages : item.default.maxMessages;
                    return;
                }

                const input = document.getElementById(`schema-input-${item.key}`);
                if (!input) return;

                if (item.control === 'checkbox') {
                    input.checked = !!config[item.key];
                } else if (item.control === 'range') {
                    input.value = config[item.key] ?? item.default;
                    const valDisplay = document.getElementById(`schema-val-${item.key}`);
                    if (valDisplay) {
                        valDisplay.textContent = item.scale ? `${Math.round(input.value * item.scale)}%` : input.value;
                    }
                } else {
                    input.value = config[item.key] ?? item.default;
                }
            });

            // Update background image preview text
            const previewEl = document.getElementById('creatorBgPreview');
            if (previewEl) {
                previewEl.textContent = this.currentBgImage ? 'Background image active' : 'No background image set';
            }

            // Display mode gating
            const isPopup = config.chatMode === 'popup';
            const popupBlock = document.getElementById('popupModeBlock');
            if (popupBlock) popupBlock.style.display = isPopup ? 'block' : 'none';

            const rowHeight = document.getElementById('schema-row-chatHeight');
            const rowMaxMsg = document.getElementById('schema-row-maxMessages');
            const rowTopFade = document.getElementById('schema-row-topFade');
            if (rowHeight) rowHeight.style.display = isPopup ? 'none' : 'flex';
            if (rowMaxMsg) rowMaxMsg.style.display = isPopup ? 'none' : 'flex';
            if (rowTopFade) rowTopFade.style.display = isPopup ? 'none' : 'flex';

            // Sync controls UI state
            if (instance.syncToken) {
                if (this.syncBadge) {
                    this.syncBadge.textContent = 'Web Sync: Active';
                    this.syncBadge.style.background = '#1b5e20';
                    this.syncBadge.style.color = '#e8f5e9';
                    this.syncBadge.style.border = '1px solid #2e7d32';
                }
                if (this.enableSyncBtn) this.enableSyncBtn.style.display = 'none';
                if (this.regenerateTokenBtn) this.regenerateTokenBtn.style.display = 'inline-flex';
                if (this.disableSyncBtn) this.disableSyncBtn.style.display = 'inline-flex';
            } else {
                if (this.syncBadge) {
                    this.syncBadge.textContent = 'Web Sync: Disabled';
                    this.syncBadge.style.background = 'var(--bg-tertiary, #1f1f23)';
                    this.syncBadge.style.color = 'var(--text-muted, #adadb8)';
                    this.syncBadge.style.border = '1px solid var(--border-color, #333)';
                }
                if (this.enableSyncBtn) this.enableSyncBtn.style.display = 'inline-flex';
                if (this.regenerateTokenBtn) this.regenerateTokenBtn.style.display = 'none';
                if (this.disableSyncBtn) this.disableSyncBtn.style.display = 'none';
            }
        }

        // Read configuration object from form input elements
        readFormConfig({ includeChannel = false } = {}) {
            const defaults = this.getDefaultConfig();
            const existing = this.instances[this.currentInstanceId]?.config || {};
            const config = {
                ...defaults,
                ...existing,
                configVersion: CONFIG_VERSION
            };

            CONFIG_SCHEMA.forEach(item => {
                if (item.control === 'font') {
                    config.fontFamily = this.fontPicker ? this.fontPicker.getValue() : (existing.fontFamily || defaults.fontFamily);
                    return;
                }
                if (item.control === 'presets') {
                    const activeBtn = document.querySelector(`#schema-presets-${item.key} .preset-btn.active`);
                    if (activeBtn) config[item.key] = activeBtn.dataset.value;
                    else config[item.key] = existing[item.key] ?? item.default;
                    return;
                }
                if (item.control === 'popup_group') {
                    config.popup = {
                        direction: document.getElementById('schema-popup-direction')?.value || defaults.popup.direction,
                        duration: parseInt(document.getElementById('schema-popup-duration')?.value || defaults.popup.duration, 10),
                        maxMessages: parseInt(document.getElementById('schema-popup-maxMessages')?.value || defaults.popup.maxMessages, 10)
                    };
                    return;
                }

                const input = document.getElementById(`schema-input-${item.key}`);
                if (!input) return;

                if (item.control === 'checkbox') {
                    config[item.key] = !!input.checked;
                } else if (item.control === 'number') {
                    config[item.key] = parseInt(input.value || item.default, 10);
                } else if (item.control === 'range') {
                    config[item.key] = parseFloat(input.value ?? item.default);
                } else {
                    config[item.key] = input.value || item.default;
                }
            });

            if (this.currentBgImage) {
                config.bgImage = this.currentBgImage;
            }

            // Apply Chroma key transition logic
            applyChromaKey(config, config.chromaKey);

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

        // Apply channel connection settings
        async applyChannel() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const twitch = this.creatorTwitchChannel?.value?.trim();
            const youtube = this.creatorYoutubeTarget?.value?.trim();

            await this.saveCurrentInstance({ includeChannel: true });
            this.sendPreviewUpdate();
            this.showNotification('Channel Connection Updated', `Connected to Twitch: ${twitch || 'None'}, YouTube: ${youtube || 'None'}`);
        }

        // Enable live web sync
        async enableSync() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];

            const newToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
            instance.syncToken = newToken;

            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();

            const pushResult = await this.pushToCloud(newToken, instance.config, instance.name);
            if (pushResult.success) {
                this.showNotification('Live Sync Enabled', 'Firestore sync token minted. OBS browser source will sync edits live.');
                this.subscribeToRemoteChanges(newToken);
            } else {
                this.showNotification('Sync Created', 'Minted token locally, but initial cloud push failed.', 'warning');
            }
        }

        // Regenerate sync token
        async regenerateToken() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            if (!window.confirm('Generating a new token will orphan any OBS browser sources using the current token. Proceed?')) return;

            const instance = this.instances[this.currentInstanceId];
            const newToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
            instance.syncToken = newToken;

            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();

            const pushResult = await this.pushToCloud(newToken, instance.config, instance.name);
            if (pushResult.success) {
                this.showNotification('Token Regenerated', 'New token created. Remember to update your OBS Browser Source URL.');
                this.subscribeToRemoteChanges(newToken);
            } else {
                this.showNotification('Token Regenerated', 'New token created, but cloud push failed.', 'warning');
            }
        }

        // Link existing token
        async linkExistingToken() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const token = prompt('Enter existing scene sync token (UUID):')?.trim();
            if (!token) return;

            const instance = this.instances[this.currentInstanceId];
            instance.syncToken = token;
            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();
            this.subscribeToRemoteChanges(token);
            this.showNotification('Linked', `Linked to sync token: ${token}`);
        }

        // Disable sync
        disableSync() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];
            delete instance.syncToken;
            this.saveInstances();
            this.populateForm(instance);
            this.updateInstanceUrl();
            if (this.firestoreUnsubscribe) {
                this.firestoreUnsubscribe();
                this.firestoreUnsubscribe = null;
            }
            this.showNotification('Sync Disabled', 'Live sync disabled for this scene.');
        }

        // Push configuration to Cloud Run proxy
        async pushToCloud(syncToken, config, sceneName) {
            try {
                const proxyUrl = getProxyBaseUrl();
                const response = await fetch(`${proxyUrl}/scenes/${syncToken}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        config: config,
                        sceneName: sceneName || 'Untitled Scene',
                        updatedBy: this.myClientId
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error('[Creator] Cloud push failed:', response.status, errText);
                    return { success: false, status: response.status };
                }

                return { success: true };
            } catch (error) {
                console.error('[Creator] Error pushing to cloud proxy:', error);
                return { success: false, error: error.message };
            }
        }

        // Update displayed URLs
        updateInstanceUrl() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];
            const baseUrl = window.location.href.split('chat-scene-creator.html')[0] + 'chat.html';
            let url = `${baseUrl}?scene=${encodeURIComponent(this.currentInstanceId)}`;
            if (instance.syncToken) {
                url += `&sync=${encodeURIComponent(instance.syncToken)}`;
            }

            if (this.instanceUrlConfig) this.instanceUrlConfig.textContent = url;
            if (this.instanceUrlSetup) this.instanceUrlSetup.textContent = url;
        }

        // Copy text to clipboard
        async copyUrl(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.showNotification('Copied', 'URL copied to clipboard!', 'success');
            } catch (err) {
                console.error('Failed to copy URL:', err);
                this.showNotification('Copy Failed', 'Please select and copy the text manually.', 'error');
            }
        }

        // Save instances registry to localStorage
        saveInstances() {
            try {
                localStorage.setItem('twitch-chat-overlay-instances', JSON.stringify(this.instances));
                localStorage.setItem('twitch-chat-overlay-instanceOrder', JSON.stringify(this.instanceOrder));
            } catch (err) {
                console.error('Failed to save instances:', err);
            }
        }

        // Render instance list items
        renderInstanceList() {
            if (!this.instanceList) return;
            this.instanceList.innerHTML = '';

            this.instanceOrder.forEach(id => {
                const instance = this.instances[id];
                if (!instance) return;

                const item = document.createElement('div');
                item.className = 'instance-item';
                item.dataset.id = id;
                item.draggable = true;
                if (id === this.currentInstanceId) item.classList.add('active');

                item.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div>
                            <div style="font-weight: 600;">${this.escapeHtml(instance.name)}</div>
                            <div style="font-size: 11px; opacity: 0.6;">${id}${instance.syncToken ? ' • Sync Active' : ''}</div>
                        </div>
                        <i data-lucide="grip-vertical" style="opacity: 0.4; cursor: grab;"></i>
                    </div>
                `;

                item.addEventListener('click', () => this.selectInstance(id));
                this.instanceList.appendChild(item);
            });

            if (window.lucide) window.lucide.createIcons();
        }

        // Open instance creation modal
        openInstanceModal() {
            if (this.instanceModal) {
                this.modalInstanceName.value = '';
                this.instanceModal.style.display = 'flex';
                this.modalInstanceName.focus();
            }
        }

        // Close instance creation modal
        closeInstanceModal() {
            if (this.instanceModal) {
                this.instanceModal.style.display = 'none';
            }
        }

        // Create new instance
        createInstance() {
            const name = this.modalInstanceName.value.trim() || 'New Chat Scene';
            const id = 'scene_' + Date.now();

            this.instances[id] = {
                id: id,
                name: name,
                config: this.getDefaultConfig(),
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            this.instanceOrder.push(id);
            this.saveInstances();
            this.renderInstanceList();
            this.closeInstanceModal();
            this.selectInstance(id);
            this.showNotification('Created', `Created chat scene: ${name}`);
        }

        // Duplicate instance
        duplicateCurrentInstance() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const current = this.instances[this.currentInstanceId];
            const newId = 'scene_' + Date.now();
            const newName = `${current.name} (Copy)`;

            this.instances[newId] = {
                id: newId,
                name: newName,
                config: JSON.parse(JSON.stringify(current.config)),
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            this.instanceOrder.push(newId);
            this.saveInstances();
            this.renderInstanceList();
            this.selectInstance(newId);
            this.showNotification('Duplicated', `Created copy: ${newName}`);
        }

        // Delete instance
        deleteCurrentInstance() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const current = this.instances[this.currentInstanceId];
            if (!window.confirm(`Are you sure you want to delete "${current.name}"?`)) return;

            delete this.instances[this.currentInstanceId];
            this.instanceOrder = this.instanceOrder.filter(id => id !== this.currentInstanceId);
            this.saveInstances();
            this.renderInstanceList();

            if (this.instanceOrder.length > 0) {
                this.selectInstance(this.instanceOrder[0]);
            } else {
                this.showEmptyState();
            }
            this.showNotification('Deleted', `Deleted chat scene: ${current.name}`);
        }

        // Show empty state when no instances exist
        showEmptyState() {
            this.currentInstanceId = null;
            if (this.emptyState) this.emptyState.style.display = 'block';
            if (this.configLayout) this.configLayout.style.display = 'none';
            if (this.workspaceActions) this.workspaceActions.style.display = 'none';
            if (this.workspaceTitle) this.workspaceTitle.textContent = 'Select or Create a Chat Scene';
        }

        // Export current instance JSON
        exportCurrentInstance() {
            if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return;
            const instance = this.instances[this.currentInstanceId];
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(instance, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `${instance.name.replace(/\s+/g, '_')}_config.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }

        // Export all instances JSON
        exportAllInstances() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
                instances: this.instances,
                instanceOrder: this.instanceOrder
            }, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `chat_scenes_export.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }

        // Import instance JSON
        importInstance() {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const parsed = JSON.parse(evt.target.result);
                        if (parsed.instances && parsed.instanceOrder) {
                            this.instances = { ...this.instances, ...parsed.instances };
                            parsed.instanceOrder.forEach(id => {
                                if (!this.instanceOrder.includes(id)) this.instanceOrder.push(id);
                            });
                        } else if (parsed.id && parsed.name && parsed.config) {
                            const newId = 'scene_' + Date.now();
                            parsed.id = newId;
                            this.instances[newId] = parsed;
                            this.instanceOrder.push(newId);
                        }
                        this.saveInstances();
                        this.renderInstanceList();
                        this.showNotification('Imported', 'Chat scenes imported successfully.');
                    } catch (err) {
                        console.error('Import failed:', err);
                        this.showNotification('Import Failed', 'Invalid JSON file.', 'error');
                    }
                };
                reader.readAsText(file);
            };
            fileInput.click();
        }

        // Drag and drop ordering handlers
        handleDragStart(e) {
            const target = e.target.closest('.instance-item');
            if (target) {
                this.draggedItemId = target.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
            }
        }

        handleDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }

        handleDragEnter(e) {
            const target = e.target.closest('.instance-item');
            if (target) target.classList.add('drag-over');
        }

        handleDragLeave(e) {
            const target = e.target.closest('.instance-item');
            if (target) target.classList.remove('drag-over');
        }

        handleDrop(e) {
            e.preventDefault();
            const target = e.target.closest('.instance-item');
            if (target) {
                target.classList.remove('drag-over');
                const dropId = target.dataset.id;
                if (this.draggedItemId && dropId && this.draggedItemId !== dropId) {
                    const fromIdx = this.instanceOrder.indexOf(this.draggedItemId);
                    const toIdx = this.instanceOrder.indexOf(dropId);
                    if (fromIdx !== -1 && toIdx !== -1) {
                        this.instanceOrder.splice(fromIdx, 1);
                        this.instanceOrder.splice(toIdx, 0, this.draggedItemId);
                        this.saveInstances();
                        this.renderInstanceList();
                    }
                }
            }
        }

        // Notification helper
        showNotification(title, message, type = 'info') {
            console.log(`[Notification ${type.toUpperCase()}] ${title}: ${message}`);
        }

        // Escape HTML helper
        escapeHtml(str) {
            return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
    }

    window.chatSceneCreatorApp = new ChatSceneCreator();
});
