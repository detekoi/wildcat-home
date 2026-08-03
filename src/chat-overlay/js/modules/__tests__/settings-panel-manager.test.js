import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanelManager } from '../settings-panel-manager.js';
import { SceneSyncManager } from '../scene-sync-manager.js';
import { ConfigManager } from '../config-manager.js';

// Mock the Firebase ESM CDN imports so a subscription can actually SUCCEED in this
// test environment (there is no real network path to gstatic.com here). Scoped to
// this file only via vi.mock's per-module-file semantics — scene-sync-manager.test.js
// relies on the REAL (failing, no-network) dynamic import to exercise its own
// degrade-silently-on-failure path, and must not be affected by this mock.
vi.mock('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', () => ({
    getApps: vi.fn(() => []),
    initializeApp: vi.fn((config) => ({ name: '[DEFAULT]', options: config }))
}));

vi.mock('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js', () => ({
    initializeFirestore: vi.fn(() => ({ _mock: 'firestore' })),
    getFirestore: vi.fn(() => ({ _mock: 'firestore' })),
    doc: vi.fn((db, collection, id) => ({ db, collection, id })),
    onSnapshot: vi.fn((docRef, onNext) => {
        // Real Firestore always delivers an initial snapshot immediately on attach.
        onNext({ exists: () => false });
        return vi.fn(); // unsubscribe function
    })
}));

describe('SettingsPanelManager - auto-provisioned sync token ends with a live subscription', () => {
    // Regression: a fresh visitor who hits Save on chat.html with no
    // ?sync= param used to get a working PUT to the proxy
    // but the ORIGINATING tab never subscribed to Firestore, so it needed a page reload
    // to see live edits made elsewhere. start() no-ops (by design) when there's no
    // ?sync= param, so the fix has to live in the auto-provision paths themselves.
    let configManager, sceneSyncManager, settingsPanel;
    let mockChatRenderer, mockChatConnection, mockBadgeManager, mockFontManager, mockThemeManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        localStorage.clear();
        // saveConfiguration() pushes a ?sync=...&scene=... param onto the URL
        // via history.replaceState, which persists across tests in jsdom. Reset it so
        // every test starts from a clean "no ?sync= param" URL, same as a fresh visitor.
        window.history.replaceState(null, '', '/');

        configManager = new ConfigManager();
        sceneSyncManager = new SceneSyncManager();

        mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn(), config: {} };
        mockChatConnection = {
            getTwitchChannel: vi.fn(() => ''),
            getYouTubeTarget: vi.fn(() => ''),
            isTwitchConnected: vi.fn(() => false),
            isYouTubeConnected: vi.fn(() => false),
            currentBroadcasterId: null
        };
        mockBadgeManager = { config: {}, fetchGlobalBadges: vi.fn((cb) => cb && cb()), fetchChannelBadges: vi.fn() };
        mockFontManager = { getCurrentFontValue: vi.fn(() => "'Inter', sans-serif"), syncToConfig: vi.fn(), updateFontDisplay: vi.fn() };
        mockThemeManager = { lastAppliedThemeValue: 'default', highlightActiveColorButtons: vi.fn(), updateThemePreview: vi.fn() };

        settingsPanel = new SettingsPanelManager({
            configManager, chatRenderer: mockChatRenderer, chatConnection: mockChatConnection,
            badgeManager: mockBadgeManager, fontManager: mockFontManager, themeManager: mockThemeManager,
            sceneSyncManager, domRefs: {}
        });

        global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

        // Mirror chat.js's real startup: start() runs with no ?sync= param, so it
        // no-ops (Rule #1) but still wires up dependencies, same as the live app.
        const started = await sceneSyncManager.start({
            sceneName: 'default', configManager, chatRenderer: mockChatRenderer, chatConnection: mockChatConnection
        });
        expect(started).toBe(false);
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('preserves the zero-cost rule: no save/copy means Firebase is never loaded', async () => {
        const { onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        expect(sceneSyncManager._db).toBeNull();
        expect(sceneSyncManager.syncToken).toBeNull();
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('saveConfiguration() auto-provisions a token and ends with an active Firestore subscription', async () => {
        expect(sceneSyncManager._db).toBeNull();
        expect(sceneSyncManager.syncToken).toBeNull();

        settingsPanel.saveConfiguration();

        // setSyncToken()'s _ensureSubscribed() is fire-and-forget (async); wait for it
        // to actually finish subscribing rather than assuming a fixed timing.
        await vi.waitFor(() => {
            expect(sceneSyncManager._db).not.toBeNull();
            expect(typeof sceneSyncManager._unsubscribe).toBe('function');
        });

        expect(sceneSyncManager.syncToken).not.toBeNull();
    });


    it('does not re-provision or drop the subscription when a token already exists', async () => {
        settingsPanel.saveConfiguration();
        await vi.waitFor(() => {
            expect(typeof sceneSyncManager._unsubscribe).toBe('function');
        });
        const tokenAfterFirstSave = sceneSyncManager.syncToken;

        settingsPanel.saveConfiguration();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(sceneSyncManager.syncToken).toBe(tokenAfterFirstSave);
        expect(typeof sceneSyncManager._unsubscribe).toBe('function');
    });

    it('preserves preChromaKeyOpacity in config when saveConfiguration is called', () => {
        configManager.config.chromaKey = true;
        configManager.config.preChromaKeyOpacity = 0.85;

        settingsPanel.saveConfiguration();

        expect(configManager.config.chromaKey).toBe(true);
        expect(configManager.config.preChromaKeyOpacity).toBe(0.85);
    });

    it('auto-provisions a UUID-shaped sync token the proxy will actually accept', async () => {
        // The old fallback minted `sync-${Date.now()}` when crypto.randomUUID was
        // missing, which validateToken rejects — so the tab synced to a token that
        // could never persist. The shape has to hold on the fallback path too.
        const original = globalThis.crypto.randomUUID;
        Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });

        try {
            settingsPanel.saveConfiguration();
            await vi.waitFor(() => expect(sceneSyncManager.syncToken).not.toBeNull());

            expect(sceneSyncManager.syncToken).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        } finally {
            Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
        }
    });
});

describe('SettingsPanelManager - readPanelConfig reads live DOM state', () => {
    // The colour inputs only write CSS custom properties as you edit
    // (chat-event-bindings.js syncHexInputAndSwatch); nothing reaches
    // configManager.config until a save. Anything built from the stored config
    // would therefore capture the PREVIOUS colours — which is exactly the trap
    // "save current settings as a preset" would otherwise fall into.
    let configManager, settingsPanel, textColorHex;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<input type="text" id="text-color-hex">';
        textColorHex = document.getElementById('text-color-hex');

        configManager = new ConfigManager();
        configManager.config.textColor = '#000000';

        settingsPanel = new SettingsPanelManager({
            configManager,
            chatRenderer: { addSystemMessage: vi.fn(), addChatMessage: vi.fn(), config: {} },
            chatConnection: {
                getTwitchChannel: vi.fn(() => ''), getYouTubeTarget: vi.fn(() => ''),
                isTwitchConnected: vi.fn(() => false), isYouTubeConnected: vi.fn(() => false),
                currentBroadcasterId: null
            },
            badgeManager: { config: {}, fetchGlobalBadges: vi.fn(), fetchChannelBadges: vi.fn() },
            fontManager: { getCurrentFontValue: vi.fn(() => "'Inter', sans-serif") },
            themeManager: { lastAppliedThemeValue: 'default' },
            domRefs: { textColorHex }
        });
    });

    it('takes the colour from the DOM input, not the stale stored config', () => {
        textColorHex.value = '#abcdef';

        const config = settingsPanel.readPanelConfig();

        expect(config.textColor).toBe('#abcdef');
        expect(configManager.config.textColor).toBe('#000000'); // untouched: read is side-effect free
    });

    it('falls back to the stored value when the input is empty', () => {
        textColorHex.value = '';

        expect(settingsPanel.readPanelConfig().textColor).toBe('#000000');
    });
});
