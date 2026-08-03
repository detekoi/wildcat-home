/**
 * Theme Preset Builder Module
 *
 * Turns a flat overlay config into a theme object suitable for the theme
 * carousel and the cloud theme library — the inverse of ThemeManager.applyTheme()
 * (modules/theme-manager.js:41) and CreatorThemeController.applyThemeToForm()
 * (modules/creator-theme-controller.js:124).
 *
 * This is what lets a user save a hand-tuned look as a reusable preset instead of
 * only ever receiving themes from the AI generator.
 *
 * Deliberately pure: no DOM, no network, no module state. Both hosts (the overlay
 * config panel and the scene creator) feed it a config and get a theme back.
 */

import { UIHelpers } from './ui-helpers.js';

/**
 * Fields that survive the round-trip config -> theme -> config.
 *
 * The two vocabularies differ in three places, and each is handled below:
 *   - radius:  config stores a px value ('8px'); themes carry a display name plus
 *              a `borderRadiusValue`. applyTheme() prefers `borderRadius`, while
 *              applyThemeToForm() prefers `borderRadiusValue` — so both are set to
 *              the px value, which each consumer accepts.
 *   - shadows: config stores slugs ('soft', 'simple3d'); themes carry the slug in
 *              `boxShadow`/`textShadow` and the resolved CSS in `boxShadowValue`.
 *   - image:   themes call it `backgroundImage`, scene configs call it `bgImage`.
 */

/**
 * True when a theme came from "save my current settings" rather than the AI generator.
 * @param {Object} theme
 * @returns {boolean}
 */
export function isUserPreset(theme) {
    return !!(theme && theme.isUserPreset);
}

/**
 * Disambiguate a preset name against the themes already in the carousel by
 * appending " (2)", " (3)", … Names are cosmetic — dedupe is strictly by `value`
 * — but two identically-named cards are needlessly confusing to pick between.
 *
 * @param {string} name - Desired name.
 * @param {Array<Object>} [existingThemes] - Themes currently in the carousel.
 * @returns {string} A name not already in use.
 */
export function uniquePresetName(name, existingThemes = []) {
    const base = ((typeof name === 'string' && name.trim()) || 'My Preset').slice(0, MAX_PRESET_NAME_LENGTH);
    const taken = new Set(
        (Array.isArray(existingThemes) ? existingThemes : [])
            .map(t => t && typeof t.name === 'string' ? t.name : null)
            .filter(Boolean)
    );

    if (!taken.has(base)) return base;

    for (let n = 2; n < 1000; n++) {
        const candidate = `${base} (${n})`;
        if (!taken.has(candidate)) return candidate;
    }
    return base;
}

export const MAX_PRESET_NAME_LENGTH = 60;

/**
 * Build a theme object from an overlay config.
 *
 * @param {Object} config - A flat overlay config (ConfigManager.getDefaultConfig() shape).
 * @param {Object} [options]
 * @param {string} [options.name] - User-supplied preset name.
 * @param {string} [options.description] - Optional description; auto-generated when omitted.
 * @param {string|null} [options.backgroundImage] - Explicit background image, overriding config.bgImage.
 * @param {Array<Object>} [options.existingThemes] - Themes already in the carousel, for name disambiguation.
 * @returns {Object} A theme object ready for addThemeToCarousel().
 */
export function buildThemeFromConfig(config, { name, description, backgroundImage, existingThemes } = {}) {
    const cfg = config && typeof config === 'object' ? config : {};

    const presetName = uniquePresetName(name, existingThemes);

    // `backgroundImage` is an explicit override rather than a fallback, so an
    // intentional `null` (the user cleared the image) is honoured instead of
    // silently falling back to whatever the config still holds.
    const image = backgroundImage !== undefined ? backgroundImage : (cfg.bgImage ?? null);

    // Chroma key is an output/compositing setting, not part of the look: while it
    // is on, bgColor is the key colour (#00b140) at zero opacity. Saving that
    // verbatim would produce a preset that is bright green everywhere else, so
    // fall back to the colour stashed before the key was enabled. applyTheme()
    // force-clears chromaKey when a theme is applied, so this never round-trips.
    const usingChromaKey = !!cfg.chromaKey;
    const bgColor = usingChromaKey ? (cfg.preChromaKeyColor ?? '#121212') : cfg.bgColor;
    const bgColorOpacity = usingChromaKey ? (cfg.preChromaKeyOpacity ?? 0.85) : cfg.bgColorOpacity;

    return {
        name: presetName,
        // Own id namespace so a preset can never collide with the generator's
        // `generated-...` values — the library dedupes strictly by `value`.
        value: UIHelpers.generateSecureId('preset'),
        description: (typeof description === 'string' && description.trim())
            ? description.trim()
            : `Saved preset — ${new Date().toLocaleDateString()}`,

        bgColor,
        // Config keeps a hex bgColor with the alpha in a separate field, which is
        // exactly the shape applyTheme() expects when bgColor starts with '#'.
        bgColorOpacity,
        borderColor: cfg.borderColor,
        textColor: cfg.textColor,
        usernameColor: cfg.usernameColor,
        timestampColor: cfg.timestampColor,
        pronounBadgeColor: cfg.pronounBadgeColor,

        fontFamily: cfg.fontFamily,
        // Carried so a Google Font outside the local top-100 list can be
        // re-registered and its stylesheet re-loaded when the preset is applied.
        isGoogleFont: !!cfg.googleFontFamily,
        googleFontFamily: cfg.googleFontFamily ?? null,

        borderRadius: cfg.borderRadius,
        borderRadiusValue: UIHelpers.getBorderRadiusValue(cfg.borderRadius),
        boxShadow: cfg.boxShadow,
        boxShadowValue: UIHelpers.getBoxShadowValue(cfg.boxShadow),
        textShadow: cfg.textShadow,

        backgroundImage: image,
        bgImageOpacity: cfg.bgImageOpacity,
        topFade: cfg.topFade,

        // Means "lives in the cloud library and is therefore deletable", not
        // "made by the AI" — the carousel force-stamps it on every library theme
        // anyway (theme-carousel.js:370), so setting it keeps the object honest.
        isGenerated: true,
        // The actual origin marker, used to badge the card. Whitelisted in the
        // proxy's ALLOWED_THEME_KEYS, without which it would be dropped on save
        // and the badge would vanish on the next cloud sync.
        isUserPreset: true
    };
}
