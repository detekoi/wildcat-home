/**
 * Creator Form Renderer Module
 * Handles schema-driven form rendering, population, reading, and live preview updates for Chat Scene Creator.
 */

import { CONFIG_VERSION, applyChromaKey } from './config-manager.js';
import { CONFIG_SCHEMA, SCHEMA_GROUPS, getVisibleSchemaItems } from './config-schema.js';
import { createFontPicker } from './font-manager.js';
import { UIHelpers } from './ui-helpers.js';
import { mount, addTheme, getThemes, applyTheme, updateThemeDetails, highlightActiveCard, applyAndScrollToTheme, scrollToThemeCard, loadGoogleFont, availableFonts, availableThemes, currentThemeIndex } from '../theme-carousel.js';
import { CreatorBgImageHandler } from './creator-bg-image-handler.js';
import { CreatorThemeController } from './creator-theme-controller.js';



export class CreatorFormRenderer {
    /**
     * @param {Object} opts
     * @param {Object} opts.configManager - ConfigManager helper
     * @param {HTMLIFrameElement} opts.previewIframe - Live preview iframe
     * @param {Function} [opts.onFormChange] - Callback when form values change
     */
    constructor({ configManager, previewIframe, onFormChange }) {
        this.configManager = configManager;
        this.previewIframe = previewIframe;
        this.onFormChange = onFormChange || null;
        this.fontPicker = null;
        this.bgImageHandler = new CreatorBgImageHandler(this);
        this.themeController = new CreatorThemeController(this);
        this.stashedBgColor = null;
        this.stashedBgOpacity = null;
    }

    // Render schema-driven configuration controls into container
    renderSchemaForm(container) {
        if (!container) return;

        container.innerHTML = '';

        // Design-system section markup: each group is a titled section card
        // (.card.wc-card > .card-header > h2.wc-card-title + .card-body) whose
        // rows are .list-group-items. The advanced groups share one "Advanced"
        // section, each as a disclosure row that opens onto its own rows.
        let advancedBody = null;

        SCHEMA_GROUPS.forEach(group => {
            const groupItems = getVisibleSchemaItems(group.id);
            if (groupItems.length === 0) return;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'list-group settings-group';
            groupDiv.id = `group-${group.id}`;

            let sectionEl;
            if (group.advanced) {
                if (!advancedBody) {
                    const advancedSection = this.createSectionCard('Advanced', 'advanced');
                    advancedSection.classList.add('wch-advanced');
                    advancedBody = advancedSection.querySelector('.card-body');
                    container.appendChild(advancedSection);
                }
                sectionEl = document.createElement('details');
                sectionEl.className = 'settings-section advanced-section';
                const summary = document.createElement('summary');
                summary.className = 'advanced-summary';
                summary.innerHTML = `<span class="advanced-summary-label">${group.label} <span class="badge-count">(${groupItems.length})</span></span><i data-lucide="chevron-down" class="advanced-summary-icon" aria-hidden="true"></i>`;
                sectionEl.appendChild(summary);
                sectionEl.appendChild(groupDiv);
                advancedBody.appendChild(sectionEl);
            } else {
                sectionEl = this.createSectionCard(group.label, group.id);
                sectionEl.classList.add('settings-section');
                sectionEl.querySelector('.card-body').appendChild(groupDiv);
                container.appendChild(sectionEl);
            }

            groupItems.forEach(item => {
                if (item.subheading) {
                    const subHead = document.createElement('div');
                    subHead.className = 'config-sublabel wc-readout';
                    subHead.textContent = item.subheading;
                    if (item.indent) {
                        const subIndent = item.indent > 1 ? 20 : (item.indent * 20);
                        subHead.style.setProperty('--row-indent', `${subIndent}px`);
                    }
                    groupDiv.appendChild(subHead);
                }

                // A row is label (+ help) on the left, its control on the right.
                // applyChatModeVisibility() re-shows rows with display:flex, which
                // is the layout .list-group-item already has.
                const row = document.createElement('div');
                row.className = 'list-group-item settings-row';
                row.id = `schema-row-${item.key}`;

                if (item.indent) {
                    const indentPx = item.indent === 1 ? 20 : 35;
                    row.style.setProperty('--row-indent', `${indentPx}px`);
                    row.classList.add('settings-row--indent');
                }

                const textCol = document.createElement('div');
                textCol.className = 'wch-row-text';
                const label = document.createElement('label');
                label.className = 'wc-row-label';
                label.htmlFor = `schema-input-${item.key}`;
                label.textContent = item.label;
                textCol.appendChild(label);
                row.appendChild(textCol);

                const controlCol = document.createElement('div');
                controlCol.className = `wch-row-control wch-row-control--${item.control}`;
                row.appendChild(controlCol);

                if (item.control === 'font') {
                    const fontMount = document.createElement('div');
                    fontMount.id = 'fontPickerMount';
                    controlCol.appendChild(fontMount);
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
                            if (this.onFormChange) this.onFormChange();
                        });

                        presetGroup.appendChild(btn);
                    });

                    controlCol.appendChild(presetGroup);
                    groupDiv.appendChild(row);
                    return;
                }

                if (item.control === 'themeCarousel') {
                    const mountDiv = document.createElement('div');
                    mountDiv.id = `schema-themecarousel-${item.key}`;
                    mountDiv.className = 'theme-carousel-mount';

                    // Hidden input holds the selected theme's value so the generic
                    // read/populate loops in readFormConfig()/populateForm() keep
                    // working for this key without special-casing it there.
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.id = `schema-input-${item.key}`;
                    hiddenInput.value = item.default;
                    // The carousel needs the row's full width, so this row stacks.
                    row.classList.add('settings-row--stacked');
                    controlCol.appendChild(hiddenInput);
                    controlCol.appendChild(mountDiv);
                    groupDiv.appendChild(row);

                    // Saving the current form as a preset is the counterpart to
                    // picking one from the carousel, so it sits directly beneath it —
                    // as its own block, not inside the row, whose flex layout would
                    // squeeze it against the carousel's nav arrows.
                    const presetActions = document.createElement('div');
                    presetActions.className = 'theme-preset-actions';
                    presetActions.innerHTML = `
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="creatorSavePresetBtn">
                            <i data-lucide="bookmark-plus" class="lucide-inline"></i> Save current settings as preset
                        </button>
                        <span id="creatorPresetStatus"></span>
                    `;
                    groupDiv.appendChild(presetActions);

                    if (typeof mount === 'function') {
                        try {
                            this.themeCarouselController = mount(mountDiv, {
                                onApply: (theme, { userInitiated = true } = {}) => this.themeController.applyThemeToForm(theme, { suppressDirty: !userInitiated }),
                                // The creator already renders a live preview beside the form,
                                // so the carousel's own swatch would just be a duplicate.
                                showPreview: false,
                                // Prevent remote active-theme sync from firing onApply,
                                // which would overwrite per-scene form fields (bgColor,
                                // opacity, etc.) with the theme's defaults on page load.
                                suppressRemoteApply: true
                            });
                        } catch (err) {
                            console.warn('[creator-form-renderer] themeCarousel.mount() threw:', err);
                            mountDiv.textContent = 'Theme picker unavailable.';
                        }
                    } else {
                        console.warn('[creator-form-renderer] themeCarousel not found; theme picker will not render.');
                        mountDiv.textContent = 'Theme picker unavailable.';
                    }
                    return;
                }

                if (item.control === 'popup_group') {
                    const popupContainer = document.createElement('div');
                    popupContainer.id = 'popupModeBlock';
                    popupContainer.className = 'wch-subrows';

                    const directionSubfield = item.subFields?.find(sf => sf.key === 'direction');
                    const optionsHtml = directionSubfield?.options ?
                        directionSubfield.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('') :
                        `
                            <option value="from-bottom">From Bottom</option>
                            <option value="from-top">From Top</option>
                            <option value="from-left">From Left</option>
                            <option value="from-right">From Right</option>
                        `;

                    popupContainer.innerHTML = `
                        <div class="list-group-item settings-row">
                            <div class="wch-row-text"><label class="wc-row-label" for="schema-popup-direction">Animation direction</label></div>
                            <div class="wch-row-control wch-row-control--select">
                                <select id="schema-popup-direction" class="form-select">
                                    ${optionsHtml}
                                </select>
                            </div>
                        </div>
                        <div class="list-group-item settings-row">
                            <div class="wch-row-text"><label class="wc-row-label" for="schema-popup-duration">Message duration (seconds)</label></div>
                            <div class="wch-row-control wch-row-control--number">
                                <input type="number" id="schema-popup-duration" min="2" max="60" value="5" class="form-control wc-field--number">
                            </div>
                        </div>
                        <div class="list-group-item settings-row">
                            <div class="wch-row-text"><label class="wc-row-label" for="schema-popup-maxMessages">Max popup messages</label></div>
                            <div class="wch-row-control wch-row-control--number">
                                <input type="number" id="schema-popup-maxMessages" min="1" max="10" value="3" class="form-control wc-field--number">
                            </div>
                        </div>
                    `;
                    groupDiv.appendChild(popupContainer);
                    return;
                }

                let input;
                let valDisplay = null;
                if (item.control === 'select') {
                    input = document.createElement('select');
                    input.id = `schema-input-${item.key}`;
                    input.className = 'form-select';
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
                    input.className = 'form-check-input';
                    input.setAttribute('role', 'switch');
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
                    hexInput.maxLength = 11;
                    hexInput.value = safeDefault.toUpperCase();
                    hexInput.placeholder = '#RRGGBB';

                    input.addEventListener('input', () => {
                        hexInput.value = input.value.toUpperCase();
                    });

                    const syncHexToSwatch = () => {
                        let val = hexInput.value.trim().toLowerCase();
                        if (val === 'transparent') {
                            input.value = '#000000';
                            this.sendPreviewUpdate();
                            if (this.onFormChange) this.onFormChange();
                            return;
                        }
                        if (val && !val.startsWith('#')) val = '#' + val;
                        const parsed = UIHelpers.parseColor(val);
                        if (parsed.hex && parsed.hex.length === 7) {
                            input.value = parsed.hex;
                            this.sendPreviewUpdate();
                            if (this.onFormChange) this.onFormChange();
                        }
                    };
                    hexInput.addEventListener('input', syncHexToSwatch);
                    hexInput.addEventListener('change', syncHexToSwatch);

                    // Hex readout first, then the swatch, as the design lays the row out.
                    // The hex stays editable; it reads as a quiet readout until focused.
                    hexInput.setAttribute('aria-label', `${item.label} hex value`);
                    wrapper.appendChild(hexInput);
                    wrapper.appendChild(input);
                    controlCol.appendChild(wrapper);
                    groupDiv.appendChild(row);
                    if (item.key === 'bgColor') groupDiv.appendChild(this.bgImageHandler.createBgImageBox());
                    return;
                } else if (item.control === 'range') {
                    input = document.createElement('input');
                    input.type = 'range';
                    input.id = `schema-input-${item.key}`;
                    input.min = item.min;
                    input.max = item.max;
                    input.step = item.step;
                    input.value = item.default;
                    input.className = 'form-range';

                    valDisplay = document.createElement('span');
                    valDisplay.id = `schema-val-${item.key}`;
                    valDisplay.className = 'range-val-display wc-slider-value';
                    valDisplay.textContent = item.scale ? `${Math.round(item.default * item.scale)}%` : item.default;
                } else {
                    input = document.createElement('input');
                    input.type = item.control === 'number' ? 'number' : 'text';
                    input.id = `schema-input-${item.key}`;
                    input.className = item.control === 'number' ? 'form-control wc-field--number' : 'form-control';
                    if (item.min !== undefined) input.min = item.min;
                    if (item.max !== undefined) input.max = item.max;
                }

                if (item.control === 'checkbox') {
                    const sw = document.createElement('div');
                    sw.className = 'form-check form-switch';
                    sw.appendChild(input);
                    controlCol.appendChild(sw);
                } else if (item.control === 'range') {
                    // Slider first, then its readout, as the design system's Slider lays them out.
                    const slider = document.createElement('span');
                    slider.className = 'wch-slider';
                    slider.appendChild(input);
                    slider.appendChild(valDisplay);
                    controlCol.appendChild(slider);
                } else {
                    controlCol.appendChild(input);
                }

                groupDiv.appendChild(row);

                if (item.helpText || item.helpUrl) {
                    const helpDiv = document.createElement('div');
                    helpDiv.className = 'help-text wch-row-desc';
                    // Help text sits under the label, inside the row, so hiding the row
                    // hides it too. applyChatModeVisibility() still addresses it by id.
                    helpDiv.id = `schema-help-${item.key}`;
                    // Point the control at its own help text, so it's announced with
                    // the field rather than being visual-only.
                    input.setAttribute('aria-describedby', helpDiv.id);
                    if (item.helpUrl) {
                        const linkText = item.helpLinkText || item.helpUrl;
                        helpDiv.innerHTML = `${item.helpText ? item.helpText + ' ' : ''}<a class="wc-link wc-link--underline" href="${item.helpUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
                    } else {
                        helpDiv.textContent = item.helpText;
                    }
                    textCol.appendChild(helpDiv);
                }
            });

            if (group.id === 'theme_colors') {
                const aiCard = document.createElement('div');
                aiCard.className = 'ai-theme-card creator-subcard';
                aiCard.innerHTML = `
                    <label class="wc-note-label" for="creatorAiPrompt">Generate a theme from a description</label>
                    <div class="input-group">
                        <input type="text" id="creatorAiPrompt" class="form-control" placeholder="Example: cyberpunk neon matrix">
                        <button type="button" class="btn btn-secondary" id="creatorAiGenerateBtn"><i data-lucide="wand" class="lucide-inline"></i> Generate</button>
                    </div>
                    <div class="creator-subcard-foot">
                        <label class="creator-check">
                            <input type="checkbox" id="creatorAiIncludeBg" checked> Include a background image
                        </label>
                        <span id="creatorAiStatus" class="wc-readout" aria-live="polite"></span>
                    </div>
                `;
                groupDiv.appendChild(aiCard);
            }

        });

        const fontMount = document.getElementById('fontPickerMount');
        if (fontMount) {
            this.fontPicker = createFontPicker(fontMount, {
                initialValue: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                styleTarget: fontMount,
                onSelect: () => {
                    this.sendPreviewUpdate();
                    if (this.onFormChange) this.onFormChange();
                }
            });
        }

        if (window.lucide) window.lucide.createIcons();

        this.bgImageHandler.setupListeners();
        this.themeController.setupAiListeners();
        this.themeController.setupPresetListeners();
    }

    /**
     * A design-system section card: caps title over one rule, rows in the body.
     * @param {string} title
     * @param {string} id  used for the heading id the section is labelled by
     * @returns {HTMLElement}
     */
    createSectionCard(title, id) {
        const section = document.createElement('section');
        section.className = 'card wc-card';
        const headingId = `schema-section-${id}`;
        section.setAttribute('aria-labelledby', headingId);
        const header = document.createElement('div');
        header.className = 'card-header';
        const h2 = document.createElement('h2');
        h2.className = 'wc-card-title';
        h2.id = headingId;
        h2.textContent = title;
        header.appendChild(h2);
        const body = document.createElement('div');
        body.className = 'card-body';
        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    setupFormLivePreview() {
        CONFIG_SCHEMA.forEach(item => {
            if (item.control === 'font' || item.control === 'presets' || item.control === 'themeCarousel') return;

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

                if (item.key === 'chromaKey') {
                    this.syncChromaKeyUIControls(input.checked);
                }

                if (item.key === 'chatMode') {
                    this.applyChatModeVisibility(input.value === 'popup');
                }

                this.sendPreviewUpdate();
                if (this.onFormChange) this.onFormChange();
            };
            eventTypes.forEach(eventType => input.addEventListener(eventType, handleUpdate));
        });

        ['schema-popup-direction', 'schema-popup-duration', 'schema-popup-maxMessages'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                const handlePopupUpdate = () => {
                    this.sendPreviewUpdate();
                    if (this.onFormChange) this.onFormChange();
                };
                input.addEventListener('change', handlePopupUpdate);
                input.addEventListener('input', handlePopupUpdate);
            }
        });
    }

    /**
     * Show/hide the controls that only apply to one chat mode. Popup mode replaces
     * the window-mode sizing/history settings with the popup block, so those rows —
     * and their help text, which renders as a sibling of the row rather than inside
     * it — have to be hidden together or the blurb is left stranded on its own.
     * @param {boolean} isPopup
     */
    applyChatModeVisibility(isPopup) {
        const popupBlock = document.getElementById('popupModeBlock');
        if (popupBlock) popupBlock.style.display = isPopup ? 'block' : 'none';

        ['chatHeight', 'maxMessages', 'topFade'].forEach(key => {
            const row = document.getElementById(`schema-row-${key}`);
            if (row) row.style.display = isPopup ? 'none' : 'flex';
            const help = document.getElementById(`schema-help-${key}`);
            if (help) help.style.display = isPopup ? 'none' : '';
        });
    }

    updateColorControl(key, colorStr) {
        if (!colorStr) return;
        const swatchInput = document.getElementById(`schema-input-${key}`);
        const hexInput = document.getElementById(`schema-hex-${key}`);

        if (typeof colorStr === 'string' && colorStr.trim().toLowerCase() === 'transparent') {
            if (swatchInput) swatchInput.value = '#000000';
            if (hexInput) hexInput.value = 'TRANSPARENT';
            return;
        }

        const parsed = UIHelpers.parseColor(colorStr);
        const hex = (parsed && parsed.hex) ? parsed.hex : '#121212';
        if (swatchInput) swatchInput.value = hex;
        if (hexInput) hexInput.value = hex.toUpperCase();
    }

    /**
     * Set a range input and its value readout together.
     * @param {string} key - Schema key.
     * @param {number} value
     * @param {Function} [format] - Formats the readout text.
     */
    updateRangeControl(key, value, format) {
        const input = document.getElementById(`schema-input-${key}`);
        if (!input) return;
        input.value = value;
        const valDisplay = document.getElementById(`schema-val-${key}`);
        if (valDisplay) valDisplay.textContent = format ? format(value) : String(value);
    }

    /**
     * Move the active state on a preset button group (borderRadius/boxShadow/textShadow).
     * @param {string} key - Schema key.
     * @param {string} value - The preset value to activate.
     */
    updatePresetControl(key, value) {
        if (!value) return;
        const container = document.getElementById(`schema-presets-${key}`);
        if (!container) return;
        // Must match the selector readFormConfig() uses to read the value back
        // (`#schema-presets-<key> .preset-btn.active`).
        container.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
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
        this.bgImageHandler.currentBgImage = config.bgImage || null;

        if (domRefs.instanceName) domRefs.instanceName.value = instance.name || '';
        if (domRefs.syncTokenDisplay) domRefs.syncTokenDisplay.value = instance.syncToken || '';

        if (domRefs.creatorTwitchChannel) domRefs.creatorTwitchChannel.value = config.lastTwitchChannel || config.lastChannel || '';
        if (domRefs.creatorYoutubeTarget) domRefs.creatorYoutubeTarget.value = config.lastYouTubeTarget || '';

        CONFIG_SCHEMA.forEach(item => {
            if (item.control === 'font') {
                // Pass the saved Google Font metadata alongside the value so the
                // picker can resolve fonts that aren't in availableFonts.
                if (this.fontPicker) this.fontPicker.setValue(config.fontFamily || item.default, config.googleFontFamily ?? null);
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
            if (item.control === 'themeCarousel') {
                const themeVal = config[item.key] ?? item.default;
                const themeInput = document.getElementById(`schema-input-${item.key}`);
                if (themeInput) themeInput.value = themeVal;
                if (this.themeCarouselController) {
                    if (typeof this.themeCarouselController.highlightByValue === 'function') {
                        this.themeCarouselController.highlightByValue(themeVal);
                    } else if (typeof this.themeCarouselController.selectByValue === 'function') {
                        this.themeCarouselController.selectByValue(themeVal);
                    }
                }
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

        this.bgImageHandler.updatePreviewText(this.bgImageHandler.currentBgImage ? 'Background image active' : 'No background image set');

        this.applyChatModeVisibility(config.chatMode === 'popup');

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
                // Carried alongside fontFamily (it's a runtime key, not a schema
                // item) so the preview iframe and the synced config can load the
                // font's stylesheet. Without it a picked Google Font renders as
                // the browser fallback everywhere but this page.
                config.googleFontFamily = this.fontPicker && typeof this.fontPicker.getGoogleFontFamily === 'function'
                    ? this.fontPicker.getGoogleFontFamily()
                    : (existingConfig.googleFontFamily ?? null);
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
            } else if (item.control === 'color') {
                const hexInput = document.getElementById(`schema-hex-${item.key}`);
                const hexVal = hexInput?.value?.trim()?.toLowerCase();
                if (hexVal === 'transparent') {
                    config[item.key] = 'transparent';
                } else if (hexVal && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hexVal)) {
                    config[item.key] = hexVal;
                } else if (hexVal && /^(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hexVal)) {
                    config[item.key] = '#' + hexVal;
                } else {
                    config[item.key] = input.value || item.default;
                }
            } else {
                config[item.key] = input.value || item.default;
            }
        });

        // Always written, including as null: omitting the key on clear left the
        // previously saved image in place both locally and on the sync server.
        config.bgImage = this.bgImageHandler.currentBgImage || null;

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
