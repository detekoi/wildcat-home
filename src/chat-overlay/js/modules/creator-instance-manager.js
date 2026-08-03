/**
 * Creator Instance Manager Module
 * Manages scene instance storage, CRUD operations, selection state, and sidebar list rendering.
 */

import { UIHelpers } from './ui-helpers.js';

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
            this.onNotification('Error', 'Failed to load saved instance data.', 'error');
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
     * @returns {string} A new bare UUID token
     */
    mintSyncToken() {
        return UIHelpers.generateSecureId('sync');
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
        if (!window.confirm(`Are you sure you want to delete "${current.name}"?`)) return null;

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
                    <i data-lucide="grip-vertical" style="opacity: 0.4; cursor: grab;"></i>
                </div>
            `;

            item.addEventListener('click', () => onSelectCallback(id));
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
        if (modalEl) {
            if (inputEl) inputEl.value = '';
            modalEl.style.display = 'flex';
            if (inputEl) inputEl.focus();
        }
    }

    closeInstanceModal(modalEl) {
        if (modalEl) {
            modalEl.style.display = 'none';
        }
    }
}
