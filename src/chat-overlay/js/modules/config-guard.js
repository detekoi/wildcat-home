/**
 * Config Guard
 *
 * A scene config or theme can come from outside this browser: Firestore sync,
 * the proxy, localStorage written by an older build, or anyone who holds the
 * scene's ?sync= token. Everything here decides what an OBS Browser Source
 * fetches or renders, so values are checked before they reach the page:
 *
 *   - badge/cheermote endpoints are fixed; configs no longer carry them
 *   - background images must be raster data URLs or objects in our own bucket
 *   - values bound to CSS custom properties must look like what the UI produces
 *
 * The proxy applies the same URL rules on write; this covers configs that
 * reach the overlay straight from Firestore or were saved before those rules.
 */

// The badge and cheermote responses carry image URLs that are loaded inside
// OBS, so these are never read from a config.
export const ENDPOINTS = Object.freeze({
    globalBadges: 'https://us-central1-chat-themer.cloudfunctions.net/getGlobalBadges',
    channelBadges: 'https://us-central1-chat-themer.cloudfunctions.net/getChannelBadges',
    cheermotes: 'https://us-central1-chat-themer.cloudfunctions.net/getCheermotes'
});

// Config keys that used to hold those endpoints. Stripped from any config that
// still carries them (older localStorage, older Firestore docs).
export const REMOVED_CONFIG_KEYS = Object.freeze([
    'badgeEndpointUrlGlobal',
    'badgeEndpointUrlChannel',
    'cheermoteEndpointUrl'
]);

const BUCKET_PREFIX = 'https://storage.googleapis.com/chat-themer-backgrounds/';
const OBJECT_PATH_REGEX = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const CSS_URL_WRAPPER_REGEX = /^url\(\s*(['"]?)(.*)\1\s*\)$/s;

/**
 * Normalise a stored background image to a bare URL the overlay may load, or
 * null. Older configs stored the CSS form (`url("...")`), so that wrapper is
 * removed first. 'none' and empty values mean "no image" and become null.
 * @param {*} value
 * @returns {string|null}
 */
export function safeImageUrl(value) {
    if (typeof value !== 'string') return null;
    let url = value.trim();
    const wrapped = url.match(CSS_URL_WRAPPER_REGEX);
    if (wrapped) url = wrapped[2].trim();
    if (!url || url === 'none') return null;

    if (url.startsWith('data:')) return DATA_URL_REGEX.test(url) ? url : null;

    if (!url.startsWith(BUCKET_PREFIX)) return null;
    try {
        if (new URL(url).href !== url) return null;
    } catch (e) {
        return null;
    }
    return OBJECT_PATH_REGEX.test(url.slice(BUCKET_PREFIX.length)) ? url : null;
}

/**
 * The CSS value for a background-image custom property: `url("...")` for an
 * allowed image, otherwise 'none'.
 * @param {*} value
 * @returns {string}
 */
export function cssImageValue(value) {
    const url = safeImageUrl(value);
    return url ? `url("${url}")` : 'none';
}

// null/''/'none' all mean "no image"; they're left as stored so config
// comparisons (dirty state, sync echo checks) don't see a change.
const isNoImage = (value) => value === null || value === undefined || value === '' || value === 'none';

// --- CSS-bound values ---

// Hex, rgb()/rgba()/hsl()/hsla() and named colours. Inside the parentheses only
// digits, letters, separators and units: no quotes, colons or nested functions.
const COLOR_REGEX = /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([0-9a-z\s.,%/+-]*\)|[a-z]+)$/i;
const FONT_FAMILY_REGEX = /^[\p{L}\p{N}\s'",._-]+$/u;
const GOOGLE_FONT_FAMILY_REGEX = /^[\p{L}\p{N} _-]+$/u;
const FONT_WEIGHT_REGEX = /^(normal|bold|bolder|lighter|[1-9]00)$/;
const LENGTH_PX_REGEX = /^\d+(\.\d+)?px$/;
const BORDER_RADIUS_PRESETS = new Set(['none', 'subtle', 'rounded', 'pill', 'sharp']);
// Preset names ("Simple 3D") or literal shadows ("rgba(0, 0, 0, 0.2) 0px 2px 8px").
const BOX_SHADOW_REGEX = /^[A-Za-z0-9\s#(),.%-]+$/;
const THEME_CLASS_REGEX = /^[A-Za-z0-9_-]+$/;
const CHAT_MODES = new Set(['window', 'popup']);

// Numeric settings stored as strings by older builds ("20", "20px", "95%").
const NUMERIC_STRING_REGEX = /^\s*-?\d+(\.\d+)?\s*(px|%)?\s*$/;

const COLOR_KEYS = ['bgColor', 'borderColor', 'textColor', 'usernameColor', 'timestampColor'];
const NUMBER_KEYS = ['fontSize', 'chatWidth', 'chatHeight', 'bgColorOpacity', 'bgImageOpacity'];

const isString = (value, maxLength) => typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const isColor = (value) => isString(value, 64) && COLOR_REGEX.test(value.trim());

const VALIDATORS = {
    pronounBadgeColor: (v) => v === 'timestamp' || isColor(v),
    fontFamily: (v) => isString(v, 300) && FONT_FAMILY_REGEX.test(v),
    googleFontFamily: (v) => v === null || (isString(v, 100) && GOOGLE_FONT_FAMILY_REGEX.test(v)),
    fontWeight: (v) => (typeof v === 'number' || typeof v === 'string') && FONT_WEIGHT_REGEX.test(String(v)),
    borderRadius: (v) => isString(v, 32) && (LENGTH_PX_REGEX.test(v) || BORDER_RADIUS_PRESETS.has(v.toLowerCase())),
    boxShadow: (v) => isString(v, 300) && BOX_SHADOW_REGEX.test(v),
    textShadow: (v) => isString(v, 32),
    theme: (v) => isString(v, 64) && THEME_CLASS_REGEX.test(v),
    chatMode: (v) => CHAT_MODES.has(v)
};
for (const key of COLOR_KEYS) VALIDATORS[key] = isColor;
for (const key of NUMBER_KEYS) VALIDATORS[key] = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Return a copy of `cfg` that is safe to apply. Only keys already present are
 * touched, so a partial config stays partial:
 *   - removed endpoint keys are dropped
 *   - bgImage becomes an allowed image URL or null
 *   - a CSS-bound value that fails its check falls back to `defaults[key]`
 *     (numeric strings such as "20" or "20px" are converted to numbers first)
 *
 * @param {Object} cfg
 * @param {Object} [defaults={}]
 * @returns {Object}
 */
export function sanitizeConfig(cfg, defaults = {}) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    const out = { ...cfg };

    for (const key of REMOVED_CONFIG_KEYS) {
        delete out[key];
    }

    if ('bgImage' in out && !isNoImage(out.bgImage)) out.bgImage = safeImageUrl(out.bgImage);

    for (const [key, isValid] of Object.entries(VALIDATORS)) {
        if (!(key in out) || out[key] === undefined) continue;
        let value = out[key];
        if (NUMBER_KEYS.includes(key) && typeof value === 'string' && NUMERIC_STRING_REGEX.test(value)) {
            value = parseFloat(value);
        }
        if (isValid(value)) {
            out[key] = value;
        } else {
            console.warn(`[ConfigGuard] Ignoring invalid ${key}:`, out[key]);
            out[key] = key in defaults ? defaults[key] : null;
        }
    }

    return out;
}
