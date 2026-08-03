import { UIHelpers } from './ui-helpers.js';
import { generateThemeApi, processAndAddTheme } from '../theme-generator.js';
import { addThemeToCarousel, getAvailableThemes, updateThemeDetails } from '../theme-carousel.js';
import { buildThemeFromConfig, isUserPreset, MAX_PRESET_NAME_LENGTH } from './theme-preset-builder.js';
import { promptForThemeName } from './theme-name-modal.js';
import { MAX_LIBRARY_THEMES } from './theme-library-client.js';

/**
 * Normalize a shadow preset's display name to the slug the preset buttons use,
 * e.g. 'Simple 3D' -> 'simple3d', 'Soft' -> 'soft'. Returns null for CSS values
 * (which contain characters no slug has) so they don't activate a wrong button.
 * @param {string} [name]
 * @returns {string|null}
 */
function slugifyPreset(name) {
    if (!name || typeof name !== 'string') return null;
    if (/[(),#]/.test(name)) return null; // a raw CSS value, not a preset name
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class CreatorThemeController {
    constructor(formRenderer) {
        this.renderer = formRenderer;
    }

    setupAiListeners() {
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
                    const generateFn = generateThemeApi;
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

                        // Persist the generated theme to the shared cloud library so it doesn't
                        // vanish once this form is closed. Reuse theme-generator.js's own
                        // construction logic (unique `generated-...` value, "(Variant N)" dedupe
                        // naming) instead of duplicating it here. It returns the constructed
                        // theme object, which carries every style property the AI produced.
                        let addedTheme = null;
                        if (typeof processAndAddTheme === 'function') {
                            addedTheme = processAndAddTheme(theme, result.compressedImage || null);
                            if (this.renderer.themeCarouselController && typeof this.renderer.themeCarouselController.refresh === 'function') {
                                this.renderer.themeCarouselController.refresh();
                            }
                        } else {
                            console.warn('[creator-form-renderer] processAndAddTheme unavailable; generated theme was not persisted to the theme library.');
                        }

                        if (addedTheme) {
                            // Apply the full theme (colors, opacity, font, radius, shadows,
                            // timestamp/pronoun colors, background image) through the same
                            // path the carousel uses, so nothing the AI returned is dropped.
                            this.applyThemeToForm(addedTheme);
                        } else {
                            // Library unavailable — degrade to applying the raw colors.
                            if (theme.background_color) {
                                this.renderer.updateColorControl('bgColor', theme.background_color);
                                const parsed = UIHelpers.parseColor(theme.background_color);
                                if (parsed.opacity !== undefined) {
                                    this.renderer.updateRangeControl('bgColorOpacity', parsed.opacity, v => `${Math.round(v * 100)}%`);
                                }
                            }
                            if (theme.border_color) this.renderer.updateColorControl('borderColor', theme.border_color);
                            if (theme.text_color) this.renderer.updateColorControl('textColor', theme.text_color);
                            if (theme.username_color) this.renderer.updateColorControl('usernameColor', theme.username_color);
                            if (result.compressedImage) {
                                this.renderer.bgImageHandler.currentBgImage = result.compressedImage;
                                this.renderer.bgImageHandler.updatePreviewText('AI Background Image generated');
                            }
                            this.renderer.sendPreviewUpdate();
                        }

                        if (statusEl) statusEl.textContent = 'Theme applied!';
                    }
                } catch (err) {
                    console.error('AI Theme Generation failed:', err);
                    if (statusEl) statusEl.textContent = 'Failed: ' + err.message;
                } finally {
                    aiGenBtn.disabled = false;
                }
            });

            // Enter in the prompt field triggers generation, matching the
            // config-panel generator's behavior (theme-generator.js).
            const aiPromptInput = document.getElementById('creatorAiPrompt');
            if (aiPromptInput) {
                aiPromptInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !aiGenBtn.disabled) {
                        e.preventDefault();
                        aiGenBtn.click();
                    }
                });
            }
        }
    }

    setupPresetListeners() {
        const saveBtn = document.getElementById('creatorSavePresetBtn');
        if (!saveBtn) return;

        saveBtn.addEventListener('click', () => this.saveCurrentSettingsAsPreset());
    }

    /**
     * Snapshot the form's current look as a named theme preset in the shared cloud
     * library, so it can be re-applied to any scene later. The counterpart to the
     * AI generator: same destination, but the user's own settings as the source.
     */
    async saveCurrentSettingsAsPreset() {
        const statusEl = document.getElementById('creatorPresetStatus');

        // Read the form rather than the stored instance config: the form is the
        // live state, and readFormConfig() also folds in the uploaded background
        // image and the picked Google Font, neither of which is a schema key.
        const config = this.renderer.readFormConfig();
        const existingThemes = getAvailableThemes() || [];
        const presetCount = existingThemes.filter(isUserPreset).length;

        const name = await promptForThemeName({
            title: 'Save Theme Preset',
            message: 'Save the current colors, font, radius, shadows and background image as a reusable preset.',
            note: existingThemes.length >= MAX_LIBRARY_THEMES
                ? `Your theme library is full (${MAX_LIBRARY_THEMES}). Saving will remove the oldest theme.`
                : '',
            defaultValue: `My Preset ${presetCount + 1}`,
            maxLength: MAX_PRESET_NAME_LENGTH
        });

        if (!name) return;

        const theme = buildThemeFromConfig(config, { name, existingThemes });

        // Report what actually persisted. addThemeToCarousel() is optimistic — it
        // inserts locally and pushes in the background — so without this an
        // unreachable proxy would look like a successful save until the next reload.
        let pushTimeoutId = null;
        const onPushResult = (e) => {
            if (e.detail?.theme?.value !== theme.value) return;
            if (pushTimeoutId) clearTimeout(pushTimeoutId);
            document.removeEventListener('theme-library-push-result', onPushResult);

            if (!e.detail.ok) {
                if (statusEl) statusEl.textContent = 'Saved for this session only.';
                UIHelpers.showNotification(
                    'Preset Not Synced',
                    'Could not reach the theme library. This preset will be lost when you reload.',
                    'warning'
                );
                return;
            }

            if (statusEl) statusEl.textContent = 'Preset saved!';
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

        if (statusEl) statusEl.textContent = 'Saving...';
        const added = addThemeToCarousel(theme);

        // Point the form's hidden theme input at the new preset and refresh the
        // details pane. Deliberately NOT selectByValue(): that fires onApply ->
        // applyThemeToForm, which would rewrite every control from the theme we
        // just derived from them — wasteful, and it churns the bg image reference
        // while the cloud push is still in flight.
        const themeInput = document.getElementById('schema-input-theme');
        if (themeInput) themeInput.value = added.value;
        updateThemeDetails(added);

        if (this.renderer.onFormChange) this.renderer.onFormChange();
    }

    /**
     * Apply a theme object (fired via the theme carousel's onApply callback) to the
     * form: writes its colors through updateColorControl(), records the selected
     * theme's value, resolves its background image, and pushes the result to the
     * live preview. Mirrors the field mapping applyTheme() uses in
     * modules/theme-manager.js:79-92.
     * @param {Object} theme
     */
    applyThemeToForm(theme, { suppressDirty = false } = {}) {
        if (!theme) return;

        if (theme.bgColor) {
            this.renderer.updateColorControl('bgColor', theme.bgColor);
            // A theme's alpha lives inside its bgColor (e.g. the Transparent preset
            // is 'rgba(0, 0, 0, 0)'), so it has to be lifted into the separate
            // opacity slider. Without this the form keeps whatever opacity was
            // already set and transparent themes render as solid colour.
            const parsed = UIHelpers.parseColor(theme.bgColor);
            const opacity = theme.bgColorOpacity ?? parsed.opacity;
            if (opacity !== undefined) this.renderer.updateRangeControl('bgColorOpacity', opacity, v => `${Math.round(v * 100)}%`);
        }

        if (theme.borderColor) {
            this.renderer.updateColorControl('borderColor', theme.borderColor);
        }

        if (theme.textColor) this.renderer.updateColorControl('textColor', theme.textColor);
        if (theme.usernameColor) this.renderer.updateColorControl('usernameColor', theme.usernameColor);
        if (theme.timestampColor) this.renderer.updateColorControl('timestampColor', theme.timestampColor);
        if (theme.pronounBadgeColor) this.renderer.updateColorControl('pronounBadgeColor', theme.pronounBadgeColor);

        // Themes and the preset buttons speak different dialects: a theme carries
        // borderRadius: 'Subtle' with borderRadiusValue: '8px', while the radius
        // buttons are keyed by the px value. Shadows are the reverse — the buttons
        // use slugs ('simple3d') and the theme uses display names ('Simple 3D').
        this.renderer.updatePresetControl('borderRadius', theme.borderRadiusValue || theme.borderRadius);
        this.renderer.updatePresetControl('boxShadow', slugifyPreset(theme.boxShadow));
        this.renderer.updatePresetControl('textShadow', slugifyPreset(theme.textShadow));

        if (theme.bgImageOpacity !== undefined) {
            this.renderer.updateRangeControl('bgImageOpacity', theme.bgImageOpacity, v => `${Math.round(v * 100)}%`);
        }

        const topFadeInput = document.getElementById('schema-input-topFade');
        if (topFadeInput && theme.topFade !== undefined) topFadeInput.checked = !!theme.topFade;

        if (theme.fontFamily && this.renderer.fontPicker) {
            if (theme.isGoogleFont && theme.googleFontFamily && typeof this.renderer.fontPicker.setFont === 'function') {
                // Full metadata available (AI-generated themes): register the font,
                // load its stylesheet, and record googleFontFamily so the preview
                // iframe and synced configs can load it too.
                this.renderer.fontPicker.setFont({
                    name: theme.fontFamily,
                    value: `'${theme.googleFontFamily}', sans-serif`,
                    description: `${theme.googleFontFamily} from Google Fonts`,
                    isGoogleFont: true,
                    googleFontFamily: theme.googleFontFamily
                });
            } else if (typeof this.renderer.fontPicker.setValue === 'function') {
                // Pass googleFontFamily explicitly (null when the theme uses none) so
                // the picker clears any stale family from a previously applied theme,
                // matching how populateForm() calls it.
                this.renderer.fontPicker.setValue(theme.fontFamily, theme.googleFontFamily ?? null);
            }
        }

        const themeInput = document.getElementById('schema-input-theme');
        if (themeInput) themeInput.value = theme.value || theme.name || themeInput.value;

        this.renderer.bgImageHandler.currentBgImage = theme.backgroundImage || null;
        this.renderer.bgImageHandler.updatePreviewText(theme.backgroundImage ? 'Background image active' : 'No background image set');

        this.renderer.sendPreviewUpdate();
        if (!suppressDirty && this.renderer.onFormChange) this.renderer.onFormChange();
    }
}
