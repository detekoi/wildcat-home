import { describe, it, expect } from 'vitest';
import { buildThemeFromConfig, isUserPreset, uniquePresetName } from '../theme-preset-builder.js';

/**
 * A config in the shape ConfigManager.getDefaultConfig() produces: hex bgColor with
 * the alpha in a separate field, a px borderRadius, and slug shadows.
 */
function makeConfig(overrides = {}) {
    return {
        bgColor: '#101014',
        bgColorOpacity: 0.75,
        borderColor: '#9147ff',
        textColor: '#efeff1',
        usernameColor: '#00ffea',
        timestampColor: '#adadb8',
        pronounBadgeColor: '#adadb8',
        fontFamily: "'Inter', sans-serif",
        borderRadius: '16px',
        boxShadow: 'simple3d',
        textShadow: 'outline',
        bgImage: null,
        bgImageOpacity: 0.55,
        topFade: false,
        ...overrides
    };
}

describe('theme-preset-builder', () => {
    describe('buildThemeFromConfig', () => {
        it('carries the colors across unchanged', () => {
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });

            expect(theme.bgColor).toBe('#101014');
            expect(theme.bgColorOpacity).toBe(0.75);
            expect(theme.borderColor).toBe('#9147ff');
            expect(theme.textColor).toBe('#efeff1');
            expect(theme.usernameColor).toBe('#00ffea');
            expect(theme.timestampColor).toBe('#adadb8');
            expect(theme.pronounBadgeColor).toBe('#adadb8');
        });

        it('emits both the px radius and its resolved value', () => {
            // applyTheme() reads `borderRadius`; applyThemeToForm() reads
            // `borderRadiusValue`. Both must be present for the preset to round-trip
            // through both hosts.
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });

            expect(theme.borderRadius).toBe('16px');
            expect(theme.borderRadiusValue).toBe('16px');
        });

        it('preserves shadow slugs so the creator preset buttons re-highlight', () => {
            // slugifyPreset() returns null for raw CSS values, so storing the resolved
            // CSS in `boxShadow` would silently stop activating the right button.
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });

            expect(theme.boxShadow).toBe('simple3d');
            expect(theme.textShadow).toBe('outline');
            expect(theme.boxShadowValue).toContain('rgba');
        });

        it('maps the config key bgImage onto the theme key backgroundImage', () => {
            const theme = buildThemeFromConfig(
                makeConfig({ bgImage: 'data:image/jpeg;base64,AAAA' }),
                { name: 'Cozy' }
            );

            expect(theme.backgroundImage).toBe('data:image/jpeg;base64,AAAA');
        });

        it('keeps a null background image null', () => {
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });
            expect(theme.backgroundImage).toBeNull();
        });

        it('honors an explicit null backgroundImage override over a populated config', () => {
            // The override is "what the user actually has now", so clearing the image
            // must not silently fall back to the config's stale value.
            const theme = buildThemeFromConfig(
                makeConfig({ bgImage: 'https://example.com/old.jpg' }),
                { name: 'Cozy', backgroundImage: null }
            );

            expect(theme.backgroundImage).toBeNull();
        });

        it('substitutes the pre-chroma-key color instead of saving the key color', () => {
            // While chroma key is on, bgColor is the key color at zero opacity. Saving
            // that verbatim would produce a preset that is bright green everywhere else.
            const theme = buildThemeFromConfig(
                makeConfig({
                    chromaKey: true,
                    bgColor: '#00b140',
                    bgColorOpacity: 0,
                    preChromaKeyColor: '#1a1a2e',
                    preChromaKeyOpacity: 0.9
                }),
                { name: 'Cozy' }
            );

            expect(theme.bgColor).toBe('#1a1a2e');
            expect(theme.bgColorOpacity).toBe(0.9);
        });

        it('carries Google font metadata so non-bundled fonts survive', () => {
            const theme = buildThemeFromConfig(
                makeConfig({ fontFamily: "'Tektur', sans-serif", googleFontFamily: 'Tektur' }),
                { name: 'Cozy' }
            );

            expect(theme.fontFamily).toBe("'Tektur', sans-serif");
            expect(theme.isGoogleFont).toBe(true);
            expect(theme.googleFontFamily).toBe('Tektur');
        });

        it('reports no Google font when the config has none', () => {
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });

            expect(theme.isGoogleFont).toBe(false);
            expect(theme.googleFontFamily).toBeNull();
        });

        it('marks the theme as a deletable user preset', () => {
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });

            expect(theme.isUserPreset).toBe(true);
            // isGenerated means "cloud-backed and deletable", not "AI-made" — the
            // carousel keys its delete affordance off it.
            expect(theme.isGenerated).toBe(true);
            expect(isUserPreset(theme)).toBe(true);
        });

        it('mints a unique value in its own namespace on every call', () => {
            // Both the carousel and the server dedupe strictly by `value`, so a
            // collision would silently drop a save.
            const values = new Set(
                Array.from({ length: 200 }, () => buildThemeFromConfig(makeConfig(), { name: 'Same Name' }).value)
            );

            expect(values.size).toBe(200);
            for (const value of values) {
                expect(value.startsWith('preset-')).toBe(true);
                expect(value.startsWith('generated-')).toBe(false);
            }
        });

        it('falls back to a default name when given none', () => {
            expect(buildThemeFromConfig(makeConfig(), {}).name).toBe('My Preset');
        });

        it('generates a description rather than leaving the details pane empty', () => {
            const theme = buildThemeFromConfig(makeConfig(), { name: 'Cozy' });
            expect(theme.description).toBeTruthy();
        });

        it('does not throw on a missing or non-object config', () => {
            expect(() => buildThemeFromConfig(undefined, { name: 'X' })).not.toThrow();
            expect(() => buildThemeFromConfig(null, { name: 'X' })).not.toThrow();
        });
    });

    describe('uniquePresetName', () => {
        it('leaves an unused name alone', () => {
            expect(uniquePresetName('Cozy', [{ name: 'Other' }])).toBe('Cozy');
        });

        it('suffixes a name that is already taken', () => {
            expect(uniquePresetName('Cozy', [{ name: 'Cozy' }])).toBe('Cozy (2)');
            expect(uniquePresetName('Cozy', [{ name: 'Cozy' }, { name: 'Cozy (2)' }])).toBe('Cozy (3)');
        });

        it('tolerates themes with no name', () => {
            expect(() => uniquePresetName('Cozy', [{}, null, { name: 'Cozy' }])).not.toThrow();
        });

        it('falls back when given a blank name', () => {
            expect(uniquePresetName('   ', [])).toBe('My Preset');
        });
    });
});
