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

    createInstance(nameInput) {
        const name = (nameInput || '').trim() || 'New Chat Scene';
        const id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? `scene_${crypto.randomUUID()}`
            : `scene_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        this.instances[id] = {
            id: id,
            name: name,
            config: this.getDefaultConfig(),
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        this.instanceOrder.push(id);
        this.saveInstances();
        this.onNotification('Created', `Created chat scene: ${name}`);
        return id;
    }

    duplicateCurrentInstance() {
        if (!this.currentInstanceId || !this.instances[this.currentInstanceId]) return null;
        const current = this.instances[this.currentInstanceId];
        const newId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? `scene_${crypto.randomUUID()}`
            : `scene_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newName = `${current.name} (Copy)`;

        this.instances[newId] = {
            id: newId,
            name: newName,
            config: typeof structuredClone === 'function' ? structuredClone(current.config) : JSON.parse(JSON.stringify(current.config)),
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
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

    renderInstanceList(container, onSelectCallback) {
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

            item.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div>
                        <div style="font-weight: 600;">${UIHelpers.escapeHtml(instance.name)}</div>
                        <div style="font-size: 11px; opacity: 0.6;">${id}${instance.syncToken ? ' • Sync Active' : ''}</div>
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
