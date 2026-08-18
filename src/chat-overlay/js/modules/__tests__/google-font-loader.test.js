import { describe, it, expect, beforeEach } from 'vitest';
import { loadGoogleFont } from '../google-font-loader.js';

describe('loadGoogleFont', () => {
    beforeEach(() => {
        document.head.querySelectorAll('link[id^="google-font-"]').forEach(el => el.remove());
    });

    it('injects a stylesheet <link> for the family', () => {
        loadGoogleFont('Press Start 2P');

        const link = document.getElementById('google-font-press-start-2p');
        expect(link).not.toBeNull();
        expect(link.rel).toBe('stylesheet');
        expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Press+Start+2P:wght@400;700&display=swap');
    });

    it('is a no-op on repeat calls for the same family', () => {
        loadGoogleFont('Roboto');
        loadGoogleFont('Roboto');

        expect(document.head.querySelectorAll('#google-font-roboto').length).toBe(1);
    });

    it('uses customUrl verbatim when provided', () => {
        const url = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800&display=swap';
        loadGoogleFont('Atkinson Hyperlegible Next', url);

        expect(document.getElementById('google-font-atkinson-hyperlegible-next').href).toBe(url);
    });

    it('ignores an empty or whitespace-only family instead of injecting a broken URL', () => {
        loadGoogleFont('');
        loadGoogleFont(undefined);
        loadGoogleFont('   ');

        expect(document.head.querySelectorAll('link[id^="google-font-"]').length).toBe(0);
    });

    it('treats a padded family name as the same font (id and URL agree on the name)', () => {
        loadGoogleFont('Roboto ');
        loadGoogleFont('Roboto');
        loadGoogleFont(' Roboto');

        const links = document.head.querySelectorAll('link[id^="google-font-"]');
        expect(links.length).toBe(1);
        expect(links[0].id).toBe('google-font-roboto');
        expect(new URL(links[0].href).searchParams.get('family')).toBe('Roboto:wght@400;700');
    });

    it('escapes characters that would otherwise alter the request URL', () => {
        loadGoogleFont('Bad&family=Evil');

        const link = document.getElementById('google-font-bad&family=evil');
        expect(link.href).toContain('family=Bad%26family%3DEvil:wght@400;700');
    });
});
