import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock scene-sync-manager before importing theme-library-client
vi.mock('../scene-sync-manager.js', () => ({
    getProxyBaseUrl: vi.fn(() => 'https://mock-proxy.example.com')
}));

describe('ThemeLibraryClient Module', () => {
    let clientModule;

    beforeEach(async () => {
        vi.resetModules();
        vi.restoreAllMocks();
        localStorage.clear();
        global.fetch = vi.fn();

        // Dynamically re-import the module fresh for each test to clear module-level state
        clientModule = await import('../theme-library-client.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getLibraryToken', () => {
        it('should generate, store, and return a UUID v4 token if non-existent in localStorage', () => {
            const token = clientModule.getLibraryToken();

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            // UUID v4 format regex
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(token).toMatch(uuidV4Regex);

            expect(localStorage.getItem('themeLibraryToken')).toBe(token);
        });

        it('should return the token stored in localStorage if present', () => {
            const preExistingToken = '12345678-1234-4234-8234-123456789abc';
            localStorage.setItem('themeLibraryToken', preExistingToken);

            const token = clientModule.getLibraryToken();
            expect(token).toBe(preExistingToken);
        });

        it('should generate a valid UUID v4 string when crypto.randomUUID is not available', () => {
            const originalRandomUUID = crypto.randomUUID;
            try {
                // @ts-ignore
                delete crypto.randomUUID;

                const token = clientModule.getLibraryToken();
                const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                expect(token).toMatch(uuidV4Regex);
            } finally {
                crypto.randomUUID = originalRandomUUID;
            }
        });

        it('should fall back to an in-memory token gracefully if localStorage throws an error', () => {
            const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('SecurityError: Access to localStorage is denied');
            });

            const token = clientModule.getLibraryToken();
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(getItemSpy).toHaveBeenCalled();
        });
    });

    describe('getCachedThemes', () => {
        it('should return an empty array if generatedThemes is missing or empty', () => {
            expect(clientModule.getCachedThemes()).toEqual([]);
        });

        it('should return parsed themes array from localStorage', () => {
            const sampleThemes = [
                { name: 'Custom Theme 1', value: 'custom-1', isGenerated: true }
            ];
            localStorage.setItem('generatedThemes', JSON.stringify(sampleThemes));

            expect(clientModule.getCachedThemes()).toEqual(sampleThemes);
        });

        it('should return an empty array if generatedThemes contains malformed JSON', () => {
            localStorage.setItem('generatedThemes', '{ invalid json: true }');
            expect(clientModule.getCachedThemes()).toEqual([]);
        });

        it('should return an empty array if generatedThemes parses to a non-array', () => {
            localStorage.setItem('generatedThemes', JSON.stringify({ notAnArray: true }));
            expect(clientModule.getCachedThemes()).toEqual([]);
        });
    });

    describe('addTheme (Envelope Unwrapping)', () => {
        it('should send POST request and unwrap { success, theme } envelope to return data.theme', async () => {
            const token = clientModule.getLibraryToken();
            const inputTheme = { name: 'Neon Glow', value: 'neon-glow', bgColor: '#000000' };
            const serverTheme = { ...inputTheme, id: 'theme-doc-123', backgroundImage: 'https://storage.googleapis.com/bucket/img.png' };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, theme: serverTheme })
            });

            const result = await clientModule.addTheme(inputTheme);

            expect(global.fetch).toHaveBeenCalledWith(
                `https://mock-proxy.example.com/theme-library/${token}/themes`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ theme: inputTheme })
                }
            );

            // Crucial assertion: unwrap envelope so caller receives serverTheme, not { success, theme } wrapper
            expect(result).toEqual(serverTheme);
            expect(result).not.toHaveProperty('success');
        });

        it('should return null if the response is not OK', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const result = await clientModule.addTheme({ name: 'Failing Theme' });
            expect(result).toBeNull();
        });

        it('should return null if fetch network call throws an error', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await clientModule.addTheme({ name: 'Failing Theme' });
            expect(result).toBeNull();
        });
    });

    describe('fetchThemes & Legacy Migration', () => {
        it('should fetch themes from proxy, update offline cache, and return themes array', async () => {
            const token = clientModule.getLibraryToken();
            const cloudThemes = [
                { id: 't1', name: 'Cloud Theme 1', value: 'ct-1' },
                { id: 't2', name: 'Cloud Theme 2', value: 'ct-2' }
            ];

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ themes: cloudThemes })
            });

            const result = await clientModule.fetchThemes();

            expect(global.fetch).toHaveBeenCalledWith(`https://mock-proxy.example.com/theme-library/${token}`);
            expect(result).toEqual(cloudThemes);
            expect(JSON.parse(localStorage.getItem('generatedThemes'))).toEqual(cloudThemes);
        });

        it('should degrade gracefully to offline cache if fetchThemes fails', async () => {
            const cachedThemes = [{ name: 'Offline Theme', value: 'off-1' }];
            localStorage.setItem('generatedThemes', JSON.stringify(cachedThemes));

            global.fetch.mockRejectedValueOnce(new Error('Network offline'));

            const result = await clientModule.fetchThemes();
            expect(result).toEqual(cachedThemes);
        });

        it('should migrate legacy offline themes to cloud if cloud themes list is empty', async () => {
            const token = clientModule.getLibraryToken();
            const legacyTheme1 = { name: 'Legacy Theme 1', value: 'leg-1', isGenerated: true };
            const legacyTheme2 = { name: 'Legacy Theme 2', value: 'leg-2', isGenerated: true };
            localStorage.setItem('generatedThemes', JSON.stringify([legacyTheme1, legacyTheme2]));

            // 1st fetch: fetchThemes returns empty themes array from cloud
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ themes: [] })
            });

            // 2nd fetch (migration push for legacyTheme2 - reversed order)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, theme: { ...legacyTheme2, id: 'cloud-leg-2' } })
            });

            // 3rd fetch (migration push for legacyTheme1)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, theme: { ...legacyTheme1, id: 'cloud-leg-1' } })
            });

            const result = await clientModule.fetchThemes();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('cloud-leg-1');
            expect(result[1].id).toBe('cloud-leg-2');
        });

        it('should not attempt legacy migration more than once (migrationAttempted flag)', async () => {
            const token = clientModule.getLibraryToken();
            const legacyTheme = { name: 'Legacy Theme', value: 'leg-1', isGenerated: true };
            localStorage.setItem('generatedThemes', JSON.stringify([legacyTheme]));

            // First call: empty cloud -> triggers migration failure
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ themes: [] })
            });
            global.fetch.mockRejectedValueOnce(new Error('Push error')); // addTheme fails

            await clientModule.fetchThemes();

            // Second call: empty cloud -> migrationAttempted is true, should NOT call addTheme
            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ themes: [] })
            });

            const fetchCallsBefore = global.fetch.mock.calls.length;
            const result2 = await clientModule.fetchThemes();

            // Only 1 new fetch call (for fetchThemes itself, none for addTheme)
            expect(global.fetch.mock.calls.length).toBe(fetchCallsBefore + 1);
            expect(result2).toEqual([]);
        });
    });

    describe('deleteTheme', () => {
        it('should send DELETE request for given theme ID and return true on success', async () => {
            const token = clientModule.getLibraryToken();
            const themeId = 'theme/special-id';

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200
            });

            const result = await clientModule.deleteTheme(themeId);

            expect(global.fetch).toHaveBeenCalledWith(
                `https://mock-proxy.example.com/theme-library/${token}/themes/${encodeURIComponent(themeId)}`,
                { method: 'DELETE' }
            );
            expect(result).toBe(true);
        });

        it('should return false if ID is missing', async () => {
            const result = await clientModule.deleteTheme('');
            expect(result).toBe(false);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should return false if DELETE HTTP request fails', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            const result = await clientModule.deleteTheme('non-existent-id');
            expect(result).toBe(false);
        });
    });

    describe('subscribe', () => {
        it('should return an unsubscribe function and not throw when invoked', () => {
            const cb = vi.fn();
            const unsubscribe = clientModule.subscribe(cb);

            expect(typeof unsubscribe).toBe('function');
            expect(() => unsubscribe()).not.toThrow();
        });
    });
});
