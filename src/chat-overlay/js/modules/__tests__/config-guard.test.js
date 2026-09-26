import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ENDPOINTS,
    REMOVED_CONFIG_KEYS,
    safeImageUrl,
    cssImageValue,
    sanitizeConfig
} from '../config-guard.js';
import { ConfigManager } from '../config-manager.js';
import { BadgeManager } from '../badge-manager.js';

const BUCKET = 'https://storage.googleapis.com/chat-themer-backgrounds/';
const OWN_URL = `${BUCKET}backgrounds/0f8fad5b-d9cb-469f-a165-70867728950e.jpg`;
const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('safeImageUrl', () => {
    it('keeps raster data URLs and canonical URLs in our bucket', () => {
        expect(safeImageUrl(DATA_URL)).toBe(DATA_URL);
        expect(safeImageUrl('data:image/PNG;base64,iVBORw0KGgo=')).toBe('data:image/PNG;base64,iVBORw0KGgo=');
        expect(safeImageUrl(OWN_URL)).toBe(OWN_URL);
        expect(safeImageUrl(`${BUCKET}theme-backgrounds/abc/def.png`)).toBe(`${BUCKET}theme-backgrounds/abc/def.png`);
    });

    it('unwraps the legacy url("...") form', () => {
        expect(safeImageUrl(`url("${OWN_URL}")`)).toBe(OWN_URL);
        expect(safeImageUrl(`url(${DATA_URL})`)).toBe(DATA_URL);
    });

    it('rejects other hosts, other buckets, SVG and anything that could break out of url("")', () => {
        const rejected = [
            'https://evil.example/bg.png',
            'http://storage.googleapis.com/chat-themer-backgrounds/a.png',
            'https://storage.googleapis.com/chat-themer-backgrounds-evil/a.png',
            `${BUCKET}../other-bucket/a.png`,
            `${BUCKET}%2e%2e/other-bucket/a.png`,
            `${BUCKET}a.png?x=1`,
            `${BUCKET}a.png") , url("https://evil.example/x.png`,
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            `${DATA_URL}")`,
            'javascript:alert(1)',
            'none',
            '',
            null,
            42
        ];
        for (const value of rejected) {
            expect(safeImageUrl(value), String(value)).toBeNull();
        }
    });

    it('cssImageValue wraps allowed images and turns everything else into none', () => {
        expect(cssImageValue(OWN_URL)).toBe(`url("${OWN_URL}")`);
        expect(cssImageValue('https://evil.example/bg.png')).toBe('none');
        expect(cssImageValue(null)).toBe('none');
    });
});

describe('sanitizeConfig', () => {
    const defaults = new ConfigManager().getDefaultConfig();

    it('strips the removed endpoint keys', () => {
        const out = sanitizeConfig({
            badgeEndpointUrlGlobal: 'https://evil.example/g',
            badgeEndpointUrlChannel: 'https://evil.example/c',
            cheermoteEndpointUrl: 'https://evil.example/ch',
            showBadges: true
        }, defaults);
        expect(out).toEqual({ showBadges: true });
        for (const key of REMOVED_CONFIG_KEYS) {
            expect(defaults).not.toHaveProperty(key);
        }
    });

    it('drops external background images but leaves "no image" values untouched', () => {
        expect(sanitizeConfig({ bgImage: 'https://evil.example/bg.png' }).bgImage).toBeNull();
        expect(sanitizeConfig({ bgImage: OWN_URL }).bgImage).toBe(OWN_URL);
        expect(sanitizeConfig({ bgImage: 'none' }).bgImage).toBe('none');
        expect(sanitizeConfig({ bgImage: null }).bgImage).toBeNull();
    });

    it('accepts every value the UI and built-in themes produce', () => {
        const valid = {
            bgColor: 'rgba(0, 0, 0, 0)',
            borderColor: 'transparent',
            textColor: '#efeff1',
            usernameColor: '#00FFEA',
            timestampColor: 'rgba(255, 255, 255, 0.6)',
            pronounBadgeColor: 'timestamp',
            fontFamily: "'Atkinson Hyperlegible Next', sans-serif",
            googleFontFamily: 'Press Start 2P',
            fontWeight: '600',
            fontSize: 14,
            chatWidth: 95,
            chatHeight: 95,
            bgColorOpacity: 0.8,
            bgImageOpacity: 0.55,
            borderRadius: 'Subtle',
            boxShadow: 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px',
            textShadow: 'glow',
            theme: 'cyberpunk-theme',
            chatMode: 'popup'
        };
        expect(sanitizeConfig(valid, defaults)).toEqual(valid);
        expect(sanitizeConfig({ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"' }, defaults).fontFamily)
            .toBe('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"');
        expect(sanitizeConfig({ borderRadius: '16px', boxShadow: 'Simple 3D' }, defaults))
            .toEqual({ borderRadius: '16px', boxShadow: 'Simple 3D' });
    });

    it('falls back to defaults for malformed CSS-bound values', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const out = sanitizeConfig({
            textColor: 'red; background: url(https://evil.example/x.png)',
            borderColor: 'url(https://evil.example/x.png)',
            fontFamily: 'x"; } body { display: none',
            googleFontFamily: 'Roboto&family=Evil',
            fontWeight: 'heavy',
            fontSize: { px: 20 },
            borderRadius: '8px; color: red',
            boxShadow: 'url("https://evil.example/x.png")',
            textShadow: 7,
            theme: 'two classes',
            chatMode: 'fullscreen'
        }, defaults);
        expect(out).toEqual({
            textColor: defaults.textColor,
            borderColor: defaults.borderColor,
            fontFamily: defaults.fontFamily,
            googleFontFamily: null,
            fontWeight: defaults.fontWeight,
            fontSize: defaults.fontSize,
            borderRadius: defaults.borderRadius,
            boxShadow: defaults.boxShadow,
            textShadow: defaults.textShadow,
            theme: defaults.theme,
            chatMode: defaults.chatMode
        });
        vi.restoreAllMocks();
    });

    it('converts legacy numeric strings and leaves absent keys absent', () => {
        expect(sanitizeConfig({ fontSize: '20px', chatWidth: '90%', bgImageOpacity: '0.4' }, defaults))
            .toEqual({ fontSize: 20, chatWidth: 90, bgImageOpacity: 0.4 });
        expect(sanitizeConfig({}, defaults)).toEqual({});
    });
});

describe('ConfigManager.applyConfiguration with an untrusted config', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style');
        document.documentElement.className = '';
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('never puts an external image into the CSS and survives a bad theme class', () => {
        const manager = new ConfigManager();
        const cfg = {
            ...manager.getDefaultConfig(),
            bgImage: 'https://evil.example/bg.png',
            theme: 'a b',
            badgeEndpointUrlGlobal: 'https://evil.example/g'
        };

        expect(() => manager.applyConfiguration(cfg)).not.toThrow();

        const style = document.documentElement.style;
        expect(style.getPropertyValue('--chat-bg-image')).toBe('none');
        expect(style.getPropertyValue('--popup-bg-image')).toBe('none');
        // Sanitized in place: callers holding cfg see the same object as manager.config
        expect(manager.config).toBe(cfg);
        expect(cfg).not.toHaveProperty('badgeEndpointUrlGlobal');
    });

    it('still applies an image from our bucket', () => {
        const manager = new ConfigManager();
        manager.applyConfiguration({ ...manager.getDefaultConfig(), bgImage: OWN_URL });
        expect(document.documentElement.style.getPropertyValue('--chat-bg-image')).toBe(`url("${OWN_URL}")`);
    });
});

describe('BadgeManager endpoints', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('fetches our own endpoints even when a legacy config names others', async () => {
        const manager = new BadgeManager({
            showBadges: true,
            badgeEndpointUrlGlobal: 'https://evil.example/g',
            badgeEndpointUrlChannel: 'https://evil.example/c'
        });
        await manager.fetchGlobalBadges();
        await manager.fetchChannelBadges('123');

        const urls = fetch.mock.calls.map(([url]) => url);
        expect(urls).toEqual([
            ENDPOINTS.globalBadges,
            `${ENDPOINTS.channelBadges}?broadcaster_id=123`
        ]);
    });
});
