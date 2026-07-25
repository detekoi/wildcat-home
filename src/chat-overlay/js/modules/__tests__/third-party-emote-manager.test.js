import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThirdPartyEmoteManager } from '../third-party-emote-manager.js';

describe('ThirdPartyEmoteManager', () => {
    let manager;
    let mockConfig;

    beforeEach(() => {
        localStorage.clear();
        mockConfig = {
            thirdPartyEmoteCacheGlobalTTL: 12 * 60 * 60 * 1000,
            thirdPartyEmoteCacheChannelTTL: 60 * 60 * 1000
        };
        manager = new ThirdPartyEmoteManager(mockConfig);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('transformPayload & Zero-Width Flags', () => {
        it('transforms BTTV payload and extracts hardcoded zero-width flags', () => {
            const bttvJson = [
                { id: 'bttv1', code: 'catJAM' },
                { id: 'bttv2', code: 'cvHazmat' }
            ];
            const result = manager._transformPayload('bttv', bttvJson);

            expect(result.catJAM).toEqual({
                u: 'https://cdn.betterttv.net/emote/bttv1/3x.webp',
                z: false
            });
            expect(result.cvHazmat).toEqual({
                u: 'https://cdn.betterttv.net/emote/bttv2/3x.webp',
                z: true
            });
        });

        it('transforms FFZ payload preferring animated URLs over static URLs and skipping modifier === true entries', () => {
            const ffzJson = {
                sets: {
                    123: {
                        emoticons: [
                            {
                                name: 'AnimatedFFZ',
                                animated: { '2': '//cdn.frankerfacez.com/animated/2' },
                                urls: { '2': '//cdn.frankerfacez.com/static/2' }
                            },
                            {
                                name: 'StaticFFZ',
                                urls: { '1': '//cdn.frankerfacez.com/static/1' }
                            },
                            { name: 'HiddenMod', modifier: true, urls: { '2': '//cdn.frankerfacez.com/emoticon/2/2' } }
                        ]
                    }
                }
            };
            const result = manager._transformPayload('ffz', ffzJson);

            expect(result.AnimatedFFZ).toEqual({
                u: 'https://cdn.frankerfacez.com/animated/2',
                z: false
            });
            expect(result.StaticFFZ).toEqual({
                u: 'https://cdn.frankerfacez.com/static/1',
                z: false
            });
            expect(result.HiddenMod).toBeUndefined();
        });

        it('transforms 7TV payload checking both item.flags & 1 and item.data.flags & (1 << 8)', () => {
            const seventvJson = {
                emotes: [
                    { name: 'Normal7TV', flags: 0, data: { host: { url: '//cdn.7tv.app/emote/1' } } },
                    { name: 'Zero7TV_Flag1', flags: 1, data: { host: { url: '//cdn.7tv.app/emote/2' } } },
                    { name: 'Zero7TV_DataFlag256', flags: 0, data: { flags: 256, host: { url: '//cdn.7tv.app/emote/3' } } }
                ]
            };
            const result = manager._transformPayload('seventv', seventvJson);

            expect(result.Normal7TV.z).toBe(false);
            expect(result.Zero7TV_Flag1.z).toBe(true);
            expect(result.Zero7TV_DataFlag256.z).toBe(true);
            expect(result.Normal7TV.u).toBe('https://cdn.7tv.app/emote/1/3x.webp');
        });

        it('drops emotes failing the host allowlist', () => {
            const bttvEvil = [{ id: 'evil_id', code: 'evil' }];
            // Intercept transform URL host checking
            vi.spyOn(manager, '_isHostAllowed').mockImplementation(url => !url.includes('evil'));
            const result = manager._transformPayload('bttv', bttvEvil);
            expect(result.evil).toBeUndefined();
        });
    });

    describe('Precedence & Overwrites', () => {
        it('applies FFZ < BTTV < 7TV order globally and channel over global', () => {
            manager.globalSets.ffz.set('EmoteX', { u: 'ffz-global', z: false });
            manager.globalSets.bttv.set('EmoteX', { u: 'bttv-global', z: false });
            manager.globalSets.seventv.set('EmoteX', { u: '7tv-global', z: false });

            manager.channelSets.ffz.set('EmoteX', { u: 'ffz-channel', z: false });

            manager._rebuildCombined();

            // Channel FFZ should beat all Globals (even 7TV global)
            expect(manager.combinedEmoteMap.get('EmoteX').u).toBe('ffz-channel');

            // Add 7TV channel set
            manager.channelSets.seventv.set('EmoteX', { u: '7tv-channel', z: true });
            manager._rebuildCombined();

            // 7TV channel beats FFZ channel
            expect(manager.combinedEmoteMap.get('EmoteX').u).toBe('7tv-channel');
            expect(manager.combinedEmoteMap.get('EmoteX').z).toBe(true);
        });
    });

    describe('API Fetching & Error Handling', () => {
        it('caches empty set on 404 response without throwing', async () => {
            const fetchMock = vi.fn().mockImplementation(url => {
                if (url.includes('users/twitch/nonexistent')) {
                    return Promise.resolve(new Response(null, { status: 404 }));
                }
                return Promise.resolve(new Response('[]', { status: 200 }));
            });
            vi.stubGlobal('fetch', fetchMock);

            await expect(manager.fetchChannelEmotes('nonexistent')).resolves.not.toThrow();

            const cached = localStorage.getItem('thirdPartyEmotes_bttv_nonexistent');
            expect(cached).not.toBeNull();
            expect(JSON.parse(cached).data).toEqual({});
        });

        it('does not crash global fetch if one provider fails (Promise.allSettled)', async () => {
            const fetchMock = vi.fn().mockImplementation(url => {
                if (url.includes('betterttv')) {
                    return Promise.reject(new Error('Network error'));
                }
                if (url.includes('frankerfacez')) {
                    return Promise.resolve(new Response(JSON.stringify({
                        sets: { 1: { emoticons: [{ name: 'FFZ1', urls: { '1': '//cdn.frankerfacez.com/1' } }] } }
                    }), { status: 200 }));
                }
                return Promise.resolve(new Response(JSON.stringify({ emotes: [] }), { status: 200 }));
            });
            vi.stubGlobal('fetch', fetchMock);

            await manager.fetchGlobalEmotes();

            expect(manager.combinedEmoteMap.has('FFZ1')).toBe(true);
        });

        it('clears old channel emotes immediately when switching channels', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));

            manager.channelSets.bttv.set('OldChannelEmote', { u: 'url', z: false });
            manager.channelBroadcasterId = '111';
            manager._rebuildCombined();
            expect(manager.combinedEmoteMap.has('OldChannelEmote')).toBe(true);

            // Fetch for new channel ID '222'
            await manager.fetchChannelEmotes('222');

            expect(manager.combinedEmoteMap.has('OldChannelEmote')).toBe(false);
            expect(manager.channelBroadcasterId).toBe('222');
        });

        it('discards stale fetch results if broadcasterId changed while fetch was in flight', () => {
            manager.channelBroadcasterId = '222'; // switched to channel 222
            const result = manager._storeProviderMap('bttv', '111', new Map([['StaleEmote', { u: 'url', z: false }]]));
            expect(result).toBe(false);
            expect(manager.channelSets.bttv.has('StaleEmote')).toBe(false);
        });
    });

    describe('parseThirdPartyEmotes', () => {
        beforeEach(() => {
            manager.combinedEmoteMap.set('catJAM', { u: 'https://cdn.betterttv.net/catjam.webp', z: false });
            manager.combinedEmoteMap.set('cvHazmat', { u: 'https://cdn.betterttv.net/hazmat.webp', z: true });
        });

        it('parses valid whole tokens', () => {
            const msg = 'Look at catJAM and cvHazmat dancing';
            const matches = manager.parseThirdPartyEmotes(msg, []);

            expect(matches).toHaveLength(2);
            expect(matches[0]).toEqual({
                start: 8,
                end: 13,
                code: 'catJAM',
                imageUrl: 'https://cdn.betterttv.net/catjam.webp',
                zeroWidth: false
            });
            expect(matches[1]).toEqual({
                start: 19,
                end: 26,
                code: 'cvHazmat',
                imageUrl: 'https://cdn.betterttv.net/hazmat.webp',
                zeroWidth: true
            });
        });

        it('skips occupied ranges (native Twitch emote positions)', () => {
            const msg = 'catJAM catJAM';
            // First catJAM is occupied by a native Twitch emote at indices 0-5
            const occupied = [{ start: 0, end: 5 }];

            const matches = manager.parseThirdPartyEmotes(msg, occupied);
            expect(matches).toHaveLength(1);
            expect(matches[0].start).toBe(7);
        });

        it('performs case-sensitive whole-token matching', () => {
            const msg = 'catjam noncatJAMcatJAM';
            const matches = manager.parseThirdPartyEmotes(msg, []);

            expect(matches).toHaveLength(0);
        });
    });

    describe('localStorage Cache & Host Security Validation', () => {
        it('validates cached entries against host allowlist and shape when loading from cache', async () => {
            const cacheKey = 'thirdPartyEmotes_bttv_global';
            const cacheData = {
                timestamp: Date.now(),
                data: {
                    ValidEmote: { u: 'https://cdn.betterttv.net/emote/valid/3x.webp', z: false },
                    EvilEmote: { u: 'https://attacker.com/evil.png', z: false },
                    BadShape1: { u: 12345, z: false },
                    BadShape2: { u: 'https://cdn.betterttv.net/emote/bad/3x.webp', z: 'not-bool' }
                }
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));

            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);

            await manager._doFetchOne('bttv', null);

            // Fetch should NOT be called because cache hit
            expect(fetchSpy).not.toHaveBeenCalled();

            // Valid emote loaded, evil/malformed entries filtered out
            expect(manager.globalSets.bttv.has('ValidEmote')).toBe(true);
            expect(manager.globalSets.bttv.has('EvilEmote')).toBe(false);
            expect(manager.globalSets.bttv.has('BadShape1')).toBe(false);
            expect(manager.globalSets.bttv.has('BadShape2')).toBe(false);
        });

        it('triggers fresh network fetch when cached entry is expired', async () => {
            const cacheKey = 'thirdPartyEmotes_bttv_global';
            const expiredData = {
                timestamp: Date.now() - (13 * 60 * 60 * 1000), // 13 hours ago (TTL is 12 hours)
                data: { OldEmote: { u: 'https://cdn.betterttv.net/emote/old/3x.webp', z: false } }
            };
            localStorage.setItem(cacheKey, JSON.stringify(expiredData));

            const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'new', code: 'NewEmote' }]), { status: 200 }));
            vi.stubGlobal('fetch', fetchMock);

            await manager._doFetchOne('bttv', null);

            expect(fetchMock).toHaveBeenCalled();
            expect(manager.globalSets.bttv.has('NewEmote')).toBe(true);
        });

        it('handles corrupted JSON in localStorage gracefully by attempting fresh fetch', async () => {
            const cacheKey = 'thirdPartyEmotes_bttv_global';
            localStorage.setItem(cacheKey, '{corrupted-json-data');

            const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'fresh', code: 'FreshEmote' }]), { status: 200 }));
            vi.stubGlobal('fetch', fetchMock);

            await manager._doFetchOne('bttv', null);

            expect(fetchMock).toHaveBeenCalled();
            expect(manager.globalSets.bttv.has('FreshEmote')).toBe(true);
        });
    });

    describe('Content Safety Filters', () => {
        const CONTENT_SEXUAL = 1 << 16;
        const CONTENT_EDGY = 1 << 18;
        const CONTENT_TWITCH_DISALLOWED = 1 << 24;

        it('filters 7TV emote with CONTENT_TWITCH_DISALLOWED when config is true', () => {
            manager.config = { thirdPartyFilter7tvTwitchDisallowed: true };
            const payload = {
                emotes: [
                    { name: 'DisallowedEmote', data: { host: { url: '//cdn.7tv.app/emote/1' }, flags: CONTENT_TWITCH_DISALLOWED } },
                    { name: 'SafeEmote', data: { host: { url: '//cdn.7tv.app/emote/2' }, flags: 0 } }
                ]
            };
            const result = manager._transformPayload('seventv', payload);
            expect(result).not.toHaveProperty('DisallowedEmote');
            expect(result).toHaveProperty('SafeEmote');
        });

        it('passes 7TV emote with CONTENT_SEXUAL flag when filter is false', () => {
            manager.config = { thirdPartyFilter7tvSexual: false };
            const payload = {
                emotes: [
                    { name: 'SexualEmote', data: { host: { url: '//cdn.7tv.app/emote/1' }, flags: CONTENT_SEXUAL } }
                ]
            };
            const result = manager._transformPayload('seventv', payload);
            expect(result).toHaveProperty('SexualEmote');
        });

        it('filters 7TV emote with CONTENT_SEXUAL flag when filter is true', () => {
            manager.config = { thirdPartyFilter7tvSexual: true };
            const payload = {
                emotes: [
                    { name: 'SexualEmote', data: { host: { url: '//cdn.7tv.app/emote/1' }, flags: CONTENT_SEXUAL } }
                ]
            };
            const result = manager._transformPayload('seventv', payload);
            expect(result).not.toHaveProperty('SexualEmote');
        });

        it('filters emote with multiple flags if at least one filter is enabled', () => {
            manager.config = { thirdPartyFilter7tvSexual: false, thirdPartyFilter7tvEdgy: true };
            const payload = {
                emotes: [
                    { name: 'MultiFlagEmote', data: { host: { url: '//cdn.7tv.app/emote/1' }, flags: CONTENT_SEXUAL | CONTENT_EDGY } }
                ]
            };
            const result = manager._transformPayload('seventv', payload);
            expect(result).not.toHaveProperty('MultiFlagEmote');
        });

        it('fetchChannelEmotes is a no-op when thirdPartyChannelEmotes is false', async () => {
            manager.config = { thirdPartyChannelEmotes: false };
            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);
            
            manager.channelSets.bttv.set('OldEmote', { u: 'url', z: false });
            
            await manager.fetchChannelEmotes('123');
            
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(manager.channelSets.bttv.size).toBe(0); // Should be cleared
        });
    });
});
