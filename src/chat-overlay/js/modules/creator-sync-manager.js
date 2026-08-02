/**
 * Creator Sync Manager Module
 * Manages creator-side live sync token lifecycle, Firestore listener subscriptions, and Cloud Run proxy pushes.
 */

import { getProxyBaseUrl } from './scene-sync-manager.js';
import { UIHelpers } from './ui-helpers.js';

export class CreatorSyncManager {
    /**
     * @param {Object} opts
     * @param {Function} opts.onNotification - Function to trigger notifications
     * @param {Function} opts.onRemoteUpdate - Function called when a remote Firestore update arrives
     */
    constructor({ onNotification, onRemoteUpdate }) {
        this.onNotification = onNotification || UIHelpers.showNotification;
        this.onRemoteUpdate = onRemoteUpdate;
        this.firestoreUnsubscribe = null;

        this.myClientId = UIHelpers.generateSecureId('creator');
    }

    async subscribeToRemoteChanges(syncToken, currentInstanceId, getInstance, saveInstances, getCurrentInstanceId) {
        if (this.firestoreUnsubscribe) {
            this.firestoreUnsubscribe();
            this.firestoreUnsubscribe = null;
        }

        if (!syncToken) return;

        try {
            const [firebaseApp, firebaseFirestore] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
            ]);

            const app = firebaseApp.getApps().length === 0
                ? firebaseApp.initializeApp({ projectId: 'chat-themer' })
                : firebaseApp.getApps()[0];

            let db;
            try {
                db = firebaseFirestore.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
            } catch (e) {
                db = firebaseFirestore.getFirestore(app);
            }
            const docRef = firebaseFirestore.doc(db, 'sceneConfigs', syncToken);

            this.firestoreUnsubscribe = firebaseFirestore.onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().config) {
                    const data = docSnap.data();
                    if (data.updatedBy && data.updatedBy === this.myClientId) return;
                    const instance = getInstance(currentInstanceId);
                    if (instance) {
                        instance.config = data.config;
                        saveInstances();
                        const activeId = typeof getCurrentInstanceId === 'function' ? getCurrentInstanceId() : currentInstanceId;
                        if (instance.id === activeId && this.onRemoteUpdate) {
                            this.onRemoteUpdate(instance);
                        }
                    }
                }
            }, (err) => console.warn('[CreatorSync] Firestore subscription error:', err));
        } catch (e) {
            console.warn('[CreatorSync] Could not initialize Firestore remote listener:', e);
        }
    }

    unsubscribeRemote() {
        if (this.firestoreUnsubscribe) {
            this.firestoreUnsubscribe();
            this.firestoreUnsubscribe = null;
        }
    }

    async pushToCloud(syncToken, config, sceneName) {
        try {
            const proxyUrl = getProxyBaseUrl();
            const response = await fetch(`${proxyUrl}/scene-config/${syncToken}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: config,
                    sceneName: sceneName || 'Untitled Scene',
                    updatedBy: this.myClientId
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[CreatorSync] Cloud push failed:', response.status, errText);
                return { success: false, status: response.status };
            }

            return { success: true };
        } catch (error) {
            console.error('[CreatorSync] Error pushing to cloud proxy:', error);
            return { success: false, error: error.message };
        }
    }

    updateInstanceUrl(instance, currentInstanceId, domRefs = {}) {
        if (!currentInstanceId || !instance) return;
        const baseUrl = window.location.href.split('chat-scene-creator.html')[0] + 'chat.html';
        let url = `${baseUrl}?scene=${encodeURIComponent(currentInstanceId)}`;
        if (instance.syncToken) {
            url += `&sync=${encodeURIComponent(instance.syncToken)}`;
        }

        if (domRefs.instanceUrlConfig) domRefs.instanceUrlConfig.textContent = url;
        if (domRefs.instanceUrlSetup) domRefs.instanceUrlSetup.textContent = url;
    }
}
