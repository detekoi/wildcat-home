import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../config-manager.js';

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
});
