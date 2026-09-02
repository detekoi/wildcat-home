/**
 * Account Merge Module
 * Pure helpers for reconciling a locally-ordered list of scene instances with
 * the scene display order stored on a Twitch account, so signing in on a new
 * device doesn't silently reorder (or drop) scenes that already exist locally.
 */

function resolveToken(tokenById, id) {
    if (!tokenById) return undefined;
    if (typeof tokenById.get === 'function') return tokenById.get(id);
    return tokenById[id];
}

/**
 * Merge an account's scene order (sync tokens) with the local scene order
 * (instance ids).
 *
 * Resulting order is built in three passes:
 *   1. For each account token in order, the local id that has that token
 *      (tokens with no matching local id are skipped).
 *   2. Any remaining local ids that have a token but weren't in the account
 *      order, in their existing local order (local-only scenes).
 *   3. Any remaining local ids with no token at all, in their existing local
 *      order (never-synced scenes).
 *
 * `changed` is true when the token sequence of the resulting order (ids that
 * have a token, in the order produced above) is not exactly equal to
 * `accountOrderTokens` — i.e. the account's stored order needs to be updated
 * to reflect the merge (a local-only token was appended, or the order shifted).
 *
 * @param {string[]} accountOrderTokens - sync tokens in account order
 * @param {string[]} localIds - local instance ids in current local order
 * @param {Map<string,string>|Object<string,string>} tokenById - id -> syncToken (may be missing for some ids)
 * @returns {{order: string[], changed: boolean}}
 */
export function mergeSceneOrder(accountOrderTokens, localIds, tokenById) {
    const accountTokens = Array.isArray(accountOrderTokens) ? accountOrderTokens : [];
    const ids = Array.isArray(localIds) ? localIds : [];

    const localIdByToken = new Map();
    for (const id of ids) {
        const token = resolveToken(tokenById, id);
        if (token && !localIdByToken.has(token)) {
            localIdByToken.set(token, id);
        }
    }

    const order = [];
    const usedIds = new Set();

    for (const token of accountTokens) {
        const id = localIdByToken.get(token);
        if (id && !usedIds.has(id)) {
            order.push(id);
            usedIds.add(id);
        }
    }

    const remainingWithToken = [];
    const remainingWithoutToken = [];
    for (const id of ids) {
        if (usedIds.has(id)) continue;
        const token = resolveToken(tokenById, id);
        if (token) {
            remainingWithToken.push(id);
        } else {
            remainingWithoutToken.push(id);
        }
    }

    order.push(...remainingWithToken, ...remainingWithoutToken);

    const resultTokenSequence = order
        .map(id => resolveToken(tokenById, id))
        .filter(Boolean);

    const changed = !arraysEqual(resultTokenSequence, accountTokens);

    return { order, changed };
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
