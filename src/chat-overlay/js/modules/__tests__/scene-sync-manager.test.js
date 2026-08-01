import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SceneSyncManager, getProxyBaseUrl } from '../scene-sync-manager.js';
import { ConfigManager } from '../config-manager.js';

describe('SceneSyncManager', () => {
    let syncManager;
    let mockConfigManager;
    let mockChatRenderer;
    let mockChatConnection;
    let mockSettingsPanel;

    beforeEach(() => {
        vi.restoreAllMocks();
        syncManager = new SceneSyncManager();
        mockConfigManager = new ConfigManager();
        mockChatRenderer = {
            addSystemMessage: vi.fn(),
            config: {}
        };
        mockChatConnection = {
            connectTwitch: vi.fn(),
            connectYouTube: vi.fn()
        };
        mockSettingsPanel = {
            updateConfigPanelFromConfig: vi.fn()
        };
    });

    it('should be a no-op if no sync URL parameter is present', async () => {
        // window.location.search is empty by default in jsdom
        const started = await syncManager.start({ configManager: mockConfigManager });
        expect(started).toBe(false);
        expect(syncManager.getToken()).toBeNull();
    });

    it('should suppress echo when snapshot updatedBy matches client session ID', () => {
        const applySpy = vi.spyOn(mockConfigManager, 'applyConfiguration');
        syncManager._configManager = mockConfigManager;
        
        const mockSnap = {
            exists: () => true,
            data: () => ({
                config: { theme: 'cyberpunk' },
                updatedBy: syncManager.myClientId
            })
        };

        syncManager.handleSnapshot(mockSnap);
        expect(applySpy).not.toHaveBeenCalled();
    });

    it('should apply remote configuration and save to localStorage on valid snapshot', () => {
        const applySpy = vi.spyOn(mockConfigManager, 'applyConfiguration');
        const saveSpy = vi.spyOn(mockConfigManager, 'saveConfig');
        
        syncManager._configManager = mockConfigManager;
        syncManager._chatRenderer = mockChatRenderer;
        syncManager._settingsPanel = mockSettingsPanel;
        syncManager._sceneName = 'test_scene';

        const mockSnap = {
            exists: () => true,
            data: () => ({
                config: { theme: 'pink', fontSize: 18 },
                updatedBy: 'other-session-id'
            })
        };

        syncManager.handleSnapshot(mockSnap);

        expect(applySpy).toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalledWith('test_scene');
        expect(mockSettingsPanel.updateConfigPanelFromConfig).toHaveBeenCalled();
    });

    it('should trigger channel reconnection ONLY when channel actually changes', () => {
        syncManager._configManager = mockConfigManager;
        syncManager._chatConnection = mockChatConnection;
        
        // Initial config channel
        mockConfigManager.config.lastTwitchChannel = 'old_channel';

        // Snapshot with SAME channel
        const sameChannelSnap = {
            exists: () => true,
            data: () => ({
                config: { lastTwitchChannel: 'old_channel' },
                updatedBy: 'remote-user'
            })
        };
        syncManager.handleSnapshot(sameChannelSnap);
        expect(mockChatConnection.connectTwitch).not.toHaveBeenCalled();

        // Snapshot with NEW channel
        const newChannelSnap = {
            exists: () => true,
            data: () => ({
                config: { lastTwitchChannel: 'new_channel' },
                updatedBy: 'remote-user'
            })
        };
        syncManager.handleSnapshot(newChannelSnap);
        expect(mockChatConnection.connectTwitch).toHaveBeenCalledWith('new_channel');
    });

    it('should claim token with local config if snapshot doc is missing in Firestore', () => {
        const pushSpy = vi.spyOn(syncManager, 'pushConfig').mockImplementation(() => Promise.resolve({ success: true }));
        syncManager._configManager = mockConfigManager;
        syncManager._token = 'test-token-uuid';

        const missingSnap = {
            exists: () => false
        };

        syncManager.handleSnapshot(missingSnap);
        expect(pushSpy).toHaveBeenCalledWith(mockConfigManager.config);
    });

    it('should still wire up dependencies when there is no sync URL param, so a later auto-provisioned token can subscribe', async () => {
        // Regression: start() used to assign _configManager/_sceneName/etc.
        // AFTER its early "no ?sync= param" return, so a fresh visitor who
        // saves without a sync token (auto-provisioning one afterward via
        // setSyncToken) would find these deps unset.
        const started = await syncManager.start({
            sceneName: 'my_scene',
            configManager: mockConfigManager,
            chatRenderer: mockChatRenderer,
            settingsPanel: mockSettingsPanel,
            chatConnection: mockChatConnection
        });

        expect(started).toBe(false);
        expect(syncManager._configManager).toBe(mockConfigManager);
        expect(syncManager._sceneName).toBe('my_scene');
        expect(syncManager._db).toBeNull();
    });

    it('should attempt to subscribe when setSyncToken is called even though _db is still null (auto-provision flow)', () => {
        // Regression: setSyncToken only resubscribed inside `if (this._db && this._token)`,
        // but _db is only ever assigned inside start(), which no-ops without a ?sync= param.
        // So an auto-provisioned token (assigned after Save with no prior sync param) never
        // opened a Firestore subscription until the page was reloaded.
        expect(syncManager._db).toBeNull();
        const ensureSpy = vi.spyOn(syncManager, '_ensureSubscribed').mockResolvedValue(true);

        syncManager.setSyncToken('brand-new-token');

        expect(syncManager._token).toBe('brand-new-token');
        expect(ensureSpy).toHaveBeenCalledTimes(1);
    });

    it('should not attempt to subscribe when setSyncToken is cleared to an empty token', () => {
        const ensureSpy = vi.spyOn(syncManager, '_ensureSubscribed').mockResolvedValue(true);
        syncManager.setSyncToken('');
        expect(ensureSpy).not.toHaveBeenCalled();
    });

    it('should degrade silently (not throw) when Firestore subscription setup fails', async () => {
        // _ensureSubscribed dynamically imports Firebase from a CDN URL; in the
        // test environment (and on network failure in production) that import
        // rejects. It must resolve to false rather than propagate.
        syncManager._token = 'some-token';
        await expect(syncManager._ensureSubscribed()).resolves.toBe(false);
        expect(syncManager._unsubscribe).toBeNull();
    });

    it('should push config payload to backend via fetch PUT', async () => {
        syncManager._token = '12345678-1234-4321-8765-1234567890ab';
        
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, token: syncManager._token })
        });

        const testConfig = { theme: 'pink', fontSize: 16 };
        const result = await syncManager.pushConfig(testConfig);

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/scene-config/12345678-1234-4321-8765-1234567890ab'),
            expect.objectContaining({
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            })
        );
    });
});
