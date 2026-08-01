import { describe, it, expect, vi, beforeEach } from 'vitest';
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
