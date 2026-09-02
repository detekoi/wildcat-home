/**
 * Account Client Module
 * Talks to the Cloud Run proxy's /account routes so a Twitch-signed-in user can
 * link their scenes (browser sources) to their account, list them, and reorder
 * them across devices. Mirrors the never-throws / degrade-gracefully style of
 * theme-library-client.js.
 */

import { getProxyBaseUrl } from './scene-sync-manager.js';
import { getAuthHeaders } from './twitch-auth.js';

/**
 * Dispatched on `window` whenever a request comes back 401 (the stored Twitch
 * token is no longer valid). Hosts listen for this to prompt a re-login rather
 * than silently failing every subsequent account call.
 */
export const AUTH_EXPIRED_EVENT = 'twitch-auth-expired';

function dispatchAuthExpired() {
    try {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    } catch (e) {}
}

/**
 * Fetch the signed-in user's account: their user identity, linked scenes, and
 * scene display order. Returns null on any failure — never throws.
 */
export async function fetchAccount() {
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/account`, {
            headers: { ...getAuthHeaders() }
        });
        if (response.status === 401) {
            dispatchAuthExpired();
            return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        console.warn('[AccountClient] fetchAccount failed:', err);
        return null;
    }
}

/**
 * Link one or more scenes (browser-source instances) to the signed-in account.
 * An empty `scenes` array resolves immediately with an empty result — no
 * request is made, since there is nothing to link.
 */
export async function linkScenes(scenes, { force = false } = {}) {
    if (!Array.isArray(scenes) || scenes.length === 0) {
        return { linked: [], skipped: [], existing: [], rejected: [], sceneOrder: null };
    }
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/account/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ scenes, force })
        });
        if (response.status === 401) {
            dispatchAuthExpired();
            return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        console.warn('[AccountClient] linkScenes failed:', err);
        return null;
    }
}

/**
 * Unlink a scene from the signed-in account by its sync token. Returns true on
 * success, false otherwise — never throws.
 */
export async function unlinkScene(token) {
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/account/scenes/${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: { ...getAuthHeaders() }
        });
        if (response.status === 401) {
            dispatchAuthExpired();
            return false;
        }
        return response.ok;
    } catch (err) {
        console.warn('[AccountClient] unlinkScene failed:', err);
        return false;
    }
}

/**
 * Persist the signed-in account's scene display order. Returns the server's
 * stored order (string[] of sync tokens) or null on failure — never throws.
 */
export async function setSceneOrder(sceneOrder) {
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/account/scene-order`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ sceneOrder })
        });
        if (response.status === 401) {
            dispatchAuthExpired();
            return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data?.sceneOrder ?? null;
    } catch (err) {
        console.warn('[AccountClient] setSceneOrder failed:', err);
        return null;
    }
}
