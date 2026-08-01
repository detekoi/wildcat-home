import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock theme-library-client module so dynamic import('./modules/theme-library-client.js') in theme-carousel succeeds
vi.mock('../theme-library-client.js', () => ({
    getCachedThemes: vi.fn(() => []),
    fetchThemes: vi.fn(async () => []),
    addTheme: vi.fn(async (t) => ({ ...t, id: 'cloud-id-123' })),
    deleteTheme: vi.fn(async () => true),
    subscribe: vi.fn(() => () => {})
}));

describe('ThemeCarousel Module (theme-carousel.js)', () => {
    let container;

    const loadThemeCarouselScript = () => {
        const scriptPath = path.resolve(__dirname, '../../theme-carousel.js');
        const code = fs.readFileSync(scriptPath, 'utf8');
        // Execute IIFE script in JSDOM environment
        eval(code);
    };

    beforeEach(() => {
        document.body.innerHTML = '<div id="carousel-mount"></div>';
        container = document.getElementById('carousel-mount');

        // Mock Element.prototype.scrollTo for JSDOM
        Element.prototype.scrollTo = vi.fn();

        // Clear existing globals before each test run
        delete window.themeCarousel;
        delete window.addThemeToCarousel;
        delete window.availableThemes;
        delete window.currentThemeIndex;
        delete window.availableFonts;

        loadThemeCarouselScript();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Initialization & Global Setup', () => {
        it('should define window.themeCarousel API and default availableThemes', () => {
            expect(window.themeCarousel).toBeDefined();
            expect(typeof window.themeCarousel.mount).toBe('function');
            expect(typeof window.themeCarousel.addTheme).toBe('function');
            expect(typeof window.themeCarousel.applyTheme).toBe('function');
            expect(Array.isArray(window.availableThemes)).toBe(true);
            expect(window.availableThemes.length).toBeGreaterThan(0);
        });

        it('should dispatch theme-carousel-ready CustomEvent on document', () => {
            const listener = vi.fn();
            document.addEventListener('theme-carousel-ready', listener);

            loadThemeCarouselScript();

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Mounting & Lifecycle', () => {
        it('should return no-op object if mount is called without container', () => {
            const res = window.themeCarousel.mount(null);
            expect(res).toBeDefined();
            expect(typeof res.destroy).toBe('function');
            expect(typeof res.refresh).toBe('function');
            expect(typeof res.selectByValue).toBe('function');
        });

        it('should render carousel markup into the container', () => {
            const controller = window.themeCarousel.mount(container);

            expect(container.querySelector('.theme-carousel-container')).not.toBeNull();
            expect(container.querySelector('.theme-cards-wrapper')).not.toBeNull();
            expect(container.querySelector('#prev-theme')).not.toBeNull();
            expect(container.querySelector('#next-theme')).not.toBeNull();
            expect(container.querySelector('#selected-theme-name')).not.toBeNull();

            // Default initial theme details updated
            const selectedName = container.querySelector('#selected-theme-name').textContent;
            expect(selectedName).toBe(window.availableThemes[0].name);

            controller.destroy();
            expect(container.innerHTML).toBe('');
        });

        it('should remove preview container if showPreview option is set to false', () => {
            window.themeCarousel.mount(container, { showPreview: false });
            expect(container.querySelector('.theme-preview-container')).toBeNull();
        });
    });

    describe('Navigation & Theme Application', () => {
        it('should navigate to next theme when #next-theme button is clicked', () => {
            const onApplySpy = vi.fn();
            window.themeCarousel.mount(container, { onApply: onApplySpy });

            const nextBtn = container.querySelector('#next-theme');
            expect(window.currentThemeIndex).toBe(0);

            nextBtn.click();

            expect(window.currentThemeIndex).toBe(1);
            expect(onApplySpy).toHaveBeenCalledWith(window.availableThemes[1]);
            expect(container.querySelector('#selected-theme-name').textContent).toBe(window.availableThemes[1].name);
        });

        it('should wrap around to last theme when #prev-theme button is clicked at index 0', () => {
            const onApplySpy = vi.fn();
            window.themeCarousel.mount(container, { onApply: onApplySpy });

            const prevBtn = container.querySelector('#prev-theme');
            const lastIndex = window.availableThemes.length - 1;

            prevBtn.click();

            expect(window.currentThemeIndex).toBe(lastIndex);
            expect(onApplySpy).toHaveBeenCalledWith(window.availableThemes[lastIndex]);
        });

        it('should select theme by value using selectByValue()', () => {
            const onApplySpy = vi.fn();
            const controller = window.themeCarousel.mount(container, { onApply: onApplySpy });

            const targetTheme = window.availableThemes.find(t => t.value === 'pink-theme');
            expect(targetTheme).toBeDefined();

            controller.selectByValue('pink-theme');

            expect(window.availableThemes[window.currentThemeIndex].value).toBe('pink-theme');
            expect(onApplySpy).toHaveBeenCalledWith(targetTheme);
        });
    });

    describe('Adding & Deleting Themes', () => {
        it('should add theme to carousel and dispatch theme-added-to-carousel event', () => {
            window.themeCarousel.mount(container);
            const eventListener = vi.fn();
            document.addEventListener('theme-added-to-carousel', eventListener);

            const newTheme = {
                name: 'Custom Synthwave',
                value: 'synthwave-custom',
                bgColor: '#200020',
                textColor: '#00ffff'
            };

            const added = window.themeCarousel.addTheme(newTheme);

            expect(added.name).toBe('Custom Synthwave');
            expect(added.isGenerated).toBe(true);
            expect(window.availableThemes[0].value).toBe('synthwave-custom');
            expect(eventListener).toHaveBeenCalledWith(expect.objectContaining({
                detail: { theme: expect.objectContaining({ value: 'synthwave-custom' }) }
            }));

            // Card should be rendered in the DOM
            const cards = container.querySelectorAll('.theme-card');
            expect(cards[0].dataset.themeValue).toBe('synthwave-custom');
        });

        it('should render delete button on generated theme cards when showDelete is true', () => {
            window.themeCarousel.mount(container, { showDelete: true });

            window.themeCarousel.addTheme({
                name: 'Deletable Theme',
                value: 'deletable-1',
                bgColor: '#111111'
            });

            const card = container.querySelector('.theme-card[data-theme-value="deletable-1"]');
            expect(card).not.toBeNull();
            const deleteBtn = card.querySelector('.theme-card-delete');
            expect(deleteBtn).not.toBeNull();
        });

        it('should delete generated theme on delete button click and adjust active theme index', () => {
            const onApplySpy = vi.fn();
            window.themeCarousel.mount(container, { onApply: onApplySpy, showDelete: true });

            const themeToDelete = window.themeCarousel.addTheme({
                id: 'gen-to-delete',
                name: 'Temporary Generated',
                value: 'temp-gen',
                bgColor: '#333333'
            });

            // Currently active index is 0 (the newly added generated theme)
            expect(window.currentThemeIndex).toBe(0);
            expect(window.availableThemes[0].value).toBe('temp-gen');

            const card = container.querySelector('.theme-card[data-theme-value="temp-gen"]');
            const deleteBtn = card.querySelector('.theme-card-delete');
            deleteBtn.click();

            // Should be removed from availableThemes
            expect(window.availableThemes.find(t => t.value === 'temp-gen')).toBeUndefined();
            // Active theme index updated to fallback theme (index 0 which is now default dark)
            expect(window.currentThemeIndex).toBe(0);
            expect(onApplySpy).toHaveBeenCalled();
        });

        it('should ignore duplicate theme additions by value', () => {
            window.themeCarousel.mount(container);

            const initialCount = window.availableThemes.length;
            const theme = { name: 'Dup Test', value: 'dup-value', bgColor: '#000000' };

            window.themeCarousel.addTheme(theme);
            const countAfterFirst = window.availableThemes.length;
            expect(countAfterFirst).toBe(initialCount + 1);

            // Adding same value again
            window.themeCarousel.addTheme(theme);
            expect(window.availableThemes.length).toBe(countAfterFirst);
        });
    });
});
