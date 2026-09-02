import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('TwitchAuth Module', () => {
    let authModule;

    beforeEach(async () => {
        vi.resetModules();
        vi.restoreAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        global.fetch = vi.fn();
        authModule = await import('../twitch-auth.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getRedirectUri', () => {
        it('returns origin + pathname with no query/hash', () => {
            expect(authModule.getRedirectUri()).toBe(window.location.origin + window.location.pathname);
        });
    });

    describe('login', () => {
        it('stores CSRF state in sessionStorage and navigates with the correct params', () => {
            const navigate = vi.fn();
            authModule.login({ navigate });

            expect(navigate).toHaveBeenCalledTimes(1);
            const calledUrl = navigate.mock.calls[0][0];
            const url = new URL(calledUrl);

            expect(url.origin + url.pathname).toBe(authModule.AUTHORIZE_URL);
            expect(url.searchParams.get('response_type')).toBe('token');
            expect(url.searchParams.get('client_id')).toBe(authModule.TWITCH_CLIENT_ID);
            expect(url.searchParams.get('redirect_uri')).toBe(authModule.getRedirectUri());
            expect(url.searchParams.has('scope')).toBe(true);
            expect(url.searchParams.get('scope')).toBe('');
            expect(url.searchParams.get('force_verify')).toBe('false');

            const storedState = sessionStorage.getItem(authModule.STATE_KEY);
            expect(storedState).toBeTruthy();
            expect(url.searchParams.get('state')).toBe(storedState);
        });
    });

    describe('handleRedirect', () => {
        it('returns { status: "none" } and does not touch history when nothing is present', () => {
            const hist = { replaceState: vi.fn() };
            const loc = { hash: '', search: '', pathname: '/scene-creator.html' };

            const result = authModule.handleRedirect({ loc, hist });

            expect(result).toEqual({ status: 'none' });
            expect(hist.replaceState).not.toHaveBeenCalled();
        });

        it('stores AUTH_KEY and returns "ok" on matching state, and cleans the URL', () => {
            sessionStorage.setItem(authModule.STATE_KEY, 'abc-state');
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '#access_token=my-token-123&scope=&state=abc-state&token_type=bearer',
                search: '',
                pathname: '/scene-creator.html'
            };

            const result = authModule.handleRedirect({ loc, hist });

            expect(result).toEqual({ status: 'ok' });

            const stored = JSON.parse(localStorage.getItem(authModule.AUTH_KEY));
            expect(stored.accessToken).toBe('my-token-123');
            expect(typeof stored.obtainedAt).toBe('number');
            expect(stored.expiresAt).toBeNull();

            expect(hist.replaceState).toHaveBeenCalledTimes(1);
            const [, , newUrl] = hist.replaceState.mock.calls[0];
            expect(newUrl).toBe('/scene-creator.html');
            expect(newUrl).not.toContain('#');

            // state consumed
            expect(sessionStorage.getItem(authModule.STATE_KEY)).toBeNull();
        });

        it('returns "state_mismatch" and stores nothing when state does not match, but still cleans the URL', () => {
            sessionStorage.setItem(authModule.STATE_KEY, 'expected-state');
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '#access_token=my-token-123&scope=&state=wrong-state&token_type=bearer',
                search: '',
                pathname: '/scene-creator.html'
            };

            const result = authModule.handleRedirect({ loc, hist });

            expect(result.status).toBe('state_mismatch');
            expect(result.message).toBe('Sign-in could not be verified. Try again.');
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(hist.replaceState).toHaveBeenCalledTimes(1);
        });

        it('rejects a token when no login is in flight and the hash carries no state (null === null must not pass)', () => {
            sessionStorage.removeItem(authModule.STATE_KEY);
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '#access_token=injected-token&scope=&token_type=bearer',
                search: '',
                pathname: '/scene-creator.html'
            };

            const result = authModule.handleRedirect({ loc, hist });

            expect(result.status).toBe('state_mismatch');
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(hist.replaceState).toHaveBeenCalledTimes(1);
        });

        it('rejects a token that carries a state when no login is in flight', () => {
            sessionStorage.removeItem(authModule.STATE_KEY);
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '#access_token=injected-token&scope=&state=whatever&token_type=bearer',
                search: '',
                pathname: '/scene-creator.html'
            };

            expect(authModule.handleRedirect({ loc, hist }).status).toBe('state_mismatch');
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
        });

        it('returns "error" with the description on ?error=access_denied, and cleans the URL', () => {
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '',
                search: '?error=access_denied&error_description=The+user+denied&state=abc-state',
                pathname: '/scene-creator.html'
            };

            const result = authModule.handleRedirect({ loc, hist });

            expect(result.status).toBe('error');
            expect(result.message).toContain('The user denied');
            expect(result.message.startsWith("Sign-in didn't finish.")).toBe(true);

            expect(hist.replaceState).toHaveBeenCalledTimes(1);
            const [, , newUrl] = hist.replaceState.mock.calls[0];
            expect(newUrl).not.toContain('error');
            expect(newUrl).not.toContain('state');
        });

        it('preserves unrelated query params while stripping error/error_description/state', () => {
            const hist = { replaceState: vi.fn() };
            const loc = {
                hash: '',
                search: '?error=access_denied&error_description=nope&state=abc&foo=bar',
                pathname: '/scene-creator.html'
            };

            authModule.handleRedirect({ loc, hist });

            const [, , newUrl] = hist.replaceState.mock.calls[0];
            expect(newUrl).toContain('foo=bar');
            expect(newUrl).not.toContain('error');
            expect(newUrl).not.toContain('state=');
        });

        it('uses the default message when error_description is absent', () => {
            const hist = { replaceState: vi.fn() };
            const loc = { hash: '', search: '?error=access_denied', pathname: '/scene-creator.html' };

            const result = authModule.handleRedirect({ loc, hist });
            expect(result.status).toBe('error');
            expect(result.message).toBe("Sign-in didn't finish. Twitch sent no token. Try again.");
        });
    });

    describe('getAuthHeaders / getAccessToken / getCachedUser / clearSession', () => {
        it('returns empty headers when logged out', () => {
            expect(authModule.getAccessToken()).toBeNull();
            expect(authModule.getAuthHeaders()).toEqual({});
        });

        it('returns Bearer header when a token is stored', () => {
            localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: 'tok-1', obtainedAt: Date.now(), expiresAt: null }));
            expect(authModule.getAccessToken()).toBe('tok-1');
            expect(authModule.getAuthHeaders()).toEqual({ Authorization: 'Bearer tok-1' });
        });

        it('clearSession removes both AUTH_KEY and USER_KEY', () => {
            localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: 'tok-1' }));
            localStorage.setItem(authModule.USER_KEY, JSON.stringify({ id: '1', login: 'foo' }));
            authModule.clearSession();
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(localStorage.getItem(authModule.USER_KEY)).toBeNull();
        });

        it('getCachedUser returns null when nothing stored', () => {
            expect(authModule.getCachedUser()).toBeNull();
        });
    });

    describe('restoreSession', () => {
        function setToken(token = 'tok-1') {
            localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: token, obtainedAt: Date.now(), expiresAt: null }));
        }

        it('returns null and makes no fetch call when there is no token', async () => {
            const result = await authModule.restoreSession();
            expect(result).toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('validate 200 + users 200 -> returns full user, writes USER_KEY and expiresAt', async () => {
            setToken('tok-1');
            global.fetch
                .mockResolvedValueOnce({
                    status: 200,
                    ok: true,
                    json: async () => ({ client_id: authModule.TWITCH_CLIENT_ID, login: 'parfaitfair', user_id: '999', expires_in: 3600 })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: [{ id: '999', display_name: 'ParfaitFair', profile_image_url: 'https://example.com/a.png' }] })
                });

            const result = await authModule.restoreSession();

            expect(global.fetch).toHaveBeenNthCalledWith(1, authModule.VALIDATE_URL, {
                headers: { Authorization: 'OAuth tok-1' }
            });
            expect(global.fetch).toHaveBeenNthCalledWith(2, authModule.USERS_URL, {
                headers: { Authorization: 'Bearer tok-1', 'Client-Id': authModule.TWITCH_CLIENT_ID }
            });

            expect(result).toEqual({
                id: '999',
                login: 'parfaitfair',
                displayName: 'ParfaitFair',
                avatarUrl: 'https://example.com/a.png',
                cachedAt: expect.any(Number)
            });

            const storedUser = JSON.parse(localStorage.getItem(authModule.USER_KEY));
            expect(storedUser).toEqual(result);

            const storedAuth = JSON.parse(localStorage.getItem(authModule.AUTH_KEY));
            expect(storedAuth.expiresAt).toBeGreaterThan(Date.now());
        });

        it('validate 200 with wrong client_id -> clears session, returns null', async () => {
            setToken('tok-1');
            localStorage.setItem(authModule.USER_KEY, JSON.stringify({ id: '1' }));
            global.fetch.mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ client_id: 'someone-elses-app', login: 'parfaitfair', user_id: '999', expires_in: 3600 })
            });

            const result = await authModule.restoreSession();

            expect(result).toBeNull();
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(localStorage.getItem(authModule.USER_KEY)).toBeNull();
        });

        it('validate 401 -> clears both keys, returns null', async () => {
            setToken('tok-1');
            localStorage.setItem(authModule.USER_KEY, JSON.stringify({ id: '1' }));
            global.fetch.mockResolvedValueOnce({ status: 401, ok: false });

            const result = await authModule.restoreSession();

            expect(result).toBeNull();
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(localStorage.getItem(authModule.USER_KEY)).toBeNull();
        });

        it('validate throws (network error) -> returns cached user without logging out', async () => {
            setToken('tok-1');
            const cachedUser = { id: '999', login: 'parfaitfair', displayName: 'ParfaitFair', avatarUrl: null, cachedAt: 123 };
            localStorage.setItem(authModule.USER_KEY, JSON.stringify(cachedUser));
            global.fetch.mockRejectedValueOnce(new Error('network down'));

            const result = await authModule.restoreSession();

            expect(result).toEqual(cachedUser);
            // still logged in - AUTH_KEY untouched
            expect(authModule.getAccessToken()).toBe('tok-1');
        });

        it('users call fails -> falls back to login as displayName, avatarUrl null', async () => {
            setToken('tok-1');
            global.fetch
                .mockResolvedValueOnce({
                    status: 200,
                    ok: true,
                    json: async () => ({ client_id: authModule.TWITCH_CLIENT_ID, login: 'parfaitfair', user_id: '999', expires_in: 3600 })
                })
                .mockResolvedValueOnce({ ok: false, status: 500 });

            const result = await authModule.restoreSession();

            expect(result).toEqual({
                id: '999',
                login: 'parfaitfair',
                displayName: 'parfaitfair',
                avatarUrl: null,
                cachedAt: expect.any(Number)
            });
        });

        it('non-ok, non-401 validate response -> returns cached user (no logout)', async () => {
            setToken('tok-1');
            const cachedUser = { id: '999', login: 'parfaitfair', displayName: 'parfaitfair', avatarUrl: null, cachedAt: 5 };
            localStorage.setItem(authModule.USER_KEY, JSON.stringify(cachedUser));
            global.fetch.mockResolvedValueOnce({ status: 500, ok: false });

            const result = await authModule.restoreSession();
            expect(result).toEqual(cachedUser);
            expect(authModule.getAccessToken()).toBe('tok-1');
        });
    });

    describe('logout', () => {
        it('POSTs form-encoded client_id+token to REVOKE_URL and clears keys', async () => {
            localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: 'tok-1', obtainedAt: Date.now(), expiresAt: null }));
            localStorage.setItem(authModule.USER_KEY, JSON.stringify({ id: '1' }));
            global.fetch.mockResolvedValueOnce({ ok: true });

            await authModule.logout();

            expect(global.fetch).toHaveBeenCalledWith(authModule.REVOKE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ client_id: authModule.TWITCH_CLIENT_ID, token: 'tok-1' }).toString()
            });
            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(localStorage.getItem(authModule.USER_KEY)).toBeNull();
        });

        it('clears keys even when fetch rejects, and never throws', async () => {
            localStorage.setItem(authModule.AUTH_KEY, JSON.stringify({ accessToken: 'tok-1', obtainedAt: Date.now(), expiresAt: null }));
            localStorage.setItem(authModule.USER_KEY, JSON.stringify({ id: '1' }));
            global.fetch.mockRejectedValueOnce(new Error('network down'));

            await expect(authModule.logout()).resolves.toBeUndefined();

            expect(localStorage.getItem(authModule.AUTH_KEY)).toBeNull();
            expect(localStorage.getItem(authModule.USER_KEY)).toBeNull();
        });

        it('is a no-op fetch-wise (but still clears) when there was no token', async () => {
            await authModule.logout();
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });
});
