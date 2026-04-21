import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeManager } from '../theme-manager.js';

describe('ThemeManager - DOM State Hydration', () => {
    let themeManager;
    let mockConfigManager;
    let mockFontManager;

    beforeEach(() => {
        // Setup simple config manager mock and DOM
        mockConfigManager = {
            config: {},
            updateConfig: vi.fn((k, v) => { mockConfigManager.config[k] = v; }),
            applyConfiguration: vi.fn(),
            saveConfig: vi.fn(),
            on: vi.fn()
        };
        mockFontManager = {
            loadFonts: vi.fn(),
            applyFont: vi.fn(),
            addAndSelectGoogleFont: vi.fn(),
            getCurrentFontValue: vi.fn(() => 'Roboto'),
            updateFontDisplay: vi.fn()
        };

        // Window configuration structure expected by ThemeManager
        window.availableThemes = [
            { 
                value: 'default', 
                name: 'Default', 
                bgColor: '#444444', 
                bgColorOpacity: 0.8,
                borderRadius: '8px',
                fontFamily: 'Roboto',
                isGoogleFont: true,
                googleFontFamily: 'Roboto'
            },
            {
                value: 'neon',
                name: 'Cyber Neon',
                bgColor: '#ff00ff',
                bgColorOpacity: 1.0,
                borderColor: '#00ffff'
            }
        ];

        window.availableFonts = [
            { name: 'Roboto', value: "'Roboto', sans-serif" }
        ];

        themeManager = new ThemeManager({
            configManager: mockConfigManager,
            badgeManager: {},
            chatRenderer: {},
            fontManager: mockFontManager,
            domRefs: {
                themePreview: document.createElement('div'),
                chatWrapper: document.createElement('div')
            }
        });
    });

    describe('applyTheme', () => {
        it('should correctly extract values and inject them into Configuration Manager', () => {
            themeManager.applyTheme('neon');
            
            // Expected color properties logic mapping
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('theme', 'neon');
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('bgColor', '#ff00ff');
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('bgColorOpacity', 1.0);
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('borderColor', '#00ffff');
            
            // Verify application hooks fire correctly to synchronize DOM and persistance
            expect(mockConfigManager.applyConfiguration).toHaveBeenCalledOnce();
        });

        it('should gracefully fallback if a theme does not exist', () => {
            // Apply a corrupted theme name
            themeManager.applyTheme('themeThatWasDeletedFromRegistry');
            
            // We expect the fallback logic to find 'default' from window.availableThemes and apply that
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('theme', 'default');
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('bgColor', '#444444');
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('bgColorOpacity', 0.8);
        });

        it('should handle font pushing correctly when applying themes with fonts', () => {
            // Default theme has Roboto google font config
            themeManager.applyTheme('default');
            expect(mockConfigManager.updateConfig).toHaveBeenCalledWith('fontFamily', "'Roboto', sans-serif");
        });
    });
});
