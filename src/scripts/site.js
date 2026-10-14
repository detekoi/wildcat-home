/**
 * site.js - Behaviour every page shares: icons, the Light/Dark switch, the
 * homepage hero's static video and the Ko-fi support dialog.
 *
 * The initial theme is applied by an inline script in app.njk before first
 * paint; this file keeps the switch, storage and <html data-theme> in step.
 */

(function () {
    const THEME_KEY = 'wildcat-home-theme';
    const root = document.documentElement;

    function readSavedTheme() {
        try {
            const t = localStorage.getItem(THEME_KEY);
            return t === 'light' || t === 'dark' ? t : null;
        } catch (e) {
            return null;
        }
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        document.querySelectorAll('.wc-themeswitch [data-theme-value]').forEach((btn) => {
            btn.setAttribute('aria-pressed', String(btn.dataset.themeValue === theme));
        });
    }

    function initThemeSwitch() {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(readSavedTheme() || (systemDark.matches ? 'dark' : 'light'));

        document.querySelectorAll('.wc-themeswitch [data-theme-value]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.themeValue;
                try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage blocked */ }
                applyTheme(theme);
            });
        });

        // Until the visitor picks a theme, follow the system setting.
        systemDark.addEventListener('change', (event) => {
            if (!readSavedTheme()) applyTheme(event.matches ? 'dark' : 'light');
        });
    }

    // The static video is decoration. Reduced motion stops it; the CSS shows the
    // grain texture underneath instead.
    function initHeroVideo() {
        const video = document.querySelector('.wch-hero-video');
        if (!video) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        function sync() {
            if (reduce.matches) {
                video.pause();
            } else {
                const p = video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
        }
        reduce.addEventListener('change', sync);
        sync();
    }

    function initKofiDialog() {
        const dialog = document.getElementById('kofi-modal');
        const openBtn = document.getElementById('kofi-open');
        const closeBtn = document.getElementById('kofi-close');
        const embedContainer = document.getElementById('kofi-embed-container');
        if (!dialog) return;

        function open() {
            if (typeof dialog.showModal === 'function') {
                if (!dialog.open) dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
            if (embedContainer && !embedContainer.querySelector('iframe')) {
                const iframe = document.createElement('iframe');
                iframe.src = 'https://ko-fi.com/parfaitfair/?hidefeed=true&widget=true&embed=true';
                iframe.title = 'Support parfaitfair on Ko-fi';
                iframe.className = 'kofi-iframe';
                embedContainer.appendChild(iframe);
            }
        }

        function close() {
            if (typeof dialog.close === 'function') {
                if (dialog.open) dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
        }

        openBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            open();
        });

        closeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            close();
        });

        // A click on the backdrop lands on the <dialog> itself, outside its box.
        dialog.addEventListener('click', (e) => {
            if (e.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            const isInside =
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom;
            if (!isInside) close();
        });
    }

    function initIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function init() {
        initThemeSwitch();
        initHeroVideo();
        initKofiDialog();
        initIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
