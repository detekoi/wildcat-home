/**
 * navigation.js - Unified navigation handler for the portfolio website
 * Handles the top navigation bar, active page highlighting, and mobile menu toggle
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get the current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Get all navigation links
    const navLinks = document.querySelectorAll('.site-navbar-menu a');

    // Set active class based on current page
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const linkPage = href.split('/').pop();

        if (linkPage === currentPage) {
            link.classList.add('active');
        }

        // Also handle index.html vs root
        if ((currentPage === '' || currentPage === 'index.html') &&
            (linkPage === 'index.html' || linkPage === '')) {
            link.classList.add('active');
        }
    });

    // Mobile menu toggle
    const navbarToggle = document.querySelector('.navbar-toggle');
    const navbarMenu = document.querySelector('.site-navbar-menu');

    if (navbarToggle && navbarMenu) {
        navbarToggle.addEventListener('click', function() {
            navbarMenu.classList.toggle('active');

            // Update button text
            if (navbarMenu.classList.contains('active')) {
                navbarToggle.textContent = '✕';
            } else {
                navbarToggle.textContent = '☰';
            }
        });

        // Close mobile menu when clicking a link
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    navbarMenu.classList.remove('active');
                    navbarToggle.textContent = '☰';
                }
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!navbarToggle.contains(event.target) &&
                !navbarMenu.contains(event.target) &&
                navbarMenu.classList.contains('active')) {
                navbarMenu.classList.remove('active');
                navbarToggle.textContent = '☰';
            }
        });
    }

    // Handle window resize - close mobile menu if window gets larger
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (window.innerWidth > 768 && navbarMenu && navbarMenu.classList.contains('active')) {
                navbarMenu.classList.remove('active');
                if (navbarToggle) {
                    navbarToggle.textContent = '☰';
                }
            }
        }, 250);
    });
});
