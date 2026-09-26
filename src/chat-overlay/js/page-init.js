/**
 * chat.html page bootstrap
 *
 * Lives in a file rather than inline in chat.html because the page's
 * Content-Security-Policy disallows inline scripts and inline event handlers.
 */

(function () {
    const topFadeToggle = document.getElementById('top-fade-toggle');
    if (topFadeToggle) {
        topFadeToggle.addEventListener('change', function () {
            document.body.classList.toggle('top-fade', this.checked);
        });
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
})();
