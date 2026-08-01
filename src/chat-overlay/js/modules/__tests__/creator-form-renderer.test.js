import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreatorFormRenderer } from '../creator-form-renderer.js';
import { ConfigManager } from '../config-manager.js';

describe('CreatorFormRenderer - Range Slider Live Drag Updates', () => {
    let formRenderer;
    let configManager;
    let container;
    let previewIframe;
    let postMessageSpy;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="formContainer"></div>
            <iframe id="previewIframe"></iframe>
            <div id="fontPickerMount"></div>
        `;

        container = document.getElementById('formContainer');
        previewIframe = document.getElementById('previewIframe');
        
        postMessageSpy = vi.fn();
        if (previewIframe.contentWindow) {
            previewIframe.contentWindow.postMessage = postMessageSpy;
        } else {
            Object.defineProperty(previewIframe, 'contentWindow', {
                value: { postMessage: postMessageSpy },
                writable: true,
                configurable: true
            });
        }

        configManager = new ConfigManager();
        formRenderer = new CreatorFormRenderer({
            configManager: configManager,
            previewIframe: previewIframe
        });
    });

    it('updates range slider display value and triggers live preview on input event during dragging', () => {
        formRenderer.renderSchemaForm(container);
        formRenderer.setupFormLivePreview();

        const rangeInput = document.getElementById('schema-input-fontSize');
        const valDisplay = document.getElementById('schema-val-fontSize');

        expect(rangeInput).not.toBeNull();
        expect(valDisplay).not.toBeNull();

        // Change range value and dispatch 'input' event (simulates dragging slider thumb)
        rangeInput.value = '24';
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(valDisplay.textContent).toBe('24');
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'PREVIEW_CONFIG_UPDATE',
                config: expect.objectContaining({
                    fontSize: 24
                })
            }),
            window.location.origin
        );
    });

    it('updates scaled range slider display percentage on input event during dragging', () => {
        formRenderer.renderSchemaForm(container);
        formRenderer.setupFormLivePreview();

        const rangeInput = document.getElementById('schema-input-bgColorOpacity');
        const valDisplay = document.getElementById('schema-val-bgColorOpacity');

        expect(rangeInput).not.toBeNull();
        expect(valDisplay).not.toBeNull();

        rangeInput.value = '0.5';
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(valDisplay.textContent).toBe('50%');
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'PREVIEW_CONFIG_UPDATE',
                config: expect.objectContaining({
                    bgColorOpacity: 0.5
                })
            }),
            window.location.origin
        );
    });

    it('also responds to change event when slider drag is released', () => {
        formRenderer.renderSchemaForm(container);
        formRenderer.setupFormLivePreview();

        const rangeInput = document.getElementById('schema-input-fontSize');
        const valDisplay = document.getElementById('schema-val-fontSize');

        rangeInput.value = '30';
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));

        expect(valDisplay.textContent).toBe('30');
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'PREVIEW_CONFIG_UPDATE',
                config: expect.objectContaining({
                    fontSize: 30
                })
            }),
            window.location.origin
        );
    });
});

// theme-carousel.js is owned by a concurrent agent, so these tests stub the
// window.themeCarousel.mount({ onApply, showDelete }) -> { destroy, refresh, selectByValue }
// contract rather than depending on the real implementation.
describe('CreatorFormRenderer - Theme Carousel Control', () => {
    let formRenderer;
    let configManager;
    let container;
    let previewIframe;
    let postMessageSpy;
    let themeCarouselMock;
    let capturedOnApply;
    let carouselController;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="formContainer"></div>
            <iframe id="previewIframe"></iframe>
            <div id="fontPickerMount"></div>
        `;

        container = document.getElementById('formContainer');
        previewIframe = document.getElementById('previewIframe');

        postMessageSpy = vi.fn();
        Object.defineProperty(previewIframe, 'contentWindow', {
            value: { postMessage: postMessageSpy },
            writable: true,
            configurable: true
        });

        capturedOnApply = null;
        carouselController = {
            destroy: vi.fn(),
            refresh: vi.fn(),
            selectByValue: vi.fn()
        };
        themeCarouselMock = {
            mount: vi.fn((mountEl, opts) => {
                capturedOnApply = opts.onApply;
                return carouselController;
            }),
            addTheme: vi.fn()
        };
        window.themeCarousel = themeCarouselMock;

        configManager = new ConfigManager();
        formRenderer = new CreatorFormRenderer({
            configManager,
            previewIframe
        });
    });

    afterEach(() => {
        delete window.themeCarousel;
    });

    it('renders an empty mount point and hands it to window.themeCarousel.mount()', () => {
        formRenderer.renderSchemaForm(container);

        const mountDiv = document.getElementById('schema-themecarousel-theme');
        expect(mountDiv).not.toBeNull();
        expect(mountDiv.children.length).toBe(0);

        expect(themeCarouselMock.mount).toHaveBeenCalledTimes(1);
        expect(themeCarouselMock.mount.mock.calls[0][0]).toBe(mountDiv);
        expect(typeof capturedOnApply).toBe('function');

        // No plain <select> is rendered for the theme control anymore.
        const themeValueHolder = document.getElementById('schema-input-theme');
        expect(themeValueHolder).not.toBeNull();
        expect(themeValueHolder.tagName).toBe('INPUT');
        expect(themeValueHolder.type).toBe('hidden');
        expect(document.querySelector('select#schema-input-theme')).toBeNull();
    });

    it('still renders the rest of the form when window.themeCarousel is absent', () => {
        delete window.themeCarousel;
        formRenderer.renderSchemaForm(container);

        expect(document.getElementById('schema-themecarousel-theme')).not.toBeNull();
        expect(document.getElementById('schema-input-bgColor')).not.toBeNull();
    });

    it('onApply(theme) writes theme colors into the form via updateColorControl and updates the theme value', () => {
        formRenderer.renderSchemaForm(container);
        expect(typeof capturedOnApply).toBe('function');

        capturedOnApply({
            value: 'pink-theme',
            name: 'Pink',
            bgColor: '#ff00aa',
            borderColor: '#ff11bb',
            textColor: '#ffffff',
            usernameColor: '#123456',
            timestampColor: '#abcdef',
            pronounBadgeColor: '#654321',
            backgroundImage: 'data:image/png;base64,abc'
        });

        expect(document.getElementById('schema-input-bgColor').value.toLowerCase()).toBe('#ff00aa');
        expect(document.getElementById('schema-hex-bgColor').value).toBe('#FF00AA');
        expect(document.getElementById('schema-input-borderColor').value.toLowerCase()).toBe('#ff11bb');
        expect(document.getElementById('schema-input-textColor').value.toLowerCase()).toBe('#ffffff');
        expect(document.getElementById('schema-input-usernameColor').value.toLowerCase()).toBe('#123456');
        expect(document.getElementById('schema-input-timestampColor').value.toLowerCase()).toBe('#abcdef');
        expect(document.getElementById('schema-input-pronounBadgeColor').value.toLowerCase()).toBe('#654321');
        expect(document.getElementById('schema-input-theme').value).toBe('pink-theme');
        expect(formRenderer.currentBgImage).toBe('data:image/png;base64,abc');

        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'PREVIEW_CONFIG_UPDATE',
                config: expect.objectContaining({
                    theme: 'pink-theme',
                    bgColor: '#ff00aa'
                })
            }),
            window.location.origin
        );
    });

    it('populateForm() syncs the carousel selection via selectByValue()', () => {
        formRenderer.renderSchemaForm(container);

        formRenderer.populateForm({
            id: 'scene-1',
            name: 'Test Scene',
            config: { theme: 'cyberpunk-theme' }
        }, {});

        expect(carouselController.selectByValue).toHaveBeenCalledWith('cyberpunk-theme');
        expect(document.getElementById('schema-input-theme').value).toBe('cyberpunk-theme');
    });
});
