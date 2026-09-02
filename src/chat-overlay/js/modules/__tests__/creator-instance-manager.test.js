import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreatorInstanceManager } from '../creator-instance-manager.js';

describe('CreatorInstanceManager - Sync Token Handling', () => {
    let instanceManager;
    let onNotification;

    beforeEach(() => {
        localStorage.clear();
        onNotification = vi.fn();
        instanceManager = new CreatorInstanceManager({
            getDefaultConfig: () => ({ theme: 'default', fontSize: 14 }),
            onNotification
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('mintSyncToken', () => {
        // The token is interpolated straight into PUT /api/scene-config/<token>, and the
        // proxy's validateToken middleware 400s anything that isn't UUID-shaped. A
        // prefixed token silently broke all scene cloud sync (and every GCS background
        // upload, which only happens inside that handler), so the shape is the contract.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        it('should return a bare UUID with no prefix', () => {
            const token = instanceManager.mintSyncToken();

            expect(typeof token).toBe('string');
            expect(token).toMatch(UUID_RE);
        });

        it('should mint distinct bare UUIDs on the non-crypto fallback path', () => {
            // Non-secure contexts (plain http) leave crypto.randomUUID undefined. The
            // fallback must still not collide within the same millisecond — a shared
            // token means two scenes writing to one Firestore doc — and must still be
            // UUID-shaped or the proxy rejects it.
            const original = globalThis.crypto.randomUUID;
            Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });

            try {
                const first = instanceManager.mintSyncToken();
                const second = instanceManager.mintSyncToken();

                expect(first).toMatch(UUID_RE);
                expect(second).toMatch(UUID_RE);
                expect(first).not.toBe(second);
            } finally {
                Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
            }
        });
    });

    describe('migrateSyncTokens', () => {
        it('should strip a legacy sync- prefix, preserving the underlying UUID', () => {
            const uuid = '3f2a1b4c-5d6e-4f70-8091-a2b3c4d5e6f7';
            instanceManager.instances = { 'scene-1': { id: 'scene-1', syncToken: `sync-${uuid}` } };

            const repaired = instanceManager.migrateSyncTokens();

            expect(repaired).toBe(1);
            expect(instanceManager.instances['scene-1'].syncToken).toBe(uuid);
        });

        it('should re-mint a token that is not a UUID even after stripping', () => {
            instanceManager.instances = { 'scene-1': { id: 'scene-1', syncToken: 'sync-1712345678_ab12cd' } };

            instanceManager.migrateSyncTokens();

            expect(instanceManager.instances['scene-1'].syncToken).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        });

        it('should leave already-valid tokens untouched and report nothing repaired', () => {
            const uuid = '3f2a1b4c-5d6e-4f70-8091-a2b3c4d5e6f7';
            instanceManager.instances = { 'scene-1': { id: 'scene-1', syncToken: uuid } };

            const repaired = instanceManager.migrateSyncTokens();

            expect(repaired).toBe(0);
            expect(instanceManager.instances['scene-1'].syncToken).toBe(uuid);
        });
    });

    describe('createInstance', () => {
        it('should produce an instance with a truthy syncToken', () => {
            const id = instanceManager.createInstance('My Scene');

            expect(instanceManager.instances[id].syncToken).toBeTruthy();
        });

        it('should mint different sync tokens across two successive calls', () => {
            const id1 = instanceManager.createInstance('Scene One');
            const id2 = instanceManager.createInstance('Scene Two');

            const token1 = instanceManager.instances[id1].syncToken;
            const token2 = instanceManager.instances[id2].syncToken;

            expect(token1).toBeTruthy();
            expect(token2).toBeTruthy();
            expect(token1).not.toBe(token2);
        });
    });

    describe('duplicateCurrentInstance', () => {
        it('should mint a fresh sync token distinct from the source, while deep-copying the config', () => {
            const sourceId = instanceManager.createInstance('Source Scene');
            instanceManager.currentInstanceId = sourceId;
            const sourceInstance = instanceManager.instances[sourceId];
            sourceInstance.config.fontSize = 42;

            const newId = instanceManager.duplicateCurrentInstance();
            const newInstance = instanceManager.instances[newId];

            // Most important assertion: a shared token means two scenes write to
            // one Firestore doc, causing silent data loss.
            expect(newInstance.syncToken).toBeTruthy();
            expect(newInstance.syncToken).not.toBe(sourceInstance.syncToken);

            // The config itself should still be copied faithfully, by value not by reference.
            expect(newInstance.config).toEqual(sourceInstance.config);
            expect(newInstance.config).not.toBe(sourceInstance.config);
        });
    });

    describe('ensureSyncToken', () => {
        it('should return null for an unknown instance id', () => {
            const result = instanceManager.ensureSyncToken('does-not-exist');

            expect(result).toBeNull();
        });

        it('should return null and leave the token unchanged when the instance already has a syncToken', () => {
            const id = instanceManager.createInstance('Existing Scene');
            const originalToken = instanceManager.instances[id].syncToken;

            const result = instanceManager.ensureSyncToken(id);

            expect(result).toBeNull();
            expect(instanceManager.instances[id].syncToken).toBe(originalToken);
        });

        it('should mint, assign, and persist a token when the instance has none, and return the new token', () => {
            const id = instanceManager.createInstance('Legacy Scene');
            delete instanceManager.instances[id].syncToken;

            const result = instanceManager.ensureSyncToken(id);

            expect(result).toBeTruthy();
            expect(instanceManager.instances[id].syncToken).toBe(result);

            const persisted = JSON.parse(localStorage.getItem('twitch-chat-overlay-instances'));
            expect(persisted[id].syncToken).toBe(result);
        });
    });

    describe('renderInstanceList', () => {
        it('should render items with name and status without leaking raw scene IDs in list text', () => {
            const container = document.createElement('div');
            const sceneId = instanceManager.createInstance('Gaming Scene');

            instanceManager.renderInstanceList(container, vi.fn());

            const item = container.querySelector('.instance-item');
            expect(item).not.toBeNull();
            expect(item.textContent).toContain('Gaming Scene');
            expect(item.textContent).toContain('Sync Active');
            expect(item.textContent).not.toContain(sceneId);
            expect(item.dataset.id).toBe(sceneId);
        });

        it('should display "Local Scene" when instance has no sync token', () => {
            const container = document.createElement('div');
            const sceneId = instanceManager.createInstance('Local Gaming Scene');
            delete instanceManager.instances[sceneId].syncToken;

            instanceManager.renderInstanceList(container, vi.fn());

            const item = container.querySelector('.instance-item');
            expect(item.textContent).toContain('Local Scene');
            expect(item.textContent).not.toContain('Sync Active');
        });

        it('should display "In account" when isInAccount returns true for the instance', () => {
            const container = document.createElement('div');
            instanceManager.createInstance('Gaming Scene');

            instanceManager.renderInstanceList(container, vi.fn(), undefined, { isInAccount: () => true });

            const item = container.querySelector('.instance-item');
            expect(item.textContent).toContain('In account');
            expect(item.textContent).not.toContain('Sync Active');
        });

        it('should fall back to "Sync Active" when isInAccount returns false for a synced instance', () => {
            const container = document.createElement('div');
            instanceManager.createInstance('Gaming Scene');

            instanceManager.renderInstanceList(container, vi.fn(), undefined, { isInAccount: () => false });

            const item = container.querySelector('.instance-item');
            expect(item.textContent).toContain('Sync Active');
            expect(item.textContent).not.toContain('In account');
        });

        it('should still render "Sync Active"/"Local Scene" when called without the 4th argument (existing 2/3-arg callers)', () => {
            const container = document.createElement('div');
            const syncedId = instanceManager.createInstance('Synced Scene');
            const localId = instanceManager.createInstance('Local Scene Two');
            delete instanceManager.instances[localId].syncToken;

            instanceManager.renderInstanceList(container, vi.fn(), () => false);

            const items = container.querySelectorAll('.instance-item');
            const syncedItem = Array.from(items).find(el => el.dataset.id === syncedId);
            const localItem = Array.from(items).find(el => el.dataset.id === localId);
            expect(syncedItem.textContent).toContain('Sync Active');
            expect(localItem.textContent).toContain('Local Scene');
        });
    });

    describe('createLinkedInstance', () => {
        it('should set the given syncToken on the new instance', () => {
            const id = instanceManager.createLinkedInstance({ name: 'Remote Scene', syncToken: 'abc-123' });

            expect(instanceManager.instances[id].syncToken).toBe('abc-123');
        });

        it('should merge a provided config over the defaults: provided keys override, missing keys fall back', () => {
            const id = instanceManager.createLinkedInstance({
                name: 'Remote Scene',
                syncToken: 'abc-123',
                config: { theme: 'dark' }
            });

            expect(instanceManager.instances[id].config).toEqual({ theme: 'dark', fontSize: 14 });
        });

        it('should use the default config when config is null', () => {
            const id = instanceManager.createLinkedInstance({ name: 'Remote Scene', syncToken: 'abc-123', config: null });

            expect(instanceManager.instances[id].config).toEqual({ theme: 'default', fontSize: 14 });
        });

        it('should append the new instance to instanceOrder', () => {
            const id = instanceManager.createLinkedInstance({ name: 'Remote Scene', syncToken: 'abc-123' });

            expect(instanceManager.instanceOrder).toContain(id);
        });

        it('should persist the new instance to localStorage', () => {
            const id = instanceManager.createLinkedInstance({ name: 'Remote Scene', syncToken: 'abc-123' });

            const persisted = JSON.parse(localStorage.getItem('twitch-chat-overlay-instances'));
            expect(persisted[id].syncToken).toBe('abc-123');
        });

        it('should fire no notification', () => {
            instanceManager.createLinkedInstance({ name: 'Remote Scene', syncToken: 'abc-123' });

            expect(onNotification).not.toHaveBeenCalled();
        });

        it('should default the name to "Linked Scene" when no name is given', () => {
            const id = instanceManager.createLinkedInstance({ syncToken: 'abc-123' });

            expect(instanceManager.instances[id].name).toBe('Linked Scene');
        });
    });

    describe('deleteCurrentInstance', () => {
        it('should use the default confirm message when none is given', () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const id = instanceManager.createInstance('My Scene');
            instanceManager.currentInstanceId = id;

            instanceManager.deleteCurrentInstance();

            expect(confirmSpy).toHaveBeenCalledWith('Delete "My Scene"?');
        });

        it('should use the custom confirm message when given', () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const id = instanceManager.createInstance('My Scene');
            instanceManager.currentInstanceId = id;

            instanceManager.deleteCurrentInstance({ confirmMessage: 'This scene is linked to your account. Delete anyway?' });

            expect(confirmSpy).toHaveBeenCalledWith('This scene is linked to your account. Delete anyway?');
        });
    });
});
