/**
 * Third-Party Emote Manager Module
 * Handles fetching, caching, precedence, and parsing of BTTV, FFZ, and 7TV emotes
 */

const ALLOWED_CDN_HOSTS = new Set([
    'cdn.betterttv.net',
    'cdn.frankerfacez.com',
    'cdn.7tv.app'
]);

const BTTV_ZERO_WIDTH_SET = new Set([
    'SoSnowy', 'IceCold', 'SantaHat', 'TopHat',
    'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat'
]);

export class ThirdPartyEmoteManager {
    constructor(config) {
        this.config = config || {};
        this.globalSets = { bttv: new Map(), ffz: new Map(), seventv: new Map() };
        this.channelSets = { bttv: new Map(), ffz: new Map(), seventv: new Map() };
        this.channelBroadcasterId = null;
        this.combinedEmoteMap = new Map();
        this.fetchPromises = new Map();
    }

    /**
     * Check if a URL uses an allowed CDN domain
     */
    _isHostAllowed(rawUrl) {
        if (!rawUrl) return false;
        try {
            const urlString = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
            const parsed = new URL(urlString);
            return ALLOWED_CDN_HOSTS.has(parsed.hostname);
        } catch (e) {
            return false;
        }
    }

    /**
     * Rebuild the unified O(1) emote lookup map following precedence:
     * Global: FFZ -> BTTV -> 7TV
     * Channel: FFZ -> BTTV -> 7TV (overwrites global)
     */
    _rebuildCombined() {
        const newMap = new Map();

        const addSet = (providerMap) => {
            for (const [code, data] of providerMap) {
                newMap.set(code, data);
            }
        };

        // Global scope precedence
        addSet(this.globalSets.ffz);
        addSet(this.globalSets.bttv);
        addSet(this.globalSets.seventv);

        // Channel scope precedence (overwrites global)
        addSet(this.channelSets.ffz);
        addSet(this.channelSets.bttv);
        addSet(this.channelSets.seventv);

        this.combinedEmoteMap = newMap;
    }

    /**
     * Fetch global emotes from BTTV, FFZ, and 7TV using Promise.allSettled
     */
    async fetchGlobalEmotes() {
        const providers = ['bttv', 'ffz', 'seventv'];
        await Promise.allSettled(providers.map(p => this._fetchOne(p, null)));
    }

    /**
     * Fetch channel emotes from BTTV, FFZ, and 7TV using Promise.allSettled
     * @param {string} broadcasterId
     */
    async fetchChannelEmotes(broadcasterId) {
        if (!broadcasterId) return;

        if (broadcasterId !== this.channelBroadcasterId) {
            this.clearChannelEmotes();
            this.channelBroadcasterId = broadcasterId;
        }

        const providers = ['bttv', 'ffz', 'seventv'];
        await Promise.allSettled(providers.map(p => this._fetchOne(p, broadcasterId)));
    }

    /**
     * Clear channel emote state and rebuild combined map
     */
    clearChannelEmotes() {
        this.channelSets = { bttv: new Map(), ffz: new Map(), seventv: new Map() };
        this.channelBroadcasterId = null;
        this._rebuildCombined();
    }

    /**
     * Internal handler to fetch, transform, and cache emotes for a single provider/scope
     */
    async _fetchOne(provider, broadcasterId = null) {
        const dedupKey = `${provider}:${broadcasterId || '__global__'}`;

        if (this.fetchPromises.has(dedupKey)) {
            return this.fetchPromises.get(dedupKey);
        }

        const promise = this._doFetchOne(provider, broadcasterId).finally(() => {
            this.fetchPromises.delete(dedupKey);
        });

        this.fetchPromises.set(dedupKey, promise);
        return promise;
    }

    async _doFetchOne(provider, broadcasterId) {
        const isChannel = Boolean(broadcasterId);
        const cacheKey = `thirdPartyEmotes_${provider}_${broadcasterId || 'global'}`;
        const defaultTTL = isChannel ? (1 * 60 * 60 * 1000) : (12 * 60 * 60 * 1000);
        const configTTL = isChannel
            ? this.config.thirdPartyEmoteCacheChannelTTL
            : this.config.thirdPartyEmoteCacheGlobalTTL;
        const cacheTTL = configTTL ?? defaultTTL;

        // Check localStorage cache
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (cacheTTL > 0 && Date.now() - timestamp < cacheTTL) {
                    const emoteMap = new Map();
                    if (data && typeof data === 'object') {
                        for (const [code, entry] of Object.entries(data)) {
                            if (entry && typeof entry.u === 'string' && typeof entry.z === 'boolean' && this._isHostAllowed(entry.u)) {
                                emoteMap.set(code, entry);
                            }
                        }
                    }
                    if (this._storeProviderMap(provider, broadcasterId, emoteMap)) {
                        this._rebuildCombined();
                    }
                    return;
                }
            }
        } catch (e) {
            console.error(`Error parsing cached third-party emotes for ${cacheKey}:`, e);
            try { localStorage.removeItem(cacheKey); } catch (ignore) {}
        }

        // Fetch network resource
        const url = this._getEndpointUrl(provider, broadcasterId);
        if (!url) return;

        try {
            const response = await fetch(url);
            if (response.status === 404) {
                // Channel not registered -> cache empty set cleanly
                const emptyData = {};
                if (this._storeProviderMap(provider, broadcasterId, new Map())) {
                    this._rebuildCombined();
                }
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({ data: emptyData, timestamp: Date.now() }));
                } catch (e) {}
                return;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch ${provider} emotes: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            const transformedData = this._transformPayload(provider, json);
            const emoteMap = new Map(Object.entries(transformedData));

            if (this._storeProviderMap(provider, broadcasterId, emoteMap)) {
                this._rebuildCombined();
            }

            try {
                localStorage.setItem(cacheKey, JSON.stringify({ data: transformedData, timestamp: Date.now() }));
            } catch (e) {
                console.error(`Error saving third-party emote cache for ${cacheKey}:`, e);
            }
        } catch (error) {
            console.warn(`Error fetching ${provider} emotes (${broadcasterId || 'global'}):`, error);
            throw error;
        }
    }

    _storeProviderMap(provider, broadcasterId, map) {
        if (broadcasterId) {
            if (broadcasterId !== this.channelBroadcasterId) {
                return false;
            }
            this.channelSets[provider] = map;
            return true;
        } else {
            this.globalSets[provider] = map;
            return true;
        }
    }

    _getEndpointUrl(provider, broadcasterId) {
        if (provider === 'bttv') {
            return broadcasterId
                ? `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(broadcasterId)}`
                : 'https://api.betterttv.net/3/cached/emotes/global';
        }
        if (provider === 'ffz') {
            return broadcasterId
                ? `https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(broadcasterId)}`
                : 'https://api.frankerfacez.com/v1/set/global';
        }
        if (provider === 'seventv') {
            return broadcasterId
                ? `https://7tv.io/v3/users/twitch/${encodeURIComponent(broadcasterId)}`
                : 'https://7tv.io/v3/emote-sets/global';
        }
        return null;
    }

    _transformPayload(provider, json) {
        const result = {};

        if (!json) return result;

        if (provider === 'bttv') {
            const emoteList = Array.isArray(json)
                ? json
                : [...(json.channelEmotes || []), ...(json.sharedEmotes || [])];

            for (const item of emoteList) {
                if (!item?.id || !item?.code) continue;
                const url = `https://cdn.betterttv.net/emote/${item.id}/3x.webp`;
                if (!this._isHostAllowed(url)) continue;

                const zeroWidth = BTTV_ZERO_WIDTH_SET.has(item.code);
                result[item.code] = { u: url, z: zeroWidth };
            }
        } else if (provider === 'ffz') {
            const sets = json.sets || {};
            for (const setId in sets) {
                const emoticons = sets[setId]?.emoticons;
                if (!Array.isArray(emoticons)) continue;

                for (const item of emoticons) {
                    if (!item?.name || item.modifier === true) continue;
                    const animatedUrls = item.animated || {};
                    const staticUrls = item.urls || {};
                    let rawUrl = animatedUrls['2'] || animatedUrls['4'] || animatedUrls['1']
                        || staticUrls['2'] || staticUrls['4'] || staticUrls['1'] || '';
                    if (!rawUrl) continue;
                    if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;

                    if (!this._isHostAllowed(rawUrl)) continue;
                    result[item.name] = { u: rawUrl, z: false };
                }
            }
        } else if (provider === 'seventv') {
            const emoteList = Array.isArray(json.emotes)
                ? json.emotes
                : (json.emote_set?.emotes || []);

            for (const item of emoteList) {
                if (!item?.name || !item?.data?.host?.url) continue;
                const hostUrl = item.data.host.url;
                const fullUrl = `https:${hostUrl}/3x.webp`;
                if (!this._isHostAllowed(fullUrl)) continue;

                const isZero1 = (item.flags & 1) !== 0;
                const isZero2 = (item.data?.flags & (1 << 8)) !== 0;
                const zeroWidth = isZero1 || isZero2;

                result[item.name] = { u: fullUrl, z: zeroWidth };
            }
        }

        return result;
    }

    /**
     * Parse message text for third-party emotes, skipping occupied ranges
     * @param {string} message - Raw message text
     * @param {Array<{start: number, end: number}>} occupiedRanges - Inclusive start/end character ranges
     * @returns {Array<{start: number, end: number, code: string, imageUrl: string, zeroWidth: boolean}>}
     */
    parseThirdPartyEmotes(message, occupiedRanges = []) {
        if (!message || this.combinedEmoteMap.size === 0) return [];

        const matches = [];
        const tokenRegex = /(\S+)/g;
        let match;

        while ((match = tokenRegex.exec(message)) !== null) {
            const code = match[1];
            const start = match.index;
            const end = start + code.length - 1;

            // Skip if overlapping any occupied range (inclusive overlap check)
            const isOccupied = occupiedRanges.some(range =>
                start <= range.end && end >= range.start
            );
            if (isOccupied) continue;

            const emoteEntry = this.combinedEmoteMap.get(code);
            if (emoteEntry) {
                matches.push({
                    start,
                    end,
                    code,
                    imageUrl: emoteEntry.u,
                    zeroWidth: emoteEntry.z
                });
            }
        }

        return matches;
    }
}
