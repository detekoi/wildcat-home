import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadgeManager } from '../badge-manager.js';

describe('BadgeManager - Display Engine', () => {
    let badgeManager;

    beforeEach(() => {
        badgeManager = new BadgeManager({ showBadges: true, badgeEndpointUrlChannel: 'http://mock' });
        vi.stubGlobal('fetch', vi.fn(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    'subscriber': { '12': { imageUrl: 'http://sub_12_url' } }
                })
            })
        ));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should build badge img nodes from cached badge data', () => {
        // Manually inject cache
        badgeManager.globalBadges = {
            data: { 'broadcaster': { '1': { imageUrl: 'http://broadcaster_url' } } }
        };
        badgeManager.channelBadges = {
            '123456': { data: { 'subscriber': { '12': { imageUrl: 'http://subscriber_url' } } } }
        };

        const tagString = 'broadcaster/1,subscriber/12,unknown/4';

        const el = badgeManager.createBadgeElement(tagString, '123456');

        expect(el).toBeInstanceOf(HTMLElement);
        expect(el.className).toBe('badges');
        const imgs = el.querySelectorAll('img.chat-badge');
        // Unknown badge set is skipped rather than rendered as a broken image
        expect(Array.from(imgs, img => img.getAttribute('src'))).toEqual(['http://broadcaster_url', 'http://subscriber_url']);
    });

    it('should keep the resolution fallback handler on each badge image', () => {
        badgeManager.globalBadges = {
            data: { 'moderator': { '1': { imageUrl: 'http://mod_1x', imageUrl2x: 'http://mod_2x', imageUrl4x: 'http://mod_4x' } } }
        };

        const img = badgeManager.createBadgeElement('moderator/1', null).querySelector('img');

        expect(img.getAttribute('src')).toBe('http://mod_4x');
        img.onerror();
        expect(img.getAttribute('src')).toBe('http://mod_2x');
        img.onerror();
        expect(img.getAttribute('src')).toBe('http://mod_1x');
    });

    it('should return null when no badges resolve or badges are disabled', () => {
        expect(badgeManager.createBadgeElement('unknown/4', null)).toBeNull();
        expect(badgeManager.createBadgeElement('', null)).toBeNull();

        badgeManager.config.showBadges = false;
        badgeManager.globalBadges = { data: { 'broadcaster': { '1': { imageUrl: 'http://broadcaster_url' } } } };
        expect(badgeManager.createBadgeElement('broadcaster/1', null)).toBeNull();
    });

    it('should load channel badges asynchronously caching valid endpoints', async () => {
        await badgeManager.fetchChannelBadges('789');
        
        expect(global.fetch).toHaveBeenCalledOnce();
        
        // Assert the mapping successfully navigated the Twitch JSON schema
        expect(badgeManager.channelBadges['789'].data).toHaveProperty('subscriber');
        expect(badgeManager.channelBadges['789'].data['subscriber']['12'].imageUrl).toBe('http://sub_12_url');
    });
});
