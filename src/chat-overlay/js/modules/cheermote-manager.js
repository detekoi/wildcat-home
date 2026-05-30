/**
 * Cheermote Manager Module
 * Handles fetching, caching, and parsing of Twitch cheermotes (animated bit emotes)
 */

export class CheermoteManager {
    constructor(config) {
        this.config = config;
        this.cheermoteData = null; // { prefix: { prefix, type, tiers: [...] } }
        this.cheermoteRegex = null; // Compiled regex from known prefixes
        this.prefixMap = null;     // Map<lowercasePrefix, cheermoteEntry> for O(1) lookup
        this.fetchPromises = new Map(); // Per-key dedup to avoid cross-contamination
    }

    /**
     * Fetch cheermote data from the proxy endpoint with localStorage caching
     * @param {string} [broadcasterId] - Optional broadcaster ID for channel-specific cheermotes
     */
    async fetchCheermotes(broadcasterId) {
        const endpointUrl = this.config.cheermoteEndpointUrl;
        if (!endpointUrl || endpointUrl.includes('YOUR_') || endpointUrl.includes('PLACEHOLDER')) {
            console.warn('Cheermote endpoint URL not configured.');
            return;
        }

        // Per-key dedup: global and channel fetches track independently
        const dedupKey = broadcasterId || '__global__';
        if (this.fetchPromises.has(dedupKey)) {
            return this.fetchPromises.get(dedupKey);
        }

        const promise = this._doFetch(broadcasterId).finally(() => {
            this.fetchPromises.delete(dedupKey);
        });

        this.fetchPromises.set(dedupKey, promise);
        return promise;
    }

    async _doFetch(broadcasterId) {
        const cacheKey = broadcasterId
            ? `twitchCheermotes_${broadcasterId}`
            : 'twitchCheermotesGlobal';
        // Use nullish coalescing to respect an explicit 0 (always-refresh intent)
        const cacheTTL = this.config.cheermoteCacheTTL ?? 12 * 60 * 60 * 1000; // 12 hours

        // Check localStorage cache
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (cacheTTL > 0 && Date.now() - timestamp < cacheTTL) {
                    console.log(`Using cached cheermotes for ${cacheKey}`);
                    this.cheermoteData = data;
                    this._buildRegex();
                    return;
                }
            }
        } catch (e) {
            console.error(`Error parsing cached cheermotes for ${cacheKey}:`, e);
            localStorage.removeItem(cacheKey);
        }

        // Fetch from proxy
        try {
            let url = this.config.cheermoteEndpointUrl;
            if (broadcasterId) {
                url += `?broadcaster_id=${encodeURIComponent(broadcasterId)}`;
            }

            console.log(`Fetching cheermotes from ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch cheermotes: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.cheermoteData = data;
            this._buildRegex();

            // Cache to localStorage
            localStorage.setItem(cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));

            console.log(`Cheermotes loaded: ${Object.keys(data).length} prefixes`);
        } catch (error) {
            console.error('Error fetching cheermotes:', error);
        }
    }

    /**
     * Build a combined regex and O(1) prefix lookup map from all known cheermote prefixes
     * Pattern: word-boundary, then any known prefix, then one or more digits
     */
    _buildRegex() {
        if (!this.cheermoteData || Object.keys(this.cheermoteData).length === 0) {
            this.cheermoteRegex = null;
            this.prefixMap = null;
            return;
        }

        // Build O(1) lowercase prefix map
        this.prefixMap = new Map();
        for (const key of Object.keys(this.cheermoteData)) {
            this.prefixMap.set(key.toLowerCase(), this.cheermoteData[key]);
        }

        // Sort prefixes by length descending to match longest first
        const prefixes = Object.keys(this.cheermoteData)
            .sort((a, b) => b.length - a.length)
            .map(p => this._escapeRegex(p));

        // Match cheermote tokens: prefix followed by digits, at word boundaries
        this.cheermoteRegex = new RegExp(
            `(?:^|(?<=\\s))(${prefixes.join('|')})(\\d+)(?=\\s|$)`,
            'gi'
        );
    }

    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Parse a message string to find cheermote tokens
     * Only call this when the IRC message has a `bits` tag
     * @param {string} message - The raw message text
     * @returns {Array<{start: number, end: number, prefix: string, bits: number, imageUrl: string, color: string, text: string}>}
     */
    parseCheermotes(message) {
        if (!this.cheermoteRegex || !this.cheermoteData) {
            return [];
        }

        const matches = [];
        // Reset regex lastIndex for global regex
        this.cheermoteRegex.lastIndex = 0;

        let match;
        while ((match = this.cheermoteRegex.exec(message)) !== null) {
            const prefix = match[1];
            const bits = parseInt(match[2], 10);
            const fullText = match[0]; // e.g. "Cheer100"

            // O(1) prefix lookup via pre-built Map
            const cheermoteEntry = this.prefixMap?.get(prefix.toLowerCase());
            if (!cheermoteEntry) continue;

            // Resolve the appropriate tier
            const tier = this._resolveTier(cheermoteEntry, bits);
            if (!tier) continue;

            // Get animated dark theme image URL (prefer 2x for quality/performance balance)
            const imageUrl = tier.images?.dark?.animated?.['2']
                || tier.images?.dark?.animated?.['1']
                || tier.images?.dark?.static?.['2']
                || tier.images?.dark?.static?.['1']
                || '';

            if (!imageUrl) continue;

            matches.push({
                start: match.index,
                end: match.index + fullText.length - 1,
                prefix: cheermoteEntry.prefix,
                bits,
                imageUrl,
                color: tier.color || '#979797',
                text: fullText
            });
        }

        return matches;
    }

    /**
     * Resolve the correct tier for a given bit amount
     * Defensively sorts tiers ascending by min_bits before resolving, in case the
     * source data (API, cache, or Firestore) arrives unsorted.
     */
    _resolveTier(cheermoteEntry, bits) {
        if (!Array.isArray(cheermoteEntry.tiers) || cheermoteEntry.tiers.length === 0) return null;

        // Defensive sort — tiers should already be sorted from the proxy transform,
        // but guard against corrupted localStorage or future API changes
        const sortedTiers = [...cheermoteEntry.tiers].sort((a, b) => a.min_bits - b.min_bits);

        let resolvedTier = sortedTiers[0]; // Default to lowest tier
        for (const tier of sortedTiers) {
            if (bits >= tier.min_bits) {
                resolvedTier = tier;
            } else {
                break;
            }
        }
        return resolvedTier;
    }
}
