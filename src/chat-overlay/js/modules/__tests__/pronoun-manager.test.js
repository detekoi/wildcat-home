import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PronounManager } from '../pronoun-manager.js';

describe('PronounManager - SSRF Mitigations', () => {
    let pronounManager;

    beforeEach(() => {
        pronounManager = new PronounManager();
        // Mock global fetch
        global.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ pronoun_id: 'theythem' }])
        }));
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
        const result = await pronounManager.getUserPronoun('detekoi');
        expect(global.fetch).toHaveBeenCalled();
        expect(global.fetch.mock.calls[0][0]).toContain('detekoi');
    });

    it('should return null and NOT fetch for invalid/malicious usernames', async () => {
        const result = await pronounManager.getUserPronoun('../admin');
        expect(result).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('getPronounDisplay should also reject invalid usernames synchronously', () => {
        pronounManager.userPronounsCache.set('../admin', 'hehim'); // Pre-fill cache 
        const result = pronounManager.getPronounDisplay('../admin');
        expect(result).toBeNull(); // Should still be rejected by the validation guard
    });
});
