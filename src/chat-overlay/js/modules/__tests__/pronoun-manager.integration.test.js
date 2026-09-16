import { describe, it, expect } from 'vitest';
import { PronounManager } from '../pronoun-manager.js';

describe('PronounManager - Live API Integration', () => {
    // These tests hit the real Alejo v1 API to ensure the API contract hasn't changed.
    // They should run quickly but might fail if Alejo API goes down.

    it('should successfully fetch the pronouns dictionary from the live API', async () => {
        const manager = new PronounManager();
        await manager.loadDefinitions();

        expect(manager.hasLoadedDefinitions).toBe(true);
        expect(manager.definitions.size).toBeGreaterThan(0);

        // Ensure common pronouns exist with subject/object forms
        expect(manager.definitions.get('hehim')).toMatchObject({ subject: 'He', object: 'Him' });
        expect(manager.definitions.get('sheher')).toMatchObject({ subject: 'She', object: 'Her' });
        expect(manager.definitions.get('theythem')).toMatchObject({ subject: 'They', object: 'Them' });

        expect(manager.formatDisplay('hehim')).toBe('He/Him');
        expect(manager.formatDisplay('sheher', 'theythem')).toBe('She/They');
    });

    it('should fetch null for a known non-existent user', async () => {
        const manager = new PronounManager();
        // A user that is virtually guaranteed to never set pronouns or exist
        const result = await manager.getUserPronoun('thisuserdoesnotexist12345');
        expect(result).toBeNull();
    });

    // Note: We don't test a "known user" with pronouns because users can change their
    // pronouns at any time, which would make the test flaky. We mainly want to ensure
    // the network request completes, parses correctly, and doesn't throw.
});
