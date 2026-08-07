/**
 * navigation.js - Unified navigation handler for the portfolio website
 * Handles the top navigation bar, active page highlighting, and mobile menu toggle
 */

document.addEventListener('DOMContentLoaded', function () {
    // Get the current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const currentHost = window.location.hostname;

    // Get all navigation links
    const navLinks = document.querySelectorAll('.site-navbar-menu a');

    // Set active class based on current page
    navLinks.forEach(link => {
        const href = link.getAttribute('href');

        // Skip external links (those starting with http:// or https:// and pointing to different domains)
        if (href.startsWith('http://') || href.startsWith('https://')) {
            try {
                const linkUrl = new URL(href);
                if (linkUrl.hostname !== currentHost) {
                    // External link - don't mark as active
                    return;
                }
            } catch (e) {
                // Invalid URL - skip
                return;
            }
        }

        // Process internal links only
        const linkPath = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
        const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

        if (linkPath === currentPath) {
            link.classList.add('active');
        }
    });

    // Mobile menu toggle
    const navbarToggle = document.querySelector('.navbar-toggle');
    const navbarMenu = document.querySelector('.site-navbar-menu');

    /**
     * Swap the Lucide icon inside the toggle button.
     * Using innerHTML + lucide.createIcons() keeps the SVG size consistent.
     */
    function setToggleIcon(iconName) {
        navbarToggle.innerHTML = `<i data-lucide="${iconName}"></i>`;
        lucide.createIcons({ nodes: [navbarToggle] });
    }

    // Matches the breakpoint that reveals .navbar-toggle in unified.css. Using
    // matchMedia rather than an innerWidth literal keeps JS and CSS from
    // disagreeing about whether the drawer is the active UI.
    const mobileNav = window.matchMedia('(max-width: 1060px)');

    /**
     * Single entry point for menu state. aria-expanded is written before
     * setToggleIcon(), which calls the CDN-loaded `lucide` global — if that
     * throws, the state attribute is already committed.
     */
    function openMenu() {
        navbarMenu.classList.add('active');
        navbarToggle.setAttribute('aria-expanded', 'true');
        setToggleIcon('x');
    }

    function closeMenu({ returnFocus = false } = {}) {
        if (!navbarMenu.classList.contains('active')) return;
        // Closing sets the subtree to display:none. If focus is inside it, it
        // would be orphaned to <body>, so pull it back to the toggle.
        const focusWasInside = navbarMenu.contains(document.activeElement);
        navbarMenu.classList.remove('active');
        navbarToggle.setAttribute('aria-expanded', 'false');
        // Restore focus BEFORE the icon swap: setToggleIcon() calls the CDN-loaded
        // `lucide` global, and if that is unavailable it throws — focus must already
        // be somewhere sane by then. Only focus the toggle when it is actually
        // rendered: above the breakpoint it is display:none and cannot take focus,
        // and there the menu is a normal visible nav, so nothing is orphaned.
        const toggleIsVisible = getComputedStyle(navbarToggle).display !== 'none';
        if ((returnFocus || focusWasInside) && toggleIsVisible) {
            navbarToggle.focus();
        }
        setToggleIcon('menu');
    }

    if (navbarToggle && navbarMenu) {
        navbarToggle.addEventListener('click', function (event) {
            // Keep this click away from the outside-click handler below. A real
            // click lands on the <svg> inside the button, and setToggleIcon()
            // replaces the button's children — so by the time the event reaches
            // document, event.target is detached and navbarToggle.contains(target)
            // is false, which read as an outside click and closed the menu again.
            event.stopPropagation();
            if (navbarMenu.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Close mobile menu when clicking a link
        navLinks.forEach(link => {
            link.addEventListener('click', function () {
                if (mobileNav.matches) {
                    closeMenu();
                }
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function (event) {
            if (!navbarToggle.contains(event.target) &&
                !navbarMenu.contains(event.target)) {
                closeMenu();
            }
        });

        // The open menu is a full-width fixed overlay, so Escape should dismiss it
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeMenu({ returnFocus: true });
            }
        });

        // Fires once on the actual breakpoint crossing, rather than on every
        // resize tick behind a debounce that leaves aria-expanded stale
        mobileNav.addEventListener('change', function (event) {
            if (!event.matches) {
                closeMenu();
            }
        });
    }
});
