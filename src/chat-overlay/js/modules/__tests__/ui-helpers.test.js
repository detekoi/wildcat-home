import { describe, it, expect } from 'vitest';
import { UIHelpers } from '../ui-helpers.js';

describe('UIHelpers', () => {
    describe('hexToRgba', () => {
        it('should correctly parse 6-digit hex values', () => {
            expect(UIHelpers.hexToRgba('#FF0000', 1.0)).toBe('rgba(255, 0, 0, 1.00)');
            expect(UIHelpers.hexToRgba('#00FF00', 0.5)).toBe('rgba(0, 255, 0, 0.50)');
        });

        it('should correctly parse 3-digit hex values', () => {
            expect(UIHelpers.hexToRgba('#FFF', 0.75)).toBe('rgba(255, 255, 255, 0.75)');
            expect(UIHelpers.hexToRgba('#000', 0)).toBe('rgba(0, 0, 0, 0.00)');
        });

        it('should clamp opacity bounds to 0-1', () => {
            expect(UIHelpers.hexToRgba('#123456', 5)).toBe('rgba(18, 52, 86, 1.00)');
            expect(UIHelpers.hexToRgba('#123456', -2)).toBe('rgba(18, 52, 86, 0.00)');
        });

        it('should return black if the hex is invalid formatting or not a string', () => {
            expect(UIHelpers.hexToRgba('notAColor', 1.0)).toBe('rgba(0, 0, 0, 1)');
            expect(UIHelpers.hexToRgba(null, 1.0)).toBe('rgba(0, 0, 0, 1)');
            expect(UIHelpers.hexToRgba('#12', 1.0)).toBe('rgba(0, 0, 0, 1)'); // Short hex
        });

        it('should return exactly what was passed in if the input is already an RGBA string', () => {
            expect(UIHelpers.hexToRgba('rgba(10, 20, 30, 0.5)', 0.9)).toBe('rgba(10, 20, 30, 0.5)');
        });
    });

    describe('parseColor', () => {
        it('should parse 6-digit hex colors', () => {
            expect(UIHelpers.parseColor('#ff0080')).toEqual({ hex: '#ff0080', opacity: 1.0 });
        });

        it('should parse 3-digit hex colors', () => {
            expect(UIHelpers.parseColor('#f08')).toEqual({ hex: '#ff0088', opacity: 1.0 });
        });

        it('should parse 4-digit hex colors with alpha', () => {
            expect(UIHelpers.parseColor('#f08f')).toEqual({ hex: '#ff0088', opacity: 1.0 });
        });

        it('should parse 8-digit hex colors with alpha', () => {
            expect(UIHelpers.parseColor('#ff008080')).toEqual({ hex: '#ff0080', opacity: 0.5 });
        });

        it('should parse rgba colors', () => {
            expect(UIHelpers.parseColor('rgba(255, 0, 128, 0.5)')).toEqual({ hex: '#ff0080', opacity: 0.5 });
        });

        it('should parse rgb colors', () => {
            expect(UIHelpers.parseColor('rgb(255, 0, 128)')).toEqual({ hex: '#ff0080', opacity: 1.0 });
        });

        it('should clamp out-of-range rgb channel values', () => {
            expect(UIHelpers.parseColor('rgb(300, -10, 128)')).toEqual({ hex: '#ff0080', opacity: 1.0 });
        });

        it('should fall back gracefully on invalid string input', () => {
            expect(UIHelpers.parseColor('invalidColor')).toEqual({ hex: '#121212', opacity: 0.85 });
            expect(UIHelpers.parseColor(null)).toEqual({ hex: '#121212', opacity: 0.85 });
        });
    });

    describe('generateColorFromName', () => {
        it('should return a deterministic HSL color for the same given name', () => {
            const color1 = UIHelpers.generateColorFromName('wildcatecosystem');
            const color2 = UIHelpers.generateColorFromName('wildcatecosystem');
            expect(color1).toBe(color2);
            expect(color1).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
        });

        it('should yield different colors for different names', () => {
            const color1 = UIHelpers.generateColorFromName('user_a');
            const color2 = UIHelpers.generateColorFromName('user_b');
            expect(color1).not.toBe(color2);
        });
    });

    describe('Style Mapping Helpers', () => {
        it('should return accurate preset values for borders and shadow mapping', () => {
            expect(UIHelpers.getBorderRadiusValue('Rounded')).toBe('16px');
            expect(UIHelpers.getBorderRadiusValue('None')).toBe('0px');
            expect(UIHelpers.getBoxShadowValue('intense 3d')).toContain('0px 10px 20px');
            expect(UIHelpers.getTextShadowValue('sharp')).toBe('1px 1px 0 rgba(0,0,0,0.9)');
        });

        it('should default graciously gracefully on unknown values', () => {
            expect(UIHelpers.getBorderRadiusValue('Gibberish')).toBe('8px');
            expect(UIHelpers.getBoxShadowValue('Gibberish')).toBe('none');
            expect(UIHelpers.getTextShadowValue(null)).toBe('none');
        });

        it('should respect direct pixel overrides rather than presets', () => {
            expect(UIHelpers.getBorderRadiusValue('42px')).toBe('42px');
        });
    });

    describe('showNotification', () => {
        it('should create a toast notification element with correct structure and class', () => {
            const toast = UIHelpers.showNotification('Saved & Synced', 'Settings updated live', 'success', 0);
            expect(toast).not.toBeNull();
            expect(toast.className).toContain('toast-notification');
            expect(toast.className).toContain('toast-success');
            expect(toast.querySelector('.toast-title').textContent).toBe('Saved & Synced');
            expect(toast.querySelector('.toast-message').textContent).toBe('Settings updated live');

            const container = document.getElementById('toast-container');
            expect(container).not.toBeNull();
            expect(container.contains(toast)).toBe(true);
        });

        it('should handle dismissal via close button', () => {
            const toast = UIHelpers.showNotification('Test Error', 'Something failed', 'error', 0);
            const closeBtn = toast.querySelector('.toast-close');
            expect(closeBtn).not.toBeNull();
            closeBtn.click();
            expect(toast.classList.contains('toast-hiding')).toBe(true);
        });
    });

    describe('generateUUID', () => {
        // Sync and theme-library tokens go straight into proxy URLs, and the
        // validateToken middleware 400s anything that isn't UUID-shaped — so the
        // shape has to hold on every fallback path, not just under crypto.randomUUID.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        it('returns a UUID when crypto.randomUUID is available', () => {
            expect(UIHelpers.generateUUID()).toMatch(UUID_RE);
        });

        it('still returns a well-formed v4 UUID on the getRandomValues fallback', () => {
            const original = globalThis.crypto.randomUUID;
            Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });

            try {
                const uuid = UIHelpers.generateUUID();
                expect(uuid).toMatch(UUID_RE);
                expect(uuid[14]).toBe('4');                       // version nibble
                expect(['8', '9', 'a', 'b']).toContain(uuid[19]); // variant nibble
            } finally {
                Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
            }
        });

        it('does not collide across many calls', () => {
            const ids = new Set(Array.from({ length: 500 }, () => UIHelpers.generateUUID()));
            expect(ids.size).toBe(500);
        });
    });

    describe('normalizeSyncToken', () => {
        const uuid = '3f2a1b4c-5d6e-4f70-8091-a2b3c4d5e6f7';

        it('passes a bare UUID through, lowercased', () => {
            expect(UIHelpers.normalizeSyncToken(uuid)).toBe(uuid);
            expect(UIHelpers.normalizeSyncToken(uuid.toUpperCase())).toBe(uuid);
        });

        it('strips a legacy sync- prefix', () => {
            expect(UIHelpers.normalizeSyncToken(`sync-${uuid}`)).toBe(uuid);
        });

        it('trims surrounding whitespace from a pasted token', () => {
            expect(UIHelpers.normalizeSyncToken(`  ${uuid}  `)).toBe(uuid);
        });

        it('rejects anything that is not UUID-shaped rather than returning a doomed token', () => {
            expect(UIHelpers.normalizeSyncToken('sync-1712345678_ab12cd')).toBeNull();
            expect(UIHelpers.normalizeSyncToken('brand-new-token')).toBeNull();
            expect(UIHelpers.normalizeSyncToken('')).toBeNull();
            expect(UIHelpers.normalizeSyncToken(null)).toBeNull();
            expect(UIHelpers.normalizeSyncToken(undefined)).toBeNull();
            expect(UIHelpers.normalizeSyncToken(12345)).toBeNull();
        });
    });
});

