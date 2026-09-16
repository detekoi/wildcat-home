/**
 * Pronoun Manager Module
 * Handles fetching and caching of pronouns from Alejo's API (https://pr.alejo.io/)
 *
 * Uses the v1 API, which models a primary pronoun and an optional alternate
 * pronoun separately (e.g. "She/They" is pronoun_id "sheher" + alt_pronoun_id
 * "theythem"). The legacy /api endpoint collapsed these into synthetic IDs like
 * "shethem" that were absent from its own definitions list.
 */

export class PronounManager {
    constructor() {
        // pronoun_id -> { subject, object, singular } (e.g. "hehim" -> { subject: "He", object: "Him", singular: false })
        this.definitions = new Map();
        // pronoun_id -> display string for the primary pronoun alone (e.g. "hehim" -> "He/Him")
        this.pronounsMap = new Map();
        // username -> { pronounId, altPronounId } | null
        this.userPronounsCache = new Map();
        this.pendingRequests = new Map(); // username -> Promise
        this.hasLoadedDefinitions = false;
        this.definitionsPromise = null;
        this.BASE_URL = 'https://api.pronouns.alejo.io/v1';
        // Twitch usernames: alphanumeric + underscores, 1-25 characters
        this.VALID_USERNAME_RE = /^[a-zA-Z0-9_]{1,25}$/;
    }

    /**
     * Validate that a username contains only safe characters.
     * Prevents SSRF by rejecting path-traversal or encoded sequences
     * before they reach the fetch URL. Matches Twitch username rules.
     * @param {string} username
     * @returns {boolean}
     */
    isValidUsername(username) {
        return typeof username === 'string' && this.VALID_USERNAME_RE.test(username);
    }

    /**
     * Build the display string for a primary pronoun and optional alternate.
     * Mirrors Alejo's own rendering: "She/They" when an alternate is set,
     * "He/Him" otherwise, and just "Any" for singular entries.
     * @param {string} pronounId
     * @param {string|null} altPronounId
     * @returns {string|null}
     */
    formatDisplay(pronounId, altPronounId = null) {
        if (!pronounId) return null;
        const primary = this.definitions.get(pronounId);
        if (!primary) return pronounId; // Unknown ID: degrade to the raw value rather than nothing

        const alt = altPronounId ? this.definitions.get(altPronounId) : null;
        if (alt) return `${primary.subject}/${alt.subject}`;
        if (primary.singular) return primary.subject;
        return `${primary.subject}/${primary.object}`;
    }

    /**
     * Load pronoun definitions (mapping IDs to subject/object forms)
     */
    async loadDefinitions() {
        if (this.hasLoadedDefinitions) return;
        if (this.definitionsPromise) return this.definitionsPromise;

        this.definitionsPromise = (async () => {
            try {
                const response = await fetch(`${this.BASE_URL}/pronouns`);
                if (!response.ok) throw new Error(`Failed to load pronouns: ${response.status}`);

                const data = await response.json();
                // Data format: object keyed by ID: { hehim: { name, subject, object, singular }, ... }
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    Object.values(data).forEach(p => {
                        if (!p || !p.name || !p.subject) return;
                        this.definitions.set(p.name, {
                            subject: p.subject,
                            object: p.object || p.subject,
                            singular: Boolean(p.singular)
                        });
                    });
                    this.definitions.forEach((_, id) => {
                        this.pronounsMap.set(id, this.formatDisplay(id));
                    });
                    this.hasLoadedDefinitions = this.definitions.size > 0;
                    console.log('[PronounManager] Loaded definitions:', this.definitions.size);
                }
            } catch (error) {
                console.warn('[PronounManager] Error loading definitions:', error);
            } finally {
                this.definitionsPromise = null;
            }
        })();

        return this.definitionsPromise;
    }

    /**
     * Get pronoun display string for a user
     * Returns null if not found or not yet loaded
     * Triggers fetch if not in cache
     */
    async getUserPronoun(username) {
        if (!username) return null;
        const lowerUser = username.toLowerCase();

        // Reject usernames with disallowed characters to prevent SSRF
        if (!this.isValidUsername(lowerUser)) return null;

        // 1. Check cache
        if (this.userPronounsCache.has(lowerUser)) {
            const entry = this.userPronounsCache.get(lowerUser);
            return entry ? this.formatDisplay(entry.pronounId, entry.altPronounId) : null;
        }

        // 2. If already fetching, return the existing promise
        if (this.pendingRequests.has(lowerUser)) {
            return this.pendingRequests.get(lowerUser);
        }

        // 3. Trigger fetch — lowerUser is validated above to contain only [a-z0-9_]
        const fetchPromise = (async () => {
            try {
                const response = await fetch(`${this.BASE_URL}/users/${encodeURIComponent(lowerUser)}`);
                if (response.ok) {
                    const rawData = await response.json();
                    const data = Array.isArray(rawData) ? rawData[0] : rawData;

                    if (data && data.pronoun_id) {
                        const entry = {
                            pronounId: data.pronoun_id,
                            altPronounId: data.alt_pronoun_id || null
                        };
                        this.userPronounsCache.set(lowerUser, entry);
                        if (!this.hasLoadedDefinitions) {
                            await this.loadDefinitions();
                        }
                        return this.formatDisplay(entry.pronounId, entry.altPronounId);
                    } else {
                        this.userPronounsCache.set(lowerUser, null);
                        return null;
                    }
                } else if (response.status === 404) {
                    this.userPronounsCache.set(lowerUser, null);
                    return null;
                }
            } catch (error) {
                console.warn('[PronounManager] Error fetching for', lowerUser, ':', error);
                return null;
            } finally {
                this.pendingRequests.delete(lowerUser);
            }
            return null;
        })();

        this.pendingRequests.set(lowerUser, fetchPromise);
        return fetchPromise;
    }

    /**
     * Get display text synchronously if available
     */
    getPronounDisplay(username) {
        if (!username) return null;
        const lowerUser = username.toLowerCase();
        if (!this.isValidUsername(lowerUser)) return null;
        const entry = this.userPronounsCache.get(lowerUser);
        return entry ? this.formatDisplay(entry.pronounId, entry.altPronounId) : null;
    }
}
