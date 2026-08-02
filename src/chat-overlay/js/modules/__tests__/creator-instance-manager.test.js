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
        it('should return a truthy token string that is not prefixed with scene_', () => {
            const token = instanceManager.mintSyncToken();

            expect(typeof token).toBe('string');
            expect(token).toBeTruthy();
            expect(token.startsWith('scene_')).toBe(false);
        });

        it('should mint distinct tokens on the non-crypto fallback path', () => {
            // Non-secure contexts (plain http) leave crypto.randomUUID undefined. The
            // fallback must still not collide within the same millisecond — a shared
            // token means two scenes writing to one Firestore doc.
            const original = globalThis.crypto.randomUUID;
            Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });

            try {
                const first = instanceManager.mintSyncToken();
                const second = instanceManager.mintSyncToken();

                expect(first).toMatch(/^sync-/);
                expect(first).not.toBe(second);
            } finally {
                Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
            }
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
    });
});
