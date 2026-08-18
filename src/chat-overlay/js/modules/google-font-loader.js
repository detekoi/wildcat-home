/**
 * Google Font loading for the chat overlay.
 *
 * A dependency-free leaf module so every page can import it directly:
 * chat.html goes through theme-carousel.js, while chat-scene-creator.html
 * only loads font-manager.js. Both end up here, so the <link> injection
 * (and its de-duplication) lives in exactly one place.
 */

/**
 * Dynamically load a Google Font by injecting a <link> tag. Repeat calls for
 * the same family are no-ops — the generated id is the de-duplication key.
 * @param {string} fontFamily - The font family name.
 * @param {string} [customUrl] - Optional custom Google Fonts CSS URL (for variable fonts with special axes).
 */
export function loadGoogleFont(fontFamily, customUrl) {
    if (!fontFamily) return;

    // Normalize once, up front: the id and the URL must agree on the name, or
    // 'Roboto ' and 'Roboto' produce different ids and both get injected.
    const family = fontFamily.trim();
    if (!family) return;

    const fontId = `google-font-${family.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(fontId)) return; // Already loaded

    // Spaces are '+' in the family param; encodeURIComponent covers anything
    // else that would otherwise land in the URL unescaped.
    const familyParam = encodeURIComponent(family).replace(/%20/g, '+');

    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = customUrl || `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;700&display=swap`;
    document.head.appendChild(link);
    console.log(`Loaded Google Font: ${fontFamily}`);
}
