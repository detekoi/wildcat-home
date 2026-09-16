import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PronounManager } from '../pronoun-manager.js';

const DEFINITIONS = {
    hehim: { name: 'hehim', subject: 'He', object: 'Him', singular: false },
    sheher: { name: 'sheher', subject: 'She', object: 'Her', singular: false },
    theythem: { name: 'theythem', subject: 'They', object: 'Them', singular: false },
    any: { name: 'any', subject: 'Any', object: 'Any', singular: true }
};

function mockFetch(users) {
    return vi.fn((url) => {
        if (url.endsWith('/pronouns')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(DEFINITIONS) });
        }
        const login = url.split('/users/')[1];
        const user = users[login];
        if (!user) {
            return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ channel_id: '1', channel_login: login, ...user })
        });
    });
}

describe('PronounManager - SSRF Mitigations', () => {
    let pronounManager;

    beforeEach(() => {
        pronounManager = new PronounManager();
        global.fetch = mockFetch({ detekoi: { pronoun_id: 'theythem', alt_pronoun_id: null } });
    });

    it('should validate normal alphanumeric Twitch usernames', () => {
        expect(pronounManager.isValidUsername('detekoi')).toBe(true);
        expect(pronounManager.isValidUsername('wildcat_123')).toBe(true);
        expect(pronounManager.isValidUsername('NINJA')).toBe(true);
        expect(pronounManager.isValidUsername('123456')).toBe(true);
    });

    it('should reject usernames containing path traversal or invalid characters (SSRF vectors)', () => {
        // Path traversal
        expect(pronounManager.isValidUsername('../admin/users')).toBe(false);
        expect(pronounManager.isValidUsername('..%2F..%2Fetc%2Fpasswd')).toBe(false);
        // Special characters / URL injection
        expect(pronounManager.isValidUsername('user@domain.com')).toBe(false);
        expect(pronounManager.isValidUsername('user name')).toBe(false);
        expect(pronounManager.isValidUsername('user/xyz')).toBe(false);
        expect(pronounManager.isValidUsername('user?query=1')).toBe(false);
    });

    it('should allow fetching for valid usernames', async () => {
        await pronounManager.getUserPronoun('detekoi');
        expect(global.fetch).toHaveBeenCalled();
        expect(global.fetch.mock.calls[0][0]).toContain('detekoi');
    });

    it('should return null and NOT fetch for invalid/malicious usernames', async () => {
        const result = await pronounManager.getUserPronoun('../admin');
        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('getPronounDisplay should also reject invalid usernames synchronously', () => {
        pronounManager.userPronounsCache.set('../admin', { pronounId: 'hehim', altPronounId: null }); // Pre-fill cache
        const result = pronounManager.getPronounDisplay('../admin');
        expect(result).toBeNull(); // Should still be rejected by the validation guard
    });
});

describe('PronounManager - Display formatting', () => {
    let pronounManager;

    beforeEach(() => {
        pronounManager = new PronounManager();
        global.fetch = mockFetch({
            parfaitfair: { pronoun_id: 'hehim', alt_pronoun_id: null },
            coconutmelonss: { pronoun_id: 'sheher', alt_pronoun_id: 'theythem' },
            anyone: { pronoun_id: 'any', alt_pronoun_id: null },
            newbie: { pronoun_id: 'brandnew', alt_pronoun_id: null }
        });
    });

    it('loads v1 definitions keyed by ID and fills the legacy pronounsMap', async () => {
        await pronounManager.loadDefinitions();
        expect(pronounManager.hasLoadedDefinitions).toBe(true);
        expect(pronounManager.definitions.get('sheher')).toEqual({ subject: 'She', object: 'Her', singular: false });
        expect(pronounManager.pronounsMap.get('hehim')).toBe('He/Him');
    });

    it('only requests the definitions list once across concurrent callers', async () => {
        await Promise.all([
            pronounManager.getUserPronoun('parfaitfair'),
            pronounManager.getUserPronoun('coconutmelonss')
        ]);
        const definitionCalls = global.fetch.mock.calls.filter(([url]) => url.endsWith('/pronouns'));
        expect(definitionCalls).toHaveLength(1);
    });

    it('renders a primary-only pronoun as Subject/Object', async () => {
        expect(await pronounManager.getUserPronoun('parfaitfair')).toBe('He/Him');
    });

    it('renders primary + alternate as Subject/AltSubject (the She/They case)', async () => {
        expect(await pronounManager.getUserPronoun('coconutmelonss')).toBe('She/They');
        // Never the raw combined ID the legacy API used to emit
        expect(await pronounManager.getUserPronoun('coconutmelonss')).not.toMatch(/shethem/i);
    });

    it('renders singular pronouns without a slash', async () => {
        expect(await pronounManager.getUserPronoun('anyone')).toBe('Any');
    });

    it('falls back to the raw ID when the definition is unknown', async () => {
        expect(await pronounManager.getUserPronoun('newbie')).toBe('brandnew');
    });

    it('caches null for users without pronouns and does not refetch', async () => {
        expect(await pronounManager.getUserPronoun('nobody')).toBeNull();
        expect(await pronounManager.getUserPronoun('nobody')).toBeNull();
        const userCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/users/nobody'));
        expect(userCalls).toHaveLength(1);
        expect(pronounManager.getPronounDisplay('nobody')).toBeNull();
    });

    it('getPronounDisplay returns the composed string synchronously once cached', async () => {
        expect(pronounManager.getPronounDisplay('coconutmelonss')).toBeNull();
        await pronounManager.getUserPronoun('CoconutMelonss');
        expect(pronounManager.getPronounDisplay('coconutmelonss')).toBe('She/They');
    });
});
