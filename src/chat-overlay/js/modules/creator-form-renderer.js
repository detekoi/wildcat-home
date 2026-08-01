/**
 * Creator Form Renderer Module
 * Handles schema-driven form rendering, population, reading, and live preview updates for Chat Scene Creator.
 */

import { CONFIG_VERSION, applyChromaKey } from './config-manager.js';
import { CONFIG_SCHEMA, SCHEMA_GROUPS, getVisibleSchemaItems } from './config-schema.js';
import { createFontPicker } from './font-manager.js';
import { UIHelpers } from './ui-helpers.js';

export class CreatorFormRenderer {
    /**
     * @param {Object} opts
     * @param {Object} opts.configManager - ConfigManager helper
     * @param {HTMLIFrameElement} opts.previewIframe - Live preview iframe
     */
    constructor({ configManager, previewIframe }) {
        this.configManager = configManager;
        this.previewIframe = previewIframe;
        this.fontPicker = null;
        this.currentBgImage = null;
        this.stashedBgColor = null;
        this.stashedBgOpacity = null;
    }

    // Render schema-driven configuration controls into container
    renderSchemaForm(container) {
        if (!container) return;

        container.innerHTML = '';

        SCHEMA_GROUPS.forEach(group => {
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
                if (item.subheading) {
                    const subHead = document.createElement('div');
                    subHead.className = 'config-sublabel';
                    subHead.textContent = item.subheading;
                    subHead.style.fontSize = '0.9em';
                    subHead.style.fontWeight = '600';
                    subHead.style.opacity = '0.85';
                    subHead.style.marginTop = '10px';
                    subHead.style.marginBottom = '6px';
                    if (item.indent) {
                        const subIndent = item.indent > 1 ? 20 : (item.indent * 20);
                        subHead.style.marginLeft = `${subIndent}px`;
                    }
                    groupDiv.appendChild(subHead);
                }

                const row = document.createElement('div');
                row.className = 'settings-row';
                row.id = `schema-row-${item.key}`;

                if (item.indent) {
                    const indentPx = item.indent === 1 ? 20 : 35;
                    row.style.marginLeft = `${indentPx}px`;
                    row.style.width = `calc(100% - ${indentPx}px)`;
                }

                const label = document.createElement('label');
                label.htmlFor = `schema-input-${item.key}`;
                label.textContent = item.label;
                if (item.indent) {
                    label.style.fontSize = '0.95em';
                }
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

                        if (item.key === 'borderRadius') {
                            btn.className = 'preset-btn radius-btn';
                            const swatch = document.createElement('span');
                            swatch.className = 'radius-swatch';
                            swatch.style.borderRadius = opt.value;
                            btn.appendChild(swatch);
                        } else if (item.key === 'boxShadow') {
                            btn.className = 'preset-btn shadow-btn';
                            const stage = document.createElement('span');
                            stage.className = 'shadow-stage';
                            const tile = document.createElement('span');
                            tile.className = 'shadow-tile';
                            tile.style.boxShadow = UIHelpers.getBoxShadowValue(opt.value);
                            stage.appendChild(tile);
                            btn.appendChild(stage);
                            const optLabel = document.createElement('span');
                            optLabel.className = 'preset-label';
                            optLabel.textContent = opt.label;
                            btn.appendChild(optLabel);
                        } else if (item.key === 'textShadow') {
                            btn.className = 'preset-btn text-shadow-btn';
                            const sample = document.createElement('span');
                            sample.className = 'text-shadow-sample';
                            sample.style.textShadow = UIHelpers.getTextShadowValue(opt.value);
                            sample.textContent = 'Aa';
                            btn.appendChild(sample);
                            const optLabel = document.createElement('span');
                            optLabel.className = 'preset-label';
                            optLabel.textContent = opt.label;
                            btn.appendChild(optLabel);
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
                    const wrapper = document.createElement('div');
                    wrapper.className = 'color-control-wrapper';

                    const safeDefault = (UIHelpers.parseColor(item.default).hex || '#121212').toLowerCase();

                    input = document.createElement('input');
                    input.type = 'color';
                    input.id = `schema-input-${item.key}`;
                    input.className = 'color-picker-swatch';
                    input.value = safeDefault;

                    const hexInput = document.createElement('input');
                    hexInput.type = 'text';
                    hexInput.id = `schema-hex-${item.key}`;
                    hexInput.className = 'form-control color-hex-input';
                    hexInput.maxLength = 7;
                    hexInput.value = safeDefault.toUpperCase();
                    hexInput.placeholder = '#RRGGBB';

                    input.addEventListener('input', () => {
                        hexInput.value = input.value.toUpperCase();
                    });

                    const syncHexToSwatch = () => {
                        let val = hexInput.value.trim();
                        if (val && !val.startsWith('#')) val = '#' + val;
                        const parsed = UIHelpers.parseColor(val);
                        if (parsed.hex && parsed.hex.length === 7) {
                            input.value = parsed.hex;
                            this.sendPreviewUpdate();
                        }
                    };
                    hexInput.addEventListener('input', syncHexToSwatch);
                    hexInput.addEventListener('change', syncHexToSwatch);

                    wrapper.appendChild(input);
                    wrapper.appendChild(hexInput);
                    row.appendChild(wrapper);
                    groupDiv.appendChild(row);
                    return;
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

        const fontMount = document.getElementById('fontPickerMount');
        if (fontMount) {
            this.fontPicker = createFontPicker(fontMount, {
                initialValue: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                styleTarget: fontMount,
                onSelect: () => this.sendPreviewUpdate()
            });
        }

        if (window.lucide) window.lucide.createIcons();

        this.setupBgImageAndAiListeners();
    }

    setupBgImageAndAiListeners() {
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
                            this.updateColorControl('bgColor', theme.background_color);
                            const parsed = UIHelpers.parseColor(theme.background_color);
                            const bgOpacityInput = document.getElementById('schema-input-bgColorOpacity');
                            if (bgOpacityInput && parsed.opacity !== undefined) {
                                bgOpacityInput.value = parsed.opacity;
                                const valDisplay = document.getElementById('schema-val-bgColorOpacity');
                                if (valDisplay) valDisplay.textContent = `${Math.round(parsed.opacity * 100)}%`;
                            }
                        }
                        if (theme.border_color) {
                            this.updateColorControl('borderColor', theme.border_color);
                        }
                        if (theme.text_color) {
                            this.updateColorControl('textColor', theme.text_color);
                        }
                        if (theme.username_color) {
                            this.updateColorControl('usernameColor', theme.username_color);
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

    setupFormLivePreview() {
        CONFIG_SCHEMA.forEach(item => {
            if (item.control === 'font' || item.control === 'presets') return;

            const input = document.getElementById(`schema-input-${item.key}`);
            if (!input) return;

            const eventTypes = input.type === 'range' ? ['input', 'change'] : [input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input'];
            const handleUpdate = () => {
                if (item.control === 'range') {
                    const valDisplay = document.getElementById(`schema-val-${item.key}`);
                    if (valDisplay) {
                        valDisplay.textContent = item.scale ? `${Math.round(input.value * item.scale)}%` : input.value;
                    }
                }

                if (item.key === 'theme') {
                    const themeVal = input.value;
                    const themes = window.availableThemes || [];
                    const foundTheme = themes.find(t => t.value === themeVal || t.name === themeVal);
                    if (foundTheme) {
                        if (foundTheme.bgColor) this.updateColorControl('bgColor', foundTheme.bgColor);
                        if (foundTheme.borderColor) this.updateColorControl('borderColor', foundTheme.borderColor);
                        if (foundTheme.textColor) this.updateColorControl('textColor', foundTheme.textColor);
                        if (foundTheme.usernameColor) this.updateColorControl('usernameColor', foundTheme.usernameColor);
                        if (foundTheme.timestampColor) this.updateColorControl('timestampColor', foundTheme.timestampColor);
                        if (foundTheme.pronounBadgeColor) this.updateColorControl('pronounBadgeColor', foundTheme.pronounBadgeColor);
                    }
                }

                if (item.key === 'chromaKey') {
                    this.syncChromaKeyUIControls(input.checked);
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
            };
            eventTypes.forEach(eventType => input.addEventListener(eventType, handleUpdate));
        });

        ['schema-popup-direction', 'schema-popup-duration', 'schema-popup-maxMessages'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', () => this.sendPreviewUpdate());
                input.addEventListener('input', () => this.sendPreviewUpdate());
            }
        });
    }

    updateColorControl(key, colorStr) {
        if (!colorStr) return;
        const parsed = UIHelpers.parseColor(colorStr);
        const hex = (parsed && parsed.hex) ? parsed.hex : '#121212';
        const swatchInput = document.getElementById(`schema-input-${key}`);
        const hexInput = document.getElementById(`schema-hex-${key}`);
        if (swatchInput) swatchInput.value = hex;
        if (hexInput) hexInput.value = hex.toUpperCase();
    }

    syncChromaKeyUIControls(isChromaKey, currentInstanceConfig = {}) {
        const bgColorInput = document.getElementById('schema-input-bgColor');
        const bgColorHex = document.getElementById('schema-hex-bgColor');
        const opacityInput = document.getElementById('schema-input-bgColorOpacity');
        const opacityValDisplay = document.getElementById('schema-val-bgColorOpacity');

        const currentBg = (currentInstanceConfig?.bgColor || '').toLowerCase();
        const currentInputColor = (bgColorInput ? bgColorInput.value : '').toLowerCase();

        if (isChromaKey) {
            if (opacityInput && parseFloat(opacityInput.value) > 0) {
                this.stashedBgOpacity = parseFloat(opacityInput.value);
                if (currentInstanceConfig) {
                    currentInstanceConfig.preChromaKeyOpacity = this.stashedBgOpacity;
                }
            }
            if (bgColorInput) {
                if (!this.stashedBgColor && currentInputColor !== '#00b140' && currentInputColor !== '#000000') {
                    this.stashedBgColor = bgColorInput.value;
                }
                if (currentInstanceConfig && this.stashedBgColor) {
                    currentInstanceConfig.preChromaKeyColor = this.stashedBgColor;
                }
                bgColorInput.value = '#00b140';
                bgColorInput.disabled = true;
                bgColorInput.style.pointerEvents = 'none';
                bgColorInput.style.opacity = '1';
            }
            if (bgColorHex) {
                bgColorHex.value = '#00B140';
                bgColorHex.disabled = true;
            }
            if (opacityInput) {
                opacityInput.value = 0;
                opacityInput.disabled = true;
            }
            if (opacityValDisplay) {
                opacityValDisplay.textContent = '0%';
            }
        } else {
            const restoredOpacity = this.stashedBgOpacity ?? currentInstanceConfig?.preChromaKeyOpacity ?? currentInstanceConfig?.bgColorOpacity ?? 0.85;
            const restoredColor = this.stashedBgColor ?? currentInstanceConfig?.preChromaKeyColor ?? (currentBg && currentBg !== '#000000' && currentBg !== '#00b140' ? currentInstanceConfig.bgColor : '#121212');

            if (bgColorInput) {
                bgColorInput.value = restoredColor;
                bgColorInput.disabled = false;
                bgColorInput.style.pointerEvents = 'auto';
                bgColorInput.style.opacity = '1';
            }
            if (bgColorHex) {
                bgColorHex.value = restoredColor.toUpperCase();
                bgColorHex.disabled = false;
            }
            if (opacityInput) {
                opacityInput.value = restoredOpacity;
                opacityInput.disabled = false;
            }
            if (opacityValDisplay) {
                opacityValDisplay.textContent = `${Math.round(restoredOpacity * 100)}%`;
            }
        }
    }

    sendPreviewUpdate(configToSync) {
        if (!this.previewIframe || !this.previewIframe.contentWindow) return;
        const config = configToSync || this.readFormConfig();
        this.previewIframe.contentWindow.postMessage({
            type: 'PREVIEW_CONFIG_UPDATE',
            config: config
        }, window.location.origin);
    }

    populateForm(instance, domRefs = {}) {
        const defaults = this.configManager.getDefaultConfig();
        const config = { ...defaults, ...(instance.config || {}) };
        this.currentBgImage = config.bgImage || null;

        if (domRefs.instanceName) domRefs.instanceName.value = instance.name || '';
        if (domRefs.instanceId) domRefs.instanceId.value = instance.id || '';

        if (domRefs.creatorTwitchChannel) domRefs.creatorTwitchChannel.value = config.lastTwitchChannel || config.lastChannel || '';
        if (domRefs.creatorYoutubeTarget) domRefs.creatorYoutubeTarget.value = config.lastYouTubeTarget || '';

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
                if (maxMsgInput) maxMsgInput.value = config.popup?.maxMessages !== undefined ? config.popup.maxMessages : item.default.maxMessages;
                return;
            }

            const input = document.getElementById(`schema-input-${item.key}`);
            if (!input) return;

            if (item.control === 'checkbox') {
                input.checked = !!config[item.key];
            } else if (item.control === 'color') {
                this.updateColorControl(item.key, config[item.key] ?? item.default);
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

        const previewEl = document.getElementById('creatorBgPreview');
        if (previewEl) {
            previewEl.textContent = this.currentBgImage ? 'Background image active' : 'No background image set';
        }

        const isPopup = config.chatMode === 'popup';
        const popupBlock = document.getElementById('popupModeBlock');
        if (popupBlock) popupBlock.style.display = isPopup ? 'block' : 'none';

        const rowHeight = document.getElementById('schema-row-chatHeight');
        const rowMaxMsg = document.getElementById('schema-row-maxMessages');
        const rowTopFade = document.getElementById('schema-row-topFade');
        if (rowHeight) rowHeight.style.display = isPopup ? 'none' : 'flex';
        if (rowMaxMsg) rowMaxMsg.style.display = isPopup ? 'none' : 'flex';
        if (rowTopFade) rowTopFade.style.display = isPopup ? 'none' : 'flex';

        const chromaKeyInput = document.getElementById('schema-input-chromaKey');
        if (chromaKeyInput) {
            this.syncChromaKeyUIControls(chromaKeyInput.checked, instance.config);
        }
    }

    readFormConfig(existingConfig = {}, domRefs = {}, { includeChannel = false } = {}) {
        const defaults = this.configManager.getDefaultConfig();
        const config = {
            ...defaults,
            ...existingConfig,
            configVersion: CONFIG_VERSION
        };

        CONFIG_SCHEMA.forEach(item => {
            if (item.control === 'font') {
                config.fontFamily = this.fontPicker ? this.fontPicker.getValue() : (existingConfig.fontFamily || defaults.fontFamily);
                return;
            }
            if (item.control === 'presets') {
                const activeBtn = document.querySelector(`#schema-presets-${item.key} .preset-btn.active`);
                if (activeBtn) config[item.key] = activeBtn.dataset.value;
                else config[item.key] = existingConfig[item.key] ?? item.default;
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

        applyChromaKey(config, config.chromaKey);

        if (includeChannel) {
            const twitch = domRefs.creatorTwitchChannel?.value?.trim();
            const youtube = domRefs.creatorYoutubeTarget?.value?.trim();
            if (twitch) config.lastTwitchChannel = twitch;
            if (youtube) config.lastYouTubeTarget = youtube;
        }

        return config;
    }
}
