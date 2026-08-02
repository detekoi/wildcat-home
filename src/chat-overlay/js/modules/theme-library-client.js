/**
 * Theme Library Client Module
 * Talks to the Cloud Run proxy's /theme-library/{token} endpoints (Firestore-backed,
 * with images offloaded to GCS) so the theme carousel is no longer limited to a
 * single AI-generated theme in localStorage.
 *
 * localStorage['generatedThemes'] is kept as an OFFLINE CACHE only, written through
 * on every successful cloud read so the carousel can paint instantly on load and
 * keep working if the proxy/network is unreachable. It is never the source of truth.
 */

import { getProxyBaseUrl } from './scene-sync-manager.js';

const TOKEN_KEY = 'themeLibraryToken';
const CACHE_KEY = 'generatedThemes';

let cachedToken = null;
let migrationAttempted = false;

/**
 * Read/create the unguessable per-browser token that identifies this user's
 * theme library. Mirrors the fallback shape used for client ids elsewhere
 * (creator-sync-manager.js:20-22).
 */
export function getLibraryToken() {
    if (cachedToken) return cachedToken;

    // The fallback must still be a well-formed UUID: the proxy validates every
    // token against a strict UUID regex and 400s anything else, so a
    // `themelib-<timestamp>` style id would make the whole library unreachable on
    // origins where crypto.randomUUID is missing (non-secure contexts, older
    // webviews).
    const makeToken = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

        const randomByte = (typeof crypto !== 'undefined' && crypto.getRandomValues)
            ? () => crypto.getRandomValues(new Uint8Array(1))[0]
            : () => Math.floor(Math.random() * 256);

        const bytes = Array.from({ length: 16 }, randomByte);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
        const hex = bytes.map(b => b.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    };

    try {
        let token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            token = makeToken();
            localStorage.setItem(TOKEN_KEY, token);
        }
        cachedToken = token;
    } catch (e) {
        // localStorage unavailable (private browsing, quota, etc.) — fall back to
        // an in-memory token so the module still works for the current session.
        console.warn('[ThemeLibraryClient] localStorage unavailable, using an ephemeral token:', e);
        cachedToken = makeToken();
    }

    return cachedToken;
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeCache(themes) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(themes) ? themes : []));
    } catch (e) {
        console.warn('[ThemeLibraryClient] Failed to write offline theme cache:', e);
    }
}

/**
 * Synchronous read of the offline cache, for an instant first paint before the
 * network round-trip (or the Firestore SDK) resolves.
 */
export function getCachedThemes() {
    return readCache();
}

/**
 * One-time migration: if the cloud library comes back empty but the local cache
 * holds generated themes, push them up so the user doesn't lose them.
 *
 * Migrates every cached generated theme, not just the first. The old cache could
 * only ever hold one (it was capped by a slice(0, 1)), but it is now a mirror of
 * the whole library, so this also covers a cloud library that was emptied or
 * expired while the cache was still populated.
 */
async function migrateLegacyThemesIfNeeded(cloudThemes) {
    if (migrationAttempted) return cloudThemes;
    migrationAttempted = true;

    if (Array.isArray(cloudThemes) && cloudThemes.length > 0) return cloudThemes;

    const legacyThemes = readCache().filter(t => t && t.isGenerated);
    if (legacyThemes.length === 0) return cloudThemes;

    const migrated = [];
    // Cache is newest-first and addTheme prepends, so push oldest-first to
    // preserve the original ordering in the cloud library.
    for (const theme of [...legacyThemes].reverse()) {
        try {
            const stored = await addTheme(theme);
            if (stored) migrated.unshift(stored);
        } catch (e) {
            console.warn('[ThemeLibraryClient] Failed to migrate locally-saved theme:', theme?.value, e);
        }
    }

    if (migrated.length > 0) {
        console.log(`[ThemeLibraryClient] Migrated ${migrated.length} locally-saved theme(s) to the cloud library.`);
        return migrated;
    }

    return cloudThemes;
}

/**
 * Fetch the full theme library from the proxy. Degrades to the offline cache
 * on any network/proxy failure — never throws.
 */
export async function fetchThemes() {
    const token = getLibraryToken();
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/theme-library/${token}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let themes = Array.isArray(data?.themes) ? data.themes : [];

        themes = await migrateLegacyThemesIfNeeded(themes);

        writeCache(themes);
        return themes;
    } catch (err) {
        console.warn('[ThemeLibraryClient] fetchThemes failed, falling back to offline cache:', err);
        return readCache();
    }
}

/**
 * Add a theme to the cloud library. Returns the stored theme (with
 * backgroundImage rewritten to a GCS URL by the proxy) or null on failure —
 * never throws.
 */
export async function addTheme(theme) {
    const token = getLibraryToken();
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/theme-library/${token}/themes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // The route responds with { success, theme } — unwrap it so callers get a
        // theme object, not the envelope. Callers Object.assign() this onto their
        // in-memory theme, so returning the wrapper would silently drop the
        // server-assigned id and the GCS-rewritten backgroundImage.
        const data = await response.json();
        return data?.theme ?? null;
    } catch (err) {
        console.warn('[ThemeLibraryClient] addTheme failed:', err);
        return null;
    }
}

/**
 * Delete a theme from the cloud library. Returns true on success, false
 * otherwise — never throws.
 */
export async function deleteTheme(id) {
    if (!id) return false;
    const token = getLibraryToken();
    try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/theme-library/${token}/themes/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (err) {
        console.warn('[ThemeLibraryClient] deleteTheme failed:', err);
        return false;
    }
}

/**
 * Persist the currently active (selected) theme value to the library doc via
 * the proxy. Other pages that subscribe() will receive the update in real time
 * through Firestore onSnapshot.
 *
 * Fire-and-forget — never throws.
 *
 * @param {string} themeValue - The `value` field of the selected theme.
 * @param {string} updatedBy - A per-session client ID for echo suppression.
 */
export async function setActiveTheme(themeValue, updatedBy) {
    if (!themeValue) return;
    const token = getLibraryToken();
    try {
        const baseUrl = getProxyBaseUrl();
        await fetch(`${baseUrl}/theme-library/${token}/active-theme`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ themeValue, updatedBy: updatedBy || null })
        });
    } catch (err) {
        console.warn('[ThemeLibraryClient] setActiveTheme failed:', err);
    }
}

/**
 * Subscribe to live updates of the theme library via Firestore onSnapshot.
 * `cb(themes)` is invoked with the full themes array on every update, and the
 * offline cache is written through on every successful snapshot. Copies the
 * lazy gstatic dynamic-import + experimentalAutoDetectLongPolling fallback
 * pattern verbatim from creator-sync-manager.js:34-51.
 *
 * Returns an unsubscribe function. Never throws — failures are logged and the
 * carousel simply keeps using fetchThemes()/the offline cache.
 */
export function subscribe(cb) {
    const token = getLibraryToken();
    let cancelled = false;
    let unsubscribeFn = null;

    (async () => {
        try {
            const [firebaseApp, firebaseFirestore] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
            ]);

            if (cancelled) return;

            const app = firebaseApp.getApps().length === 0
                ? firebaseApp.initializeApp({ projectId: 'chat-themer' })
                : firebaseApp.getApps()[0];

            let db;
            try {
                db = firebaseFirestore.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
            } catch (e) {
                db = firebaseFirestore.getFirestore(app);
            }

            const docRef = firebaseFirestore.doc(db, 'themeLibraries', token);

            unsubscribeFn = firebaseFirestore.onSnapshot(docRef, (docSnap) => {
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                const themes = Array.isArray(data?.themes) ? data.themes : [];
                writeCache(themes);
                cb(themes, {
                    activeTheme: data.activeTheme || null,
                    activeThemeUpdatedBy: data.activeThemeUpdatedBy || null
                });
            }, (err) => {
                console.warn('[ThemeLibraryClient] Firestore subscription error:', err);
            });

            if (cancelled && unsubscribeFn) {
                unsubscribeFn();
                unsubscribeFn = null;
            }
        } catch (e) {
            console.warn('[ThemeLibraryClient] Could not initialize Firestore remote listener:', e);
        }
    })();

    return () => {
        cancelled = true;
        if (unsubscribeFn) {
            unsubscribeFn();
            unsubscribeFn = null;
        }
    };
}
