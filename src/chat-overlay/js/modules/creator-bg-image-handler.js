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
            <label style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block;">Background Image</label>
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                <input type="file" id="creatorBgFile" accept="image/*" style="font-size: 12px; flex: 1; min-width: 0;">
                <button type="button" class="btn btn-secondary" id="creatorBgClear" style="padding: 4px 8px; font-size: 12px;">Clear Image</button>
            </div>
            <div id="creatorBgPreview" style="font-size: 12px; opacity: 0.7;">No background image set</div>
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
            });
        }
    }

    updatePreviewText(text) {
        const previewEl = document.getElementById('creatorBgPreview');
        if (previewEl) previewEl.textContent = text;
    }
}
