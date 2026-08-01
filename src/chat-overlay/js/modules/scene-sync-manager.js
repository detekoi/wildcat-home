/**
 * Scene Sync Manager Module
 * Manages Firestore real-time synchronization for chat overlay instances using unguessable capability tokens.
 */

import { UIHelpers } from './ui-helpers.js';
import { migrateConfig, CONFIG_VERSION } from './config-manager.js';

export function getProxyBaseUrl() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost');
    if (isLocalhost) {
        return 'http://localhost:8091/api';
    }
    return 'https://theme-proxy-361545143046.us-central1.run.app/api';
}

export class SceneSyncManager {
    constructor() {
        this.myClientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random()}`;
        this._token = null;
        this._sceneName = 'default';
        this._unsubscribe = null;
        this._db = null;
        this._isSyncing = false;
        
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

    /**
     * Start live sync if a sync token is present in the URL parameter
     */
    async start(options = {}) {
        const tokenFromUrl = UIHelpers.getUrlParameter('sync');
        if (!tokenFromUrl) {
            // Rule #1: No-op if sync parameter is not present. Zero cost / zero behavior change.
            return false;
        }

        this._token = tokenFromUrl;
        this._sceneName = options.sceneName || 'default';
        this._configManager = options.configManager;
        this._badgeManager = options.badgeManager;
        this._chatRenderer = options.chatRenderer;
        this._thirdPartyEmoteManager = options.thirdPartyEmoteManager;
        this._settingsPanel = options.settingsPanel;
        this._chatConnection = options.chatConnection;

        try {
            // Dynamically import Firebase ESM modules from gstatic
            const [firebaseApp, firebaseFirestore] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
            ]);

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

            const docRef = firebaseFirestore.doc(this._db, 'sceneConfigs', this._token);

            this._unsubscribe = firebaseFirestore.onSnapshot(docRef, (docSnap) => {
                this.handleSnapshot(docSnap);
            }, (error) => {
                console.warn('[SceneSyncManager] Firestore snapshot error:', error);
            });

            this._isSyncing = true;
            return true;
        } catch (err) {
            console.error('[SceneSyncManager] Failed to initialize Firebase SDK or subscription:', err);
            // Rule #3: Network / SDK failure -> fallback gracefully to local config already loaded
            return false;
        }
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

        const data = docSnap.data();
        if (!data || !data.config) return;

        // Echo suppression: skip if update was made by this browser session
        if (data.updatedBy && data.updatedBy === this.myClientId) {
            return;
        }

        if (!this._configManager) return;

        const defaults = this._configManager.getDefaultConfig();
        const { config: mergedConfig, pendingNotice } = migrateConfig(data.config, defaults);

        if (pendingNotice && this._chatRenderer) {
            this._chatRenderer.addSystemMessage('Third-party emotes (BTTV, FFZ, 7TV) are now supported — enable them in Settings.', true, 8000);
        }

        // Capture previous channel settings to check channel reconnection guard
        const oldTwitch = this._configManager.config.lastTwitchChannel || this._configManager.config.lastChannel;
        const oldYouTube = this._configManager.config.lastYouTubeTarget;

        // Apply configuration live
        this._configManager.applyConfiguration(mergedConfig);
        this._configManager.saveConfig(this._sceneName);

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
