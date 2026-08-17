/**
 * Scene Sync Manager Module
 * Manages Firestore real-time synchronization for chat overlay instances using unguessable capability tokens.
 */

import { UIHelpers } from './ui-helpers.js';
import { migrateConfig, CONFIG_VERSION } from './config-manager.js';

export function getProxyBaseUrl() {
    if (typeof window !== 'undefined') {
        if (window.__USE_LOCAL_PROXY__) {
            return 'http://localhost:8091/api';
        }
        try {
            if (localStorage.getItem('useLocalProxy') === 'true') {
                return 'http://localhost:8091/api';
            }
        } catch (_) {}
    }
    return 'https://theme-proxy-361545143046.us-central1.run.app/api';
}

export class SceneSyncManager {
    constructor() {
        this.myClientId = UIHelpers.generateSecureId('session');
        this._token = null;
        this._sceneName = 'default';
        this._unsubscribe = null;
        this._db = null;
        this._isSyncing = false;
        this._restFallbackToken = null;
        this._suppressRemoteUpdates = false;
        
        this._configManager = null;
        this._badgeManager = null;
        this._chatRenderer = null;
        this._thirdPartyEmoteManager = null;
        this._settingsPanel = null;
        this._chatConnection = null;
    }

    /**
     * Get the active sync token
     */
    getToken() {
        return this._token;
    }

    get syncToken() {
        return this._token;
    }

    set syncToken(newToken) {
        this.setSyncToken(newToken);
    }

    /**
     * Set active sync token and (re)subscribe to Firestore snapshot updates.
     * Handles both the "already syncing, token changed" case and the
     * "auto-provisioned token, never subscribed yet" case (where `_db` is
     * still null because `start()` no-op'd due to no `?sync=` URL param).
     */
    setSyncToken(newToken) {
        // Normalize here rather than trusting the caller: this value becomes both
        // the REST path segment (which the proxy validates as a bare UUID) and the
        // Firestore doc id, so a legacy `sync-<uuid>` must resolve to the same
        // document the migrated scene creator writes to.
        const normalized = UIHelpers.normalizeSyncToken(newToken);
        if (this._token === normalized) return;
        this._token = normalized;
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        if (this._token) {
            this._ensureSubscribed();
        }
    }

    /**
     * Initialize Firebase (if not already done) and subscribe to snapshot updates
     * for the current `_token`. Shared by `start()` and `setSyncToken()`. Any
     * failure degrades silently — the caller keeps using local config.
     * @returns {Promise<boolean>} whether the subscription was established
     */
    async _ensureSubscribed() {
        if (!this._token) return false;

        try {
            const firebaseFirestore = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

            if (!this._db) {
                const firebaseApp = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
                const firebaseConfig = {
                    projectId: 'chat-themer'
                };

                const app = firebaseApp.getApps().length === 0
                    ? firebaseApp.initializeApp(firebaseConfig)
                    : firebaseApp.getApps()[0];

                // Safely initialize or get Firestore instance
                try {
                    this._db = firebaseFirestore.initializeFirestore(app, {
                        experimentalAutoDetectLongPolling: true
                    });
                } catch (e) {
                    this._db = firebaseFirestore.getFirestore(app);
                }
            }

            const docRef = firebaseFirestore.doc(this._db, 'sceneConfigs', this._token);

            this._unsubscribe = firebaseFirestore.onSnapshot(docRef, (docSnap) => {
                this.handleSnapshot(docSnap);
            }, (error) => {
                console.warn('[SceneSyncManager] Firestore snapshot error:', error);
                // The SDK loaded but the listener can't deliver (permission denied,
                // long-polling blocked by a restrictive network). Nothing was thrown,
                // so the catch below never runs — fall back to REST here instead.
                // Once per token: the callback re-fires on every retry.
                if (this._restFallbackToken !== this._token) {
                    this._restFallbackToken = this._token;
                    this.fetchConfigFromProxy(this._token);
                }
            });

            this._isSyncing = true;
            return true;
        } catch (err) {
            console.warn('[SceneSyncManager] Failed to initialize Firebase SDK or subscription:', err);
            // Rule #3: Network / SDK failure -> fallback gracefully to REST GET if token active
            this.fetchConfigFromProxy(this._token);
            return false;
        }
    }

    /**
     * Start live sync if a sync token is present in the URL parameter.
     * Dependencies are wired up unconditionally (cheap reference assignment)
     * so a later `setSyncToken()` call (e.g. auto-provisioning a token on
     * first Save) has everything it needs to subscribe. Firebase itself is
     * only ever initialized when there's a token to subscribe with.
     */
    async start(options = {}) {
        this._sceneName = options.sceneName || 'default';
        this._configManager = options.configManager;
        this._badgeManager = options.badgeManager;
        this._chatRenderer = options.chatRenderer;
        this._thirdPartyEmoteManager = options.thirdPartyEmoteManager;
        this._settingsPanel = options.settingsPanel;
        this._chatConnection = options.chatConnection;
        this._suppressRemoteUpdates = !!options.suppressRemoteUpdates;

        const tokenFromUrl = UIHelpers.getUrlParameter('sync');
        if (!tokenFromUrl) {
            // Rule #1: No-op if sync parameter is not present. Zero cost / zero behavior change.
            return false;
        }

        // An OBS browser source created before the token fix still carries
        // `?sync=sync-<uuid>` in its URL; normalizing keeps those sources working
        // instead of silently 400ing on every write.
        this._token = UIHelpers.normalizeSyncToken(tokenFromUrl);
        if (!this._token) {
            console.warn('[SceneSyncManager] Ignoring malformed ?sync= token:', tokenFromUrl);
            return false;
        }
        return this._ensureSubscribed();
    }

    /**
     * Fetch scene configuration via REST GET endpoint from proxy service (fallback on SDK / network error)
     */
    async fetchConfigFromProxy(token = this._token) {
        if (!token || this._suppressRemoteUpdates) return null;
        try {
            const baseUrl = getProxyBaseUrl();
            const response = await fetch(`${baseUrl}/scene-config/${token}`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data && data.config && this._configManager) {
                const defaults = this._configManager.getDefaultConfig();
                const { config: mergedConfig } = migrateConfig(data.config, defaults);
                this._configManager.applyConfiguration(mergedConfig);
                this._configManager.saveConfig(this._sceneName);
                try {
                    localStorage.setItem(`chatConfig_sync_${token}`, JSON.stringify(mergedConfig));
                } catch (e) {}
                if (this._badgeManager) this._badgeManager.config = mergedConfig;
                if (this._chatRenderer) this._chatRenderer.config = mergedConfig;
                if (this._thirdPartyEmoteManager) this._thirdPartyEmoteManager.config = mergedConfig;
                if (this._settingsPanel) this._settingsPanel.updateConfigPanelFromConfig();
                return mergedConfig;
            }
        } catch (err) {
            console.warn('[SceneSyncManager] Failed to fetch scene config from proxy:', err);
        }
        return null;
    }

    /**
     * Handle incoming snapshot from Firestore
     */
    handleSnapshot(docSnap) {
        if (!docSnap || !docSnap.exists()) {
            // Doc missing path (Rule #2: Token claim) -> upload current local config
            if (this._configManager && this._configManager.config) {
                console.log('[SceneSyncManager] Token doc missing in Firestore. Claiming token with local config...');
                this.pushConfig(this._configManager.config);
            }
            return;
        }

        if (this._suppressRemoteUpdates) return;

        const data = docSnap.data();
        if (!data || !data.config) return;

        // Echo suppression: skip if update was made by this browser session
        if (data.updatedBy && data.updatedBy === this.myClientId) {
            return;
        }

        if (!this._configManager) return;

        const defaults = this._configManager.getDefaultConfig();
        const { config: mergedConfig } = migrateConfig(data.config, defaults);

        // Capture previous channel settings to check channel reconnection guard
        const oldTwitch = this._configManager.config.lastTwitchChannel || this._configManager.config.lastChannel;
        const oldYouTube = this._configManager.config.lastYouTubeTarget;

        // Apply configuration live
        this._configManager.applyConfiguration(mergedConfig);
        this._configManager.saveConfig(this._sceneName);
        if (this._token) {
            try {
                localStorage.setItem(`chatConfig_sync_${this._token}`, JSON.stringify(mergedConfig));
            } catch (e) {}
        }

        // Update dependencies
        if (this._badgeManager) this._badgeManager.config = mergedConfig;
        if (this._chatRenderer) this._chatRenderer.config = mergedConfig;
        if (this._thirdPartyEmoteManager) this._thirdPartyEmoteManager.config = mergedConfig;
        if (this._settingsPanel) this._settingsPanel.updateConfigPanelFromConfig();

        // Channel-change guard: reconnect only when incoming channel differs from current channel
        const newTwitch = mergedConfig.lastTwitchChannel || mergedConfig.lastChannel;
        const newYouTube = mergedConfig.lastYouTubeTarget;

        if (this._chatConnection) {
            if (newTwitch && newTwitch !== oldTwitch) {
                console.log(`[SceneSyncManager] Channel change detected (Twitch: ${newTwitch}). Reconnecting...`);
                this._chatConnection.connectTwitch(newTwitch);
            }
            if (newYouTube && newYouTube !== oldYouTube) {
                console.log(`[SceneSyncManager] Channel change detected (YouTube: ${newYouTube}). Reconnecting...`);
                this._chatConnection.connectYouTube(newYouTube);
            }
        }
    }

    /**
     * Push config updates to the backend Cloud Run proxy service via PUT
     */
    async pushConfig(configToPush) {
        if (!this._token) {
            return { success: false, reason: 'No sync token active' };
        }

        const payload = {
            config: configToPush,
            sceneName: this._sceneName,
            configVersion: CONFIG_VERSION,
            updatedBy: this.myClientId
        };

        const baseUrl = getProxyBaseUrl();
        const endpoint = `${baseUrl}/scene-config/${this._token}`;

        try {
            let response = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 413) {
                // Background image payload overflow -> retry without bgImage
                console.warn('[SceneSyncManager] 413 Payload Too Large. Stripping bgImage data URL and retrying...');
                const strippedConfig = { ...configToPush, bgImage: null };
                payload.config = strippedConfig;

                response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (this._chatRenderer) {
                    this._chatRenderer.addSystemMessage('Background image was too large to sync online, but other settings saved.', true);
                }
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error('[SceneSyncManager] Failed to push scene config:', response.status, errData);
                return { success: false, status: response.status, error: errData.error };
            }

            const resData = await response.json();
            if (resData.stripped && this._chatRenderer) {
                this._chatRenderer.addSystemMessage('Background image was stripped due to size limit, but other settings saved.', true);
            }

            if (this._token) {
                // Cache the server's view, not ours. The backend rewrites a data-URL
                // bgImage to a Cloud Storage URL (and may strip it outright), so
                // storing our copy would keep a data URL the server doesn't have —
                // up to 900 KB of base64 duplicated alongside the scene-keyed entry,
                // which risks blowing the localStorage quota and losing the write.
                // The snapshot echo delivers the real URL moments later.
                const cacheable = { ...payload.config, bgImage: null };
                try {
                    localStorage.setItem(`chatConfig_sync_${this._token}`, JSON.stringify(cacheable));
                } catch (e) {}
            }

            return { success: true, data: resData };
        } catch (error) {
            console.error('[SceneSyncManager] Network error pushing scene config:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Unsubscribe from Firestore snapshot listener
     */
    stop() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._isSyncing = false;
    }
}
