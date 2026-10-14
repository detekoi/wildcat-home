import { compressImageToBase64JPEG } from '../theme-generator.js';

export class CreatorBgImageHandler {
    constructor(formRenderer) {
        this.renderer = formRenderer;
        this.currentBgImage = null;
    }

    createBgImageBox() {
        const bgImgBox = document.createElement('div');
        bgImgBox.className = 'creator-bg-image-box creator-subcard';
        bgImgBox.innerHTML = `
            <label class="wc-note-label" for="creatorBgFile">Background image</label>
            <div class="creator-bg-image-controls">
                <input type="file" id="creatorBgFile" accept="image/*" class="creator-file-input">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="creatorBgClear">Clear image</button>
            </div>
            <div id="creatorBgPreview" class="wc-readout">No background image set</div>
        `;
        return bgImgBox;
    }

    setupListeners() {
        const bgFile = document.getElementById('creatorBgFile');
        const bgClear = document.getElementById('creatorBgClear');
        if (bgFile) {
            bgFile.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const compressFn = compressImageToBase64JPEG || (async (url) => url);
                        this.currentBgImage = await compressFn(evt.target.result, 0.85);
                        this.updatePreviewText('Custom image loaded');
                        this.renderer.sendPreviewUpdate();
                        if (this.renderer.onFormChange) this.renderer.onFormChange();
                    } catch (err) {
                        console.error('Failed to process background image:', err);
                    }
                };
                reader.readAsDataURL(file);
            });
        }
        if (bgClear) {
            bgClear.addEventListener('click', () => {
                this.currentBgImage = null;
                if (bgFile) bgFile.value = '';
                this.updatePreviewText('No background image set');
                this.renderer.sendPreviewUpdate();
                if (this.renderer.onFormChange) this.renderer.onFormChange();
            });
        }
    }

    updatePreviewText(text) {
        const previewEl = document.getElementById('creatorBgPreview');
        if (previewEl) previewEl.textContent = text;
    }
}
