/**
 * Creator Instance Manager Module
 * Manages scene instance storage, CRUD operations, selection state, and sidebar list rendering.
 */

import { UIHelpers } from './ui-helpers.js';
import { ModalA11y } from './modal-a11y.js';

export class CreatorInstanceManager {
    /**
     * @param {Object} opts
     * @param {Function} opts.getDefaultConfig - Function returning default overlay config object
     * @param {Function} opts.onNotification - Function to trigger notifications
     */
    constructor({ getDefaultConfig, onNotification }) {
        this.getDefaultConfig = getDefaultConfig;
        this.onNotification = onNotification || UIHelpers.showNotification;

        this.instances = {};
        this.instanceOrder = [];
        this.currentInstanceId = null;
    }

    loadInstances() {
        try {
            const instanceRegistry = localStorage.getItem('twitch-chat-overlay-instances');
            if (instanceRegistry) {
                this.instances = JSON.parse(instanceRegistry);
            } else {
                this.instances = {};
            }
        } catch (error) {
            console.error('Error loading instances:', error);
            this.onNotification('Error', 'Failed to load saved scene data.', 'error');
            this.instances = {};
        }

        const savedOrder = localStorage.getItem('twitch-chat-overlay-instanceOrder');
        if (savedOrder) {
            try {
                this.instanceOrder = JSON.parse(savedOrder);
                const instanceIds = Object.keys(this.instances);
                this.instanceOrder = this.instanceOrder.filter(id => instanceIds.includes(id));
                instanceIds.forEach(id => {
                    if (!this.instanceOrder.includes(id)) {
                        this.instanceOrder.push(id);
                    }
                });
            } catch (error) {
                console.error('Error loading instance order:', error);
                this.instanceOrder = Object.keys(this.instances);
            }
        } else {
            this.instanceOrder = Object.keys(this.instances);
        }

        this.migrateSyncTokens();
    }

    saveInstances() {
        try {
            localStorage.setItem('twitch-chat-overlay-instances', JSON.stringify(this.instances));
            localStorage.setItem('twitch-chat-overlay-instanceOrder', JSON.stringify(this.instanceOrder));
        } catch (err) {
            console.error('Failed to save instances:', err);
        }
    }

    /**
     * Mints a new sync token used as the Firestore document key (sceneConfigs/<syncToken>)
     * for live-syncing a scene's config to an OBS browser source.
     *
     * Must be a BARE UUID: the token goes straight into `PUT /api/scene-config/<token>`,
     * and the proxy's validateToken middleware 400s anything that isn't UUID-shaped.
     * A prefixed id (`sync-<uuid>`) silently broke all scene cloud sync — and with it
     * every background-image upload to GCS, which only happens inside that handler.
     *
     * @returns {string} A new bare UUID token
     */
    mintSyncToken() {
        return UIHelpers.generateUUID();
    }

    /**
     * Repairs sync tokens minted while mintSyncToken() prefixed them with `sync-`.
     * Those tokens made every scene-config write 400, so no cloud data exists under
     * them: stripping the prefix back to the original UUID is lossless and keeps the
     * scene's identity stable. A token that isn't a UUID even after stripping gets
     * re-minted.
     * @returns {number} How many instances were repaired.
     */
    migrateSyncTokens() {
        let repaired = 0;

        Object.values(this.instances).forEach(instance => {
            if (!instance || typeof instance !== 'object') return;

            const token = instance.syncToken;
            if (typeof token !== 'string' || UIHelpers.isUUID(token)) return;

            const stripped = token.startsWith('sync-') ? token.slice('sync-'.length) : '';
            instance.syncToken = UIHelpers.isUUID(stripped) ? stripped : this.mintSyncToken();
            repaired++;
        });

        if (repaired > 0) {
            this.saveInstances();
            console.log(`[CreatorInstanceManager] Repaired ${repaired} malformed sync token(s).`);
        }

        return repaired;
    }

    createInstance(nameInput) {
        const name = (nameInput || '').trim() || 'New Chat Scene';
        const id = UIHelpers.generateSecureId('scene');

        this.instances[id] = {
            id: id,
            name: name,
            config: this.getDefaultConfig(),
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            syncToken: this.mintSyncToken()
        };

        this.instanceOrder.push(id);
        this.saveInstances();
        this.onNotification('Created', `Created chat scene: ${name}`);
        return id;
    }

    duplicateCurrentInstance() {
        if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return null;
        const current = this.instances[this.currentInstanceId];
        const newId = UIHelpers.generateSecureId('scene');
        const newName = `${current.name} (Copy)`;

        this.instances[newId] = {
            id: newId,
            name: newName,
            config: typeof structuredClone === 'function' ? structuredClone(current.config) : JSON.parse(JSON.stringify(current.config)),
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            // Deliberately a fresh token, never copied from `current` — sharing a token would
            // mean sharing one Firestore doc between two instances, causing silent data loss.
            syncToken: this.mintSyncToken()
        };

        this.instanceOrder.push(newId);
        this.saveInstances();
        this.onNotification('Duplicated', `Created copy: ${newName}`);
        return newId;
    }

    deleteCurrentInstance() {
        if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return null;
        const current = this.instances[this.currentInstanceId];
        if (!window.confirm(`Delete "${current.name}"?`)) return null;

        const deletedId = this.currentInstanceId;
        const deletedName = current.name;

        delete this.instances[this.currentInstanceId];
        this.instanceOrder = this.instanceOrder.filter(id => id !== this.currentInstanceId);
        this.saveInstances();

        this.onNotification('Deleted', `Deleted chat scene: ${deletedName}`);
        return deletedId;
    }

    /**
     * Backfills a sync token for scenes created before tokens were minted automatically.
     * A non-null return means a new token was minted and the caller MUST push the config
     * to the cloud immediately — a minted-but-never-pushed token can otherwise be claimed
     * by whichever client connects first.
     * @param {string} instanceId
     * @returns {string|null} The newly minted token, or null if none was minted
     */
    ensureSyncToken(instanceId) {
        const instance = this.instances[instanceId];
        if (!instance) return null;
        if (instance.syncToken) return null;

        const token = this.mintSyncToken();
        instance.syncToken = token;
        this.saveInstances();
        return token;
    }

    renderInstanceList(container, onSelectCallback, isDirtyCallback) {
        if (!container) return;
        container.innerHTML = '';

        this.instanceOrder.forEach(id => {
            const instance = this.instances[id];
            if (!instance) return;

            const item = document.createElement('div');
            item.className = 'instance-item';
            item.dataset.id = id;
            item.draggable = true;
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            if (id === this.currentInstanceId) item.classList.add('active');

            const statusText = instance.syncToken ? 'Sync Active' : 'Local Scene';
            const isDirty = (typeof isDirtyCallback === 'function' && id === this.currentInstanceId) ? isDirtyCallback() : false;
            const unsavedTag = isDirty ? ' <span class="unsaved-dot" title="Unsaved changes">●</span>' : '';

            item.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div>
                        <div class="instance-name" style="font-weight: 600;">${UIHelpers.escapeHtml(instance.name)}${unsavedTag}</div>
                        <div style="font-size: 11px; opacity: 0.6;">${statusText}</div>
                    </div>
                    <i data-lucide="grip-vertical" style="opacity: 0.4; cursor: grab;" aria-hidden="true"></i>
                </div>
            `;

            item.addEventListener('click', () => onSelectCallback(id));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCallback(id);
                }
            });
            container.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    showEmptyState(domRefs = {}) {
        this.currentInstanceId = null;
        if (domRefs.emptyState) domRefs.emptyState.style.display = 'block';
        if (domRefs.configLayout) domRefs.configLayout.style.display = 'none';
        if (domRefs.workspaceActions) domRefs.workspaceActions.style.display = 'none';
        if (domRefs.workspaceTitle) domRefs.workspaceTitle.textContent = 'Select or Create a Chat Scene';
    }

    openInstanceModal(modalEl, inputEl) {
        if (!modalEl) return;
        if (inputEl) inputEl.value = '';
        modalEl.style.display = 'flex';
        ModalA11y.open(modalEl, { onRequestClose: () => this.closeInstanceModal(modalEl) });
        // modalEl carries tabindex="-1", so the fallback is now a real focus target
        (inputEl || modalEl).focus();
    }

    closeInstanceModal(modalEl) {
        if (!modalEl) return;
        // Release inertness BEFORE focusing: focus() on a still-inert element is a
        // silent no-op and focus would drop to <body>.
        const trigger = ModalA11y.close(modalEl);
        modalEl.style.display = 'none';
        if (trigger?.isConnected) trigger.focus();
    }
}
