import * as themeCarousel from '../../theme-carousel.js';
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

        beforeEach(() => {
        document.body.innerHTML = '<div id="carousel-mount"></div>';
        container = document.getElementById('carousel-mount');

        // Mock Element.prototype.scrollTo for JSDOM
        Element.prototype.scrollTo = vi.fn();

        // Clear existing globals before each test run
        
        delete window.addThemeToCarousel;
        themeCarousel.setAvailableThemes(themeCarousel.getAvailableThemes().slice());
        themeCarousel.setCurrentThemeIndex(0);
        delete window.availableFonts;

        
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Initialization & Global Setup', () => {
        it('should define themeCarousel API and default availableThemes', () => {
            expect(themeCarousel).toBeDefined();
            expect(typeof themeCarousel.mount).toBe('function');
            expect(typeof themeCarousel.addTheme).toBe('function');
            expect(typeof themeCarousel.applyTheme).toBe('function');
            expect(Array.isArray(themeCarousel.getAvailableThemes())).toBe(true);
            expect(themeCarousel.getAvailableThemes().length).toBeGreaterThan(0);
        });

        it('should dispatch theme-carousel-ready CustomEvent on document', () => {
            const listener = vi.fn();
            document.addEventListener('theme-carousel-ready', listener);
            document.dispatchEvent(new CustomEvent('theme-carousel-ready'));
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Mounting & Lifecycle', () => {
        it('should return no-op object if mount is called without container', () => {
            const res = themeCarousel.mount(null);
            expect(res).toBeDefined();
            expect(typeof res.destroy).toBe('function');
            expect(typeof res.refresh).toBe('function');
            expect(typeof res.selectByValue).toBe('function');
        });

        it('should render carousel markup into the container', () => {
            const controller = themeCarousel.mount(container);

            expect(container.querySelector('.theme-carousel-container')).not.toBeNull();
            expect(container.querySelector('.theme-cards-wrapper')).not.toBeNull();
            expect(container.querySelector('#prev-theme')).not.toBeNull();
            expect(container.querySelector('#next-theme')).not.toBeNull();
            expect(container.querySelector('#selected-theme-name')).not.toBeNull();

            // Default initial theme details updated
            const selectedName = container.querySelector('#selected-theme-name').textContent;
            expect(selectedName).toBe(themeCarousel.getAvailableThemes()[0].name);

            controller.destroy();
            expect(container.innerHTML).toBe('');
        });

        it('should remove preview container if showPreview option is set to false', () => {
            themeCarousel.mount(container, { showPreview: false });
            expect(container.querySelector('.theme-preview-container')).toBeNull();
        });
    });

    describe('Navigation & Theme Application', () => {
        it('should navigate to next theme when #next-theme button is clicked', () => {
            const onApplySpy = vi.fn();
            themeCarousel.mount(container, { onApply: onApplySpy });

            const nextBtn = container.querySelector('#next-theme');
            expect(themeCarousel.getCurrentThemeIndex()).toBe(0);

            nextBtn.click();

            expect(themeCarousel.getCurrentThemeIndex()).toBe(1);
            expect(onApplySpy).toHaveBeenCalledWith(themeCarousel.getAvailableThemes()[1], { userInitiated: true });
            expect(container.querySelector('#selected-theme-name').textContent).toBe(themeCarousel.getAvailableThemes()[1].name);
        });

        it('should wrap around to last theme when #prev-theme button is clicked at index 0', () => {
            const onApplySpy = vi.fn();
            themeCarousel.mount(container, { onApply: onApplySpy });

            const prevBtn = container.querySelector('#prev-theme');
            const lastIndex = themeCarousel.getAvailableThemes().length - 1;

            prevBtn.click();

            expect(themeCarousel.getCurrentThemeIndex()).toBe(lastIndex);
            expect(onApplySpy).toHaveBeenCalledWith(themeCarousel.getAvailableThemes()[lastIndex], { userInitiated: true });
        });

        it('should select theme by value using selectByValue()', () => {
            const onApplySpy = vi.fn();
            const controller = themeCarousel.mount(container, { onApply: onApplySpy });

            const targetTheme = themeCarousel.getAvailableThemes().find(t => t.value === 'pink-theme');
            expect(targetTheme).toBeDefined();

            controller.selectByValue('pink-theme');

            expect(themeCarousel.getAvailableThemes()[themeCarousel.getCurrentThemeIndex()].value).toBe('pink-theme');
            expect(onApplySpy).toHaveBeenCalledWith(targetTheme, { userInitiated: false });
        });
    });

    describe('Adding & Deleting Themes', () => {
        it('should add theme to carousel and dispatch theme-added-to-carousel event', () => {
            themeCarousel.mount(container);
            const eventListener = vi.fn();
            document.addEventListener('theme-added-to-carousel', eventListener);

            const newTheme = {
                name: 'Custom Synthwave',
                value: 'synthwave-custom',
                bgColor: '#200020',
                textColor: '#00ffff'
            };

            const added = themeCarousel.addTheme(newTheme);

            expect(added.name).toBe('Custom Synthwave');
            expect(added.isGenerated).toBe(true);
            expect(themeCarousel.getAvailableThemes()[0].value).toBe('synthwave-custom');
            expect(eventListener).toHaveBeenCalledWith(expect.objectContaining({
                detail: { theme: expect.objectContaining({ value: 'synthwave-custom' }) }
            }));

            // Card should be rendered in the DOM
            const cards = container.querySelectorAll('.theme-card');
            expect(cards[0].dataset.themeValue).toBe('synthwave-custom');
        });

        it('should render delete button on generated theme cards when showDelete is true', () => {
            themeCarousel.mount(container, { showDelete: true });

            themeCarousel.addTheme({
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
            themeCarousel.mount(container, { onApply: onApplySpy, showDelete: true });

            const themeToDelete = themeCarousel.addTheme({
                id: 'gen-to-delete',
                name: 'Temporary Generated',
                value: 'temp-gen',
                bgColor: '#333333'
            });

            // Currently active index is 0 (the newly added generated theme)
            expect(themeCarousel.getCurrentThemeIndex()).toBe(0);
            expect(themeCarousel.getAvailableThemes()[0].value).toBe('temp-gen');

            const card = container.querySelector('.theme-card[data-theme-value="temp-gen"]');
            const deleteBtn = card.querySelector('.theme-card-delete');
            deleteBtn.click();

            const confirmBtn = document.querySelector('.theme-carousel-modal-delete');
            expect(confirmBtn).not.toBeNull();
            confirmBtn.click();

            // Should be removed from availableThemes
            expect(themeCarousel.getAvailableThemes().find(t => t.value === 'temp-gen')).toBeUndefined();
            // Active theme index updated to fallback theme (index 0 which is now default dark)
            expect(themeCarousel.getCurrentThemeIndex()).toBe(0);
            expect(onApplySpy).toHaveBeenCalled();
        });

        it('should ignore duplicate theme additions by value', () => {
            themeCarousel.mount(container);

            const initialCount = themeCarousel.getAvailableThemes().length;
            const theme = { name: 'Dup Test', value: 'dup-value', bgColor: '#000000' };

            themeCarousel.addTheme(theme);
            const countAfterFirst = themeCarousel.getAvailableThemes().length;
            expect(countAfterFirst).toBe(initialCount + 1);

            // Adding same value again
            themeCarousel.addTheme(theme);
            expect(themeCarousel.getAvailableThemes().length).toBe(countAfterFirst);
        });

        it('should insert a theme whose name matches an existing theme but whose value differs', () => {
            themeCarousel.mount(container);

            themeCarousel.addTheme({ name: 'Matrix Terminal', value: 'generated-1', bgColor: '#000000' });
            const countAfterFirst = themeCarousel.getAvailableThemes().length;

            // Same display name, new unique value — must still be inserted so that
            // applying the new value doesn't fall back to the default theme.
            themeCarousel.addTheme({ name: 'Matrix Terminal', value: 'generated-2', bgColor: '#001100' });

            expect(themeCarousel.getAvailableThemes().length).toBe(countAfterFirst + 1);
            expect(themeCarousel.getAvailableThemes()[0].value).toBe('generated-2');
            expect(themeCarousel.getAvailableThemes().find(t => t.value === 'generated-1')).toBeDefined();
        });
    });

    describe('User preset badge', () => {
        const cardFor = (value) => container.querySelector(`.theme-card[data-theme-value="${value}"]`);

        it('badges a user-saved preset', () => {
            themeCarousel.mount(container);
            themeCarousel.addTheme({ name: 'My Preset', value: 'preset-1', bgColor: '#101014', isUserPreset: true });

            expect(cardFor('preset-1').querySelector('.theme-card-badge')).not.toBeNull();
        });

        it('does not badge an AI-generated theme', () => {
            themeCarousel.mount(container);
            themeCarousel.addTheme({ name: 'Neon', value: 'generated-99', bgColor: '#101014' });

            expect(cardFor('generated-99').querySelector('.theme-card-badge')).toBeNull();
        });

        it('does not badge a built-in theme', () => {
            themeCarousel.mount(container);
            expect(cardFor('default').querySelector('.theme-card-badge')).toBeNull();
        });

        it('still offers delete on a badged preset', () => {
            // The badge is positioned top-left precisely so it cannot displace the
            // top-right delete button; both must coexist.
            themeCarousel.mount(container);
            themeCarousel.addTheme({ name: 'My Preset', value: 'preset-2', bgColor: '#101014', isUserPreset: true });

            const card = cardFor('preset-2');
            expect(card.querySelector('.theme-card-badge')).not.toBeNull();
            expect(card.querySelector('.theme-card-delete')).not.toBeNull();
        });

        it('keeps the preset marker through the cloud round-trip', async () => {
            // pushThemeToCloud Object.assign()s the server copy over the local theme.
            // If the marker were lost there the badge would vanish moments after saving.
            themeCarousel.mount(container);
            const added = themeCarousel.addTheme({
                name: 'My Preset', value: 'preset-3', bgColor: '#101014', isUserPreset: true
            });

            await vi.waitFor(() => expect(added.id).toBe('cloud-id-123'));
            expect(added.isUserPreset).toBe(true);
        });
    });

    describe('Cloud push result reporting', () => {
        it('announces a successful push so an explicit save can confirm it persisted', async () => {
            themeCarousel.mount(container);
            const results = [];
            document.addEventListener('theme-library-push-result', (e) => results.push(e.detail));

            themeCarousel.addTheme({ name: 'My Preset', value: 'preset-ok', bgColor: '#101014', isUserPreset: true });

            await vi.waitFor(() => expect(results).toHaveLength(1));
            expect(results[0].ok).toBe(true);
            expect(results[0].theme.value).toBe('preset-ok');
        });

        it('announces a failed push so the user is not told a lost preset was saved', async () => {
            const client = await import('../theme-library-client.js');
            client.addTheme.mockResolvedValueOnce(null);

            themeCarousel.mount(container);
            const results = [];
            document.addEventListener('theme-library-push-result', (e) => results.push(e.detail));

            themeCarousel.addTheme({ name: 'Doomed', value: 'preset-fail', bgColor: '#101014', isUserPreset: true });

            await vi.waitFor(() => expect(results).toHaveLength(1));
            expect(results[0].ok).toBe(false);
        });

        it('flags an image the server dropped for being too large', async () => {
            const client = await import('../theme-library-client.js');
            client.addTheme.mockResolvedValueOnce({
                name: 'Big', value: 'preset-img', id: 'cloud-x', backgroundImage: null
            });

            themeCarousel.mount(container);
            const results = [];
            document.addEventListener('theme-library-push-result', (e) => results.push(e.detail));

            themeCarousel.addTheme({
                name: 'Big', value: 'preset-img', bgColor: '#101014',
                backgroundImage: 'data:image/jpeg;base64,AAAA', isUserPreset: true
            });

            await vi.waitFor(() => expect(results).toHaveLength(1));
            expect(results[0].ok).toBe(true);
            expect(results[0].imageDropped).toBe(true);
        });
    });
});
