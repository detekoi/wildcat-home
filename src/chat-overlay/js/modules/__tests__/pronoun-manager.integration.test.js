import { describe, it, expect } from 'vitest';
import { PronounManager } from '../pronoun-manager.js';

describe('PronounManager - Live API Integration', () => {
    // These tests hit the real Alejo API to ensure the API contract hasn't changed.
    // They should run quickly but might fail if Alejo API goes down.
    
    it('should successfully fetch the pronouns dictionary from the live API', async () => {
        const manager = new PronounManager();
        await manager.loadDefinitions();
        
        expect(manager.hasLoadedDefinitions).toBe(true);
        expect(manager.pronounsMap.size).toBeGreaterThan(0);
        
        // Ensure common pronouns exist
        expect(manager.pronounsMap.get('hehim')).toBe('He/Him');
        expect(manager.pronounsMap.get('sheher')).toBe('She/Her');
        expect(manager.pronounsMap.get('theythem')).toBe('They/Them');
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
