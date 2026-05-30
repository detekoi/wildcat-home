/**
 * Cheermote Manager Module
 * Handles fetching, caching, and parsing of Twitch cheermotes (animated bit emotes)
 */

export class CheermoteManager {
    constructor(config) {
        this.config = config;
        this.cheermoteData = null; // { prefix: { prefix, type, tiers: [...] } }
        this.cheermoteRegex = null; // Compiled regex from known prefixes
        this.fetchPromise = null;  // Prevent duplicate fetches
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

        // Prevent duplicate fetches
        if (this.fetchPromise) {
            return this.fetchPromise;
        }

        this.fetchPromise = this._doFetch(broadcasterId).finally(() => {
            this.fetchPromise = null;
        });

        return this.fetchPromise;
    }

    async _doFetch(broadcasterId) {
        const cacheKey = broadcasterId
            ? `twitchCheermotes_${broadcasterId}`
            : 'twitchCheermotesGlobal';
        const cacheTTL = this.config.cheermoteCacheTTL || 12 * 60 * 60 * 1000; // 12 hours

        // Check localStorage cache
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < cacheTTL) {
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
                url += `?broadcaster_id=${broadcasterId}`;
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
     * Build a combined regex from all known cheermote prefixes
     * Pattern: word-boundary, then any known prefix, then one or more digits
     */
    _buildRegex() {
        if (!this.cheermoteData || Object.keys(this.cheermoteData).length === 0) {
            this.cheermoteRegex = null;
            return;
        }

        // Sort prefixes by length descending to match longest first
        const prefixes = Object.keys(this.cheermoteData)
            .sort((a, b) => b.length - a.length)
            .map(p => this._escapeRegex(p));

        // Match cheermote tokens: prefix followed by digits, at word boundaries
        // Using (?:^|\s) and (?:\s|$) to ensure whole-word matching
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

            // Find the cheermote data (case-insensitive lookup)
            const cheermoteEntry = this._findCheermoteEntry(prefix);
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
     * Find cheermote entry by prefix (case-insensitive)
     */
    _findCheermoteEntry(prefix) {
        const lowerPrefix = prefix.toLowerCase();
        for (const key of Object.keys(this.cheermoteData)) {
            if (key.toLowerCase() === lowerPrefix) {
                return this.cheermoteData[key];
            }
        }
        return null;
    }

    /**
     * Resolve the correct tier for a given bit amount
     * Tiers are sorted ascending by min_bits — pick the highest tier where min_bits <= bits
     */
    _resolveTier(cheermoteEntry, bits) {
        if (!cheermoteEntry.tiers || cheermoteEntry.tiers.length === 0) return null;

        let resolvedTier = cheermoteEntry.tiers[0]; // Default to lowest tier
        for (const tier of cheermoteEntry.tiers) {
            if (bits >= tier.min_bits) {
                resolvedTier = tier;
            } else {
                break; // Tiers are sorted ascending
            }
        }
        return resolvedTier;
    }
}
