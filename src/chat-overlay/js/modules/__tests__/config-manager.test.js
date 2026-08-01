import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager, migrateConfig, CONFIG_VERSION, applyChromaKey } from '../config-manager.js';

describe('migrateConfig Unit Tests', () => {
    it('should return empty object or default clone when given null or non-object input', () => {
        expect(migrateConfig(null)).toEqual({ config: {}, pendingNotice: false });
        expect(migrateConfig(undefined)).toEqual({ config: {}, pendingNotice: false });
        expect(migrateConfig('invalid')).toEqual({ config: {}, pendingNotice: false });

        const defaults = { theme: 'default', fontSize: 14 };
        expect(migrateConfig(null, defaults)).toEqual({ config: defaults, pendingNotice: false });
    });

    it('should merge loaded config over default config', () => {
        const defaults = { theme: 'default', fontSize: 14, chatMode: 'window' };
        const loaded = { fontSize: 18, theme: 'dracula' };
        const result = migrateConfig(loaded, defaults);

        expect(result.config.theme).toBe('dracula');
        expect(result.config.fontSize).toBe(18);
        expect(result.config.chatMode).toBe('window');
    });

    it('should grandfather thirdPartyEmotes to false for legacy configs without configVersion', () => {
        const defaults = { configVersion: CONFIG_VERSION, thirdPartyEmotes: true };
        const legacyLoaded = { theme: 'monokai' };

        const result = migrateConfig(legacyLoaded, defaults);

        expect(result.config.thirdPartyEmotes).toBe(false);
        expect(result.config.configVersion).toBe(CONFIG_VERSION);
        expect(result.pendingNotice).toBe(true);
    });

    it('should not override explicit thirdPartyEmotes boolean if set', () => {
        const defaults = { configVersion: CONFIG_VERSION, thirdPartyEmotes: true };
        const loaded = { thirdPartyEmotes: true };

        const result = migrateConfig(loaded, defaults);

        expect(result.config.thirdPartyEmotes).toBe(true);
        expect(result.config.configVersion).toBe(CONFIG_VERSION);
        expect(result.pendingNotice).toBe(false);
    });
});

describe('ConfigManager - State Persistence', () => {
    let configManager;

    beforeEach(() => {
        // Clear local storage mocks
        localStorage.clear();
        configManager = new ConfigManager();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadSavedConfig', () => {
        it('should load default constants if local storage is completely empty', () => {
            const defaults = {
                chatMode: 'window',
                theme: 'default',
                topFade: false,
                fontSize: 14,
                fontWeight: 'normal',
                showPronouns: true
            };

            configManager.loadSavedConfig('default');
            
            // Should accurately inherit default schema
            for (const key in defaults) {
                expect(configManager.config[key]).toBe(defaults[key]);
            }
        });

        it('should merge user customizations smoothly over defaults from localStorage', () => {
            const customConfig = {
                theme: 'dracula',
                fontSize: '20px',
                topFade: true
            };
            localStorage.setItem('chatConfig-default', JSON.stringify(customConfig));

            configManager.loadSavedConfig('default');
            
            // Customizations should be retained
            expect(configManager.config.theme).toBe('dracula');
            expect(configManager.config.fontSize).toBe('20px');
            expect(configManager.config.topFade).toBe(true);

            // Settings not in custom JSON should revert to safe hardcoded defaults
            expect(configManager.config.chatMode).toBe('window'); // Default
            expect(configManager.config.showPronouns).toBe(true); // Default
        });

        it('should handle completely corrupted JSON gracefully and fall back to system defaults without throwing', () => {
            localStorage.setItem('chatConfig-default', '{ "theme": dracula, --- corrupted --- }');
            
            // Should not crash!
            expect(() => configManager.loadSavedConfig('default')).not.toThrow();

            // Config should wipe cleanly to defaults since standard parsing failed
            expect(configManager.config.theme).toBe('default'); // Should be restored to default
        });
    });

    describe('loadSavedConfig - third-party emote upgrade migration', () => {
        it('should grandfather third-party emotes off for configs saved before the feature shipped', () => {
            localStorage.setItem('chatConfig-default', JSON.stringify({ theme: 'dracula', fontSize: 18 }));

            configManager.loadSavedConfig('default');

            expect(configManager.config.thirdPartyEmotes).toBe(false);
            expect(configManager.config.configVersion).toBe(2);
            expect(configManager.pendingUpgradeNotice).toBe(true);

            // Migration must be persisted so it only ever runs once per scene
            const persisted = JSON.parse(localStorage.getItem('chatConfig-default'));
            expect(persisted.thirdPartyEmotes).toBe(false);
            expect(persisted.configVersion).toBe(2);

            // Unrelated customizations survive untouched
            expect(configManager.config.theme).toBe('dracula');
            expect(configManager.config.fontSize).toBe(18);
        });

        it('should not run the migration twice or re-announce the feature on reload', () => {
            localStorage.setItem('chatConfig-default', JSON.stringify({ theme: 'dracula' }));
            configManager.loadSavedConfig('default');

            const reloaded = new ConfigManager();
            reloaded.loadSavedConfig('default');

            expect(reloaded.config.thirdPartyEmotes).toBe(false);
            expect(reloaded.pendingUpgradeNotice).toBe(false);
        });

        it('should preserve an explicit third-party emote choice rather than clobbering it', () => {
            localStorage.setItem('chatConfig-default', JSON.stringify({ thirdPartyEmotes: true }));

            configManager.loadSavedConfig('default');

            expect(configManager.config.thirdPartyEmotes).toBe(true);
            expect(configManager.config.configVersion).toBe(2);
            expect(configManager.pendingUpgradeNotice).toBe(false);
        });

        it('should give brand new users third-party emotes on with protective 7TV filters', () => {
            configManager.loadSavedConfig('default');

            expect(configManager.config.thirdPartyEmotes).toBe(true);
            expect(configManager.config.thirdPartyFilter7tvTwitchDisallowed).toBe(true);
            expect(configManager.config.thirdPartyFilter7tvEpilepsy).toBe(true);

            // Filters the streamer owns as a taste call stay opt-in
            expect(configManager.config.thirdPartyFilter7tvSexual).toBe(false);
            expect(configManager.config.thirdPartyFilter7tvEdgy).toBe(false);

            expect(configManager.pendingUpgradeNotice).toBe(false);
        });

        it('should migrate configs with an older numeric configVersion (e.g. version 1)', () => {
            localStorage.setItem('chatConfig-default', JSON.stringify({ configVersion: 1, theme: 'pink' }));

            configManager.loadSavedConfig('default');

            expect(configManager.config.thirdPartyEmotes).toBe(false);
            expect(configManager.config.configVersion).toBe(2);
            expect(configManager.pendingUpgradeNotice).toBe(true);
        });
    });

    describe('saveConfig', () => {
        it('should correctly serialize updated configuration components to localStorage', () => {
            configManager.updateConfig('theme', 'matrix');
            configManager.updateConfig('chatMode', 'popup');
            
            configManager.saveConfig('my_custom_scene');

            const exportedJSON = localStorage.getItem('chatConfig-my_custom_scene');
            expect(exportedJSON).not.toBeNull();
            
            const parsedExport = JSON.parse(exportedJSON);
            expect(parsedExport.theme).toBe('matrix');
            expect(parsedExport.chatMode).toBe('popup');
        });
    });

    describe('applyChromaKey Unit Tests', () => {
        it('should stash preChromaKeyOpacity and set bgColor to #00b140 and opacity to 0 when enabled', () => {
            const config = { chromaKey: false, bgColor: '#121212', bgColorOpacity: 0.85 };
            applyChromaKey(config, true);

            expect(config.chromaKey).toBe(true);
            expect(config.preChromaKeyOpacity).toBe(0.85);
            expect(config.bgColor).toBe('#00b140');
            expect(config.bgColorOpacity).toBe(0);
        });

        it('should restore preChromaKeyOpacity when Chroma Key is disabled', () => {
            const config = { chromaKey: true, preChromaKeyOpacity: 0.85, bgColor: '#00b140', bgColorOpacity: 0 };
            applyChromaKey(config, false);

            expect(config.chromaKey).toBe(false);
            expect(config.bgColorOpacity).toBe(0.85);
        });
    });
});
