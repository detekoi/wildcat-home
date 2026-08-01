import { describe, it, expect, beforeEach } from 'vitest';

describe('Live Preview Background Selector', () => {
    let container;
    let colorInput;
    let customSwatch;
    let btns;
    let appDom;
    let setupPreviewBgSelector;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="previewIframeContainer" class="preview-iframe-container bg-checkerboard">
                <iframe id="previewIframe"></iframe>
            </div>
            <div id="previewBgPicker">
                <button type="button" class="preview-bg-btn" data-bg-type="dark">Dark</button>
                <button type="button" class="preview-bg-btn" data-bg-type="light">Light</button>
                <button type="button" class="preview-bg-btn active" data-bg-type="checkerboard">Grid</button>
                <button type="button" class="preview-bg-btn" data-bg-type="custom"><span id="previewCustomSwatch"></span> Custom</button>
                <input type="color" id="previewBgColorInput" value="#121212">
            </div>
        `;

        container = document.getElementById('previewIframeContainer');
        colorInput = document.getElementById('previewBgColorInput');
        customSwatch = document.getElementById('previewCustomSwatch');
        btns = document.querySelectorAll('.preview-bg-btn');

        appDom = {
            previewIframeContainer: container,
            previewBgBtns: btns,
            previewBgColorInput: colorInput,
            previewCustomSwatch: customSwatch
        };

        setupPreviewBgSelector = function() {
            const STORAGE_KEY = 'chat_overlay_preview_bg';

            const getSavedBg = () => {
                try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    return saved ? JSON.parse(saved) : { type: 'checkerboard', color: '#121212' };
                } catch (e) {
                    return { type: 'checkerboard', color: '#121212' };
                }
            };

            const saveBg = (bgState) => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(bgState));
                } catch (e) {
                    // silent fallback
                }
            };

            let currentBg = getSavedBg();
            if (colorInput && currentBg.color) {
                colorInput.value = currentBg.color;
                if (customSwatch) customSwatch.style.background = currentBg.color;
            }

            const applyBg = (type, customColor) => {
                container.classList.remove('bg-checkerboard');
                container.style.backgroundImage = '';

                if (type === 'dark') {
                    container.style.backgroundColor = '#000000';
                } else if (type === 'light') {
                    container.style.backgroundColor = '#ffffff';
                } else if (type === 'custom') {
                    const hex = customColor || colorInput.value || '#121212';
                    container.style.backgroundColor = hex;
                    if (customSwatch) customSwatch.style.background = hex;
                } else {
                    type = 'checkerboard';
                    container.classList.add('bg-checkerboard');
                }

                btns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.bgType === type);
                });

                currentBg = { type, color: colorInput.value };
                saveBg(currentBg);
            };

            btns.forEach(btn => {
                const type = btn.dataset.bgType;
                if (type !== 'custom') {
                    btn.addEventListener('click', () => applyBg(type));
                }
            });

            if (colorInput) {
                const handleCustomInput = (e) => {
                    const hex = e.target.value;
                    if (customSwatch) customSwatch.style.background = hex;
                    applyBg('custom', hex);
                };
                colorInput.addEventListener('input', handleCustomInput);
                colorInput.addEventListener('change', handleCustomInput);
                colorInput.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyBg('custom', colorInput.value);
                });
            }

            applyBg(currentBg.type, currentBg.color);
        };
    });

    it('defaults to checkerboard (grid) background on initial setup', () => {
        setupPreviewBgSelector();
        expect(container.classList.contains('bg-checkerboard')).toBe(true);
        const activeBtn = document.querySelector('.preview-bg-btn.active');
        expect(activeBtn.dataset.bgType).toBe('checkerboard');
    });

    it('switches to dark background when Dark button is clicked', () => {
        setupPreviewBgSelector();
        const darkBtn = document.querySelector('[data-bg-type="dark"]');
        darkBtn.click();

        expect(container.style.backgroundColor).toBe('rgb(0, 0, 0)');
        expect(darkBtn.classList.contains('active')).toBe(true);
        expect(JSON.parse(localStorage.getItem('chat_overlay_preview_bg')).type).toBe('dark');
    });

    it('switches to light background when Light button is clicked', () => {
        setupPreviewBgSelector();
        const lightBtn = document.querySelector('[data-bg-type="light"]');
        lightBtn.click();

        expect(container.style.backgroundColor).toBe('rgb(255, 255, 255)');
        expect(lightBtn.classList.contains('active')).toBe(true);
        expect(JSON.parse(localStorage.getItem('chat_overlay_preview_bg')).type).toBe('light');
    });

    it('switches to custom background color on color input change', () => {
        setupPreviewBgSelector();
        colorInput.value = '#8a2be2';
        colorInput.dispatchEvent(new Event('input'));

        expect(container.style.backgroundColor).toBe('rgb(138, 43, 226)');
        const customBtn = document.querySelector('[data-bg-type="custom"]');
        expect(customBtn.classList.contains('active')).toBe(true);
        expect(JSON.parse(localStorage.getItem('chat_overlay_preview_bg')).type).toBe('custom');
    });
});
