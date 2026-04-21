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

    it('should correctly format and render cached badges to HTML img nodes', () => {
        // Manually inject cache
        badgeManager.globalBadges = {
            data: { 'broadcaster': { '1': { imageUrl: 'http://broadcaster_url' } } }
        };
        badgeManager.channelBadges = {
            '123456': { data: { 'subscriber': { '12': { imageUrl: 'http://subscriber_url' } } } }
        };

        const tagString = 'broadcaster/1,subscriber/12,unknown/4';
        
        // Simulating the ID param, though in normal code it checks the caches directly
        const resultHTML = badgeManager.generateBadgeHTML(tagString, '123456');

        expect(resultHTML).toContain('src="http://broadcaster_url"');
        expect(resultHTML).toContain('src="http://subscriber_url"');
        // Unknown badge set shouldn't break the HTML or render invalid image tags
        expect(resultHTML).not.toContain('unknown/4');
    });

    it('should load channel badges asynchronously caching valid endpoints', async () => {
        await badgeManager.fetchChannelBadges('789');
        
        expect(global.fetch).toHaveBeenCalledOnce();
        
        // Assert the mapping successfully navigated the Twitch JSON schema
        expect(badgeManager.channelBadges['789'].data).toHaveProperty('subscriber');
        expect(badgeManager.channelBadges['789'].data['subscriber']['12'].imageUrl).toBe('http://sub_12_url');
    });
});
