import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock scene-sync-manager before importing account-client, the way
// theme-library-client.test.js does.
vi.mock('../scene-sync-manager.js', () => ({
    getProxyBaseUrl: vi.fn(() => 'https://mock-proxy.example.com')
}));

describe('AccountClient Module', () => {
    let clientModule;
    let authModule;

    beforeEach(async () => {
        vi.resetModules();
        vi.restoreAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        global.fetch = vi.fn();

        authModule = await import('../twitch-auth.js');
        clientModule = await import('../account-client.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    function signIn(token = 'tok-1') {
        localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: token, obtainedAt: Date.now(), expiresAt: null }));
    }

    describe('fetchAccount', () => {
        it('GETs {base}/account with the Authorization header and unwraps the response', async () => {
            signIn('tok-1');
            const payload = { user: { id: '1', login: 'parfaitfair' }, scenes: [], sceneOrder: [] };
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

            const result = await clientModule.fetchAccount();

            expect(global.fetch).toHaveBeenCalledWith('https://mock-proxy.example.com/account', {
                headers: { Authorization: 'Bearer tok-1' }
            });
            expect(result).toEqual(payload);
        });

        it('returns null on non-ok response', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
            const result = await clientModule.fetchAccount();
            expect(result).toBeNull();
        });

        it('returns null when fetch throws', async () => {
            global.fetch.mockRejectedValueOnce(new Error('network down'));
            const result = await clientModule.fetchAccount();
            expect(result).toBeNull();
        });

        it('dispatches AUTH_EXPIRED_EVENT and returns null on 401', async () => {
            const listener = vi.fn();
            window.addEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);

            global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await clientModule.fetchAccount();

            expect(result).toBeNull();
            expect(listener).toHaveBeenCalledTimes(1);
            window.removeEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);
        });
    });

    describe('linkScenes', () => {
        it('POSTs {base}/account/scenes with body and Authorization header, unwraps the response', async () => {
            signIn('tok-1');
            const scenes = [{ token: 'a-token', name: 'Scene A' }];
            const responsePayload = { linked: scenes, skipped: [], existing: [], rejected: [], sceneOrder: ['a-token'] };
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => responsePayload });

            const result = await clientModule.linkScenes(scenes, { force: true });

            expect(global.fetch).toHaveBeenCalledWith('https://mock-proxy.example.com/account/scenes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-1' },
                body: JSON.stringify({ scenes, force: true })
            });
            expect(result).toEqual(responsePayload);
        });

        it('defaults force to false', async () => {
            signIn('tok-1');
            const scenes = [{ token: 'a-token', name: 'Scene A' }];
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

            await clientModule.linkScenes(scenes);

            expect(global.fetch).toHaveBeenCalledWith('https://mock-proxy.example.com/account/scenes', expect.objectContaining({
                body: JSON.stringify({ scenes, force: false })
            }));
        });

        it('makes no request and resolves immediately for an empty scenes array', async () => {
            const result = await clientModule.linkScenes([]);
            expect(global.fetch).not.toHaveBeenCalled();
            expect(result).toEqual({ linked: [], skipped: [], existing: [], rejected: [], sceneOrder: null });
        });

        it('returns null on non-ok response', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
            const result = await clientModule.linkScenes([{ token: 'x', name: 'n' }]);
            expect(result).toBeNull();
        });

        it('returns null when fetch throws', async () => {
            global.fetch.mockRejectedValueOnce(new Error('network down'));
            const result = await clientModule.linkScenes([{ token: 'x', name: 'n' }]);
            expect(result).toBeNull();
        });

        it('dispatches AUTH_EXPIRED_EVENT and returns null on 401', async () => {
            const listener = vi.fn();
            window.addEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);

            global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await clientModule.linkScenes([{ token: 'x', name: 'n' }]);

            expect(result).toBeNull();
            expect(listener).toHaveBeenCalledTimes(1);
            window.removeEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);
        });
    });

    describe('unlinkScene', () => {
        it('DELETEs {base}/account/scenes/{encoded token} with Authorization header, returns res.ok', async () => {
            signIn('tok-1');
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await clientModule.unlinkScene('token/with-special chars');

            expect(global.fetch).toHaveBeenCalledWith(
                `https://mock-proxy.example.com/account/scenes/${encodeURIComponent('token/with-special chars')}`,
                { method: 'DELETE', headers: { Authorization: 'Bearer tok-1' } }
            );
            expect(result).toBe(true);
        });

        it('returns false on non-ok response', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const result = await clientModule.unlinkScene('some-token');
            expect(result).toBe(false);
        });

        it('returns false when fetch throws', async () => {
            global.fetch.mockRejectedValueOnce(new Error('network down'));
            const result = await clientModule.unlinkScene('some-token');
            expect(result).toBe(false);
        });

        it('dispatches AUTH_EXPIRED_EVENT and returns false on 401', async () => {
            const listener = vi.fn();
            window.addEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);

            global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await clientModule.unlinkScene('some-token');

            expect(result).toBe(false);
            expect(listener).toHaveBeenCalledTimes(1);
            window.removeEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);
        });
    });

    describe('setSceneOrder', () => {
        it('PUTs {base}/account/scene-order with body and Authorization header, returns data.sceneOrder', async () => {
            signIn('tok-1');
            const sceneOrder = ['tok-a', 'tok-b'];
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ sceneOrder }) });

            const result = await clientModule.setSceneOrder(sceneOrder);

            expect(global.fetch).toHaveBeenCalledWith('https://mock-proxy.example.com/account/scene-order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-1' },
                body: JSON.stringify({ sceneOrder })
            });
            expect(result).toEqual(sceneOrder);
        });

        it('returns null on non-ok response', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
            const result = await clientModule.setSceneOrder(['a']);
            expect(result).toBeNull();
        });

        it('returns null when fetch throws', async () => {
            global.fetch.mockRejectedValueOnce(new Error('network down'));
            const result = await clientModule.setSceneOrder(['a']);
            expect(result).toBeNull();
        });

        it('dispatches AUTH_EXPIRED_EVENT and returns null on 401', async () => {
            const listener = vi.fn();
            window.addEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);

            global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
            const result = await clientModule.setSceneOrder(['a']);

            expect(result).toBeNull();
            expect(listener).toHaveBeenCalledTimes(1);
            window.removeEventListener(clientModule.AUTH_EXPIRED_EVENT, listener);
        });
    });

    describe('logged-out state', () => {
        it('omits Authorization header when not signed in', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
            await clientModule.fetchAccount();
            expect(global.fetch).toHaveBeenCalledWith('https://mock-proxy.example.com/account', { headers: {} });
        });
    });
});
