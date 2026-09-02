import { describe, it, expect } from 'vitest';
import { mergeSceneOrder } from '../account-merge.js';

describe('mergeSceneOrder', () => {
    it('orders local ids to match the account token order first', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a'],
            ['local-2', 'tok-b'],
            ['local-3', 'tok-c']
        ]);
        const result = mergeSceneOrder(['tok-c', 'tok-a', 'tok-b'], ['local-1', 'local-2', 'local-3'], tokenById);

        expect(result.order).toEqual(['local-3', 'local-1', 'local-2']);
        expect(result.changed).toBe(false);
    });

    it('appends local-only scenes (with a token not in the account order) after account-ordered ones', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a'],
            ['local-2', 'tok-new']
        ]);
        const result = mergeSceneOrder(['tok-a'], ['local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-1', 'local-2']);
        expect(result.changed).toBe(true); // token sequence ['tok-a','tok-new'] !== ['tok-a']
    });

    it('places tokenless (never-synced) local ids last, after account-ordered and local-only-with-token ids', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a'],
            ['local-2', 'tok-b']
            // local-3 has no token
        ]);
        const result = mergeSceneOrder(['tok-b'], ['local-3', 'local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-2', 'local-1', 'local-3']);
        expect(result.changed).toBe(true); // ['tok-b','tok-a'] !== ['tok-b']
    });

    it('changed is false when the merged token sequence exactly equals the account order', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a'],
            ['local-2', 'tok-b']
        ]);
        const result = mergeSceneOrder(['tok-a', 'tok-b'], ['local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-1', 'local-2']);
        expect(result.changed).toBe(false);
    });

    it('changed is true when the order differs even with the same set of tokens', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a'],
            ['local-2', 'tok-b']
        ]);
        const result = mergeSceneOrder(['tok-b', 'tok-a'], ['local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-2', 'local-1']);
        expect(result.changed).toBe(false); // resulting token sequence ['tok-b','tok-a'] === accountOrderTokens
    });

    it('skips account tokens that have no matching local id', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a']
        ]);
        const result = mergeSceneOrder(['tok-ghost', 'tok-a'], ['local-1'], tokenById);

        expect(result.order).toEqual(['local-1']);
        expect(result.changed).toBe(true); // ['tok-a'] !== ['tok-ghost','tok-a']
    });

    it('tolerates a plain object for tokenById', () => {
        const tokenById = { 'local-1': 'tok-a', 'local-2': 'tok-b' };
        const result = mergeSceneOrder(['tok-b', 'tok-a'], ['local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-2', 'local-1']);
        expect(result.changed).toBe(false);
    });

    it('handles an entirely empty account order (all local ids fall through to remaining passes)', () => {
        const tokenById = new Map([
            ['local-1', 'tok-a']
        ]);
        const result = mergeSceneOrder([], ['local-1', 'local-2'], tokenById);

        expect(result.order).toEqual(['local-1', 'local-2']);
        expect(result.changed).toBe(true); // ['tok-a'] !== []
    });

    it('handles empty local ids', () => {
        const result = mergeSceneOrder(['tok-a'], [], new Map());
        expect(result.order).toEqual([]);
        expect(result.changed).toBe(true); // [] !== ['tok-a']
    });

    it('handles both empty', () => {
        const result = mergeSceneOrder([], [], new Map());
        expect(result.order).toEqual([]);
        expect(result.changed).toBe(false);
    });
});
