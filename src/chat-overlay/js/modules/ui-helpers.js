/**
 * UI Helper Functions Module
 * Provides utility functions for color conversion, CSS value mapping, and URL parameter parsing
 */

export class UIHelpers {
    /**
     * Converts a hex color string and an opacity value (0-1) to an rgba string.
     */
    static hexToRgba(hex, opacity) {
        if (typeof hex === 'string' && hex.trim().toLowerCase().startsWith('rgba')) {
            console.warn(`[hexToRgba] Received rgba value "${hex}" instead of hex. Returning directly.`);
            return hex; // Input is already rgba
        }

        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
            console.warn(`Invalid hex format provided to hexToRgba: ${hex}`);
            return `rgba(0, 0, 0, ${opacity})`; // Default black if hex invalid
        }

        let r = 0, g = 0, b = 0;
        if (hex.length === 4) { // 3 digit hex
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) { // 6 digit hex
            r = parseInt(hex[1] + hex[2], 16);
            g = parseInt(hex[3] + hex[4], 16);
            b = parseInt(hex[5] + hex[6], 16);
        } else {
            console.warn(`Invalid hex format provided to hexToRgba: ${hex}`);
            return `rgba(0, 0, 0, ${opacity})`;
        }

        opacity = Math.max(0, Math.min(1, opacity)); // Ensure opacity is within bounds
        return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;
    }

    /**
     * Parses any hex, rgb, or rgba color string into { hex: '#rrggbb', opacity: 0-1 }.
     */
    static parseColor(colorStr) {
        if (!colorStr || typeof colorStr !== 'string') {
            return { hex: '#121212', opacity: 0.85 };
        }
        const str = colorStr.trim().toLowerCase();

        // Handle rgb(...) and rgba(...)
        const rgbMatch = str.match(/^rgba?\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
        if (rgbMatch) {
            const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10) || 0));
            const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10) || 0));
            const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10) || 0));
            const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1.0;
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
            const opacity = !isNaN(a) ? Math.max(0, Math.min(1, a)) : 0.85;
            return { hex, opacity };
        }

        // Handle hex formats (#rgb, #rgba, #rrggbb, #rrggbbaa)
        if (str.startsWith('#')) {
            const hexVal = str.slice(1);
            if (hexVal.length === 3) {
                const hex = `#${hexVal[0]}${hexVal[0]}${hexVal[1]}${hexVal[1]}${hexVal[2]}${hexVal[2]}`;
                return { hex, opacity: 1.0 };
            }
            if (hexVal.length === 4) {
                const hex = `#${hexVal[0]}${hexVal[0]}${hexVal[1]}${hexVal[1]}${hexVal[2]}${hexVal[2]}`;
                const a = parseInt(`${hexVal[3]}${hexVal[3]}`, 16) / 255;
                return { hex, opacity: Math.max(0, Math.min(1, parseFloat(a.toFixed(2)))) };
            }
            if (hexVal.length === 6) {
                return { hex: str, opacity: 1.0 };
            }
            if (hexVal.length === 8) {
                const hex = `#${hexVal.slice(0, 6)}`;
                const a = parseInt(hexVal.slice(6, 8), 16) / 255;
                return { hex, opacity: Math.max(0, Math.min(1, parseFloat(a.toFixed(2)))) };
            }
        }

        return { hex: str.startsWith('#') ? str : '#121212', opacity: 0.85 };
    }

    /**
     * Get border radius CSS value from preset name or direct value
     */
    static getBorderRadiusValue(value) {
        if (!value) return '8px'; // Default
        const borderRadiusMap = {
            'None': '0px', 'none': '0px',
            'Subtle': '8px', 'subtle': '8px',
            'Rounded': '16px', 'rounded': '16px',
            'Pill': '24px', 'pill': '24px',
            'Sharp': '0px', 'sharp': '0px'
        };
        if (borderRadiusMap[value]) return borderRadiusMap[value];
        if (typeof value === 'string' && value.endsWith('px')) return value;
        console.warn(`Unknown border radius value: ${value}. Defaulting to 8px.`);
        return '8px';
    }

    /**
     * Get box shadow CSS value from preset name or direct value
     */
    static getBoxShadowValue(preset) {
        if (!preset) return 'none';
        const boxShadowMap = {
            'none': 'none',
            'soft': 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
            'simple3d': 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px',
            'simple 3d': 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px',
            'intense3d': 'rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px',
            'intense 3d': 'rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px',
            'sharp': '8px 8px 0px 0px rgba(0, 0, 0, 0.9)'
        };
        const presetLower = preset.toLowerCase();
        if (boxShadowMap[presetLower]) return boxShadowMap[presetLower];
        if (preset === 'none' || preset.includes('rgba') || preset.includes('px')) return preset;
        return 'none';
    }

    /**
     * Get text shadow CSS value from preset name.
     */
    static getTextShadowValue(preset) {
        if (!preset) return 'none';
        const textShadowMap = {
            'none': 'none',
            'soft': '1px 1px 2px rgba(0, 0, 0, 0.4), 0 0 3px rgba(0, 0, 0, 0.2)',
            'sharp': '1px 1px 0 rgba(0,0,0,0.9)',
            'outline': '1px 1px 0 rgba(0, 0, 0, 0.9), -1px -1px 0 rgba(0, 0, 0, 0.9), 1px -1px 0 rgba(0, 0, 0, 0.9), -1px 1px 0 rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.7)',
            'strong': '0 0 2px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.85)',
            'glow': '0 0 8px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 0, 0, 0.4)'
        };
        return textShadowMap[preset.toLowerCase()] || 'none';
    }

    /**
     * Fix any CSS variables that contain preset names instead of actual CSS values.
     */
    static fixCssVariables() {
        const borderRadius = document.documentElement.style.getPropertyValue('--chat-border-radius').trim();
        const boxShadow = document.documentElement.style.getPropertyValue('--chat-box-shadow').trim();

        if (borderRadius) {
            const borderRadiusMap = {
                'None': '0px', 'none': '0px',
                'Subtle': '8px', 'subtle': '8px',
                'Rounded': '16px', 'rounded': '16px',
                'Pill': '24px', 'pill': '24px'
            };
            if (borderRadiusMap[borderRadius]) {
                const cssValue = borderRadiusMap[borderRadius];
                if (borderRadius !== cssValue) {
                    document.documentElement.style.setProperty('--chat-border-radius', cssValue);
                }
            }
        }

        if (boxShadow) {
            const boxShadowMap = {
                'None': 'none', 'none': 'none',
                'Soft': 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px', 'soft': 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
                'Simple 3D': 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px', 'simple 3d': 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px', 'simple3d': 'rgba(0, 0, 0, 0.12) 0px 1px 3px, rgba(0, 0, 0, 0.24) 0px 1px 2px',
                'Intense 3D': 'rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px', 'intense 3d': 'rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px', 'intense3d': 'rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px',
                'Sharp': '8px 8px 0px 0px rgba(0, 0, 0, 0.9)', 'sharp': '8px 8px 0px 0px rgba(0, 0, 0, 0.9)'
            };
            if (boxShadowMap[boxShadow]) {
                const cssValue = boxShadowMap[boxShadow];
                if (boxShadow !== cssValue) {
                    document.documentElement.style.setProperty('--chat-box-shadow', cssValue);
                }
            }
        }
    }

    /**
     * Highlight the active border radius button based on CSS value
     */
    static highlightBorderRadiusButton(cssValue, borderRadiusPresets) {
        if (borderRadiusPresets) {
            const buttons = borderRadiusPresets.querySelectorAll('.preset-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === cssValue);
            });
        }
    }

    /**
     * Highlight the active box shadow button based on preset name
     */
    static highlightBoxShadowButton(presetName, boxShadowPresets) {
        if (boxShadowPresets) {
            const normalizedPreset = typeof presetName === 'string'
                ? presetName.toLowerCase().replace(/\s+/g, '')
                : 'none';
            const buttons = boxShadowPresets.querySelectorAll('.preset-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === normalizedPreset);
            });
        }
    }

    /**
     * Highlight the active text shadow button based on preset name
     */
    static highlightTextShadowButton(presetName, textShadowPresets) {
        if (textShadowPresets) {
            const buttons = textShadowPresets.querySelectorAll('.preset-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === presetName);
            });
        }
    }

    /**
     * Highlight the active font weight button based on weight value
     */
    static highlightFontWeightButton(weightValue, fontWeightPresets) {
        if (fontWeightPresets) {
            const buttons = fontWeightPresets.querySelectorAll('.preset-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === weightValue);
            });
        }
    }

    /**
     * Helper function to get URL parameters
     */
    static getUrlParameter(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
    }

    /**
     * Generate a visually distinct color from a username string
     */
    static generateColorFromName(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32bit integer
        }
        const h = Math.abs(hash) % 360;         // Hue (0-359)
        const s = 70 + (Math.abs(hash) % 31); // Saturation (70-100)
        const l = 45 + (Math.abs(hash) % 26); // Lightness (45-70) - Adjusted for better readability
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    /**
     * Escape HTML special characters
     */
    static escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Generate a cryptographically secure random ID
     */
    static generateSecureId(prefix = '') {
        if (typeof crypto !== 'undefined') {
            if (crypto.randomUUID) {
                return prefix ? `${prefix}-${crypto.randomUUID()}` : crypto.randomUUID();
            }
            if (crypto.getRandomValues) {
                const arr = new Uint32Array(4);
                crypto.getRandomValues(arr);
                const token = Array.from(arr, val => val.toString(16).padStart(8, '0')).join('-');
                return prefix ? `${prefix}-${token}` : token;
            }
        }
        const fallback = `${Date.now()}_${Math.random().toString(36).substring(2)}`;
        return prefix ? `${prefix}-${fallback}` : fallback;
    }

    /**
     * Generate a strictly UUID-shaped id.
     *
     * Distinct from generateSecureId(): the proxy validates every :token route
     * param against a UUID regex and 400s anything else, so tokens must be
     * well-formed UUIDs on EVERY code path. generateSecureId()'s last-resort
     * fallback is `Date.now()_<random>`, which is not — using it for a token
     * would make the resource unreachable on origins without crypto
     * (non-secure contexts, older webviews).
     *
     * @returns {string} A version-4 UUID.
     */
    static generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

        const randomByte = (typeof crypto !== 'undefined' && crypto.getRandomValues)
            ? () => crypto.getRandomValues(new Uint8Array(1))[0]
            : () => Math.floor(Math.random() * 256);

        const bytes = Array.from({ length: 16 }, randomByte);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
        const hex = bytes.map(b => b.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }

    /**
     * True when `value` is a well-formed UUID — the shape the proxy's
     * validateToken middleware requires of every token.
     * @param {string} value
     * @returns {boolean}
     */
    static isUUID(value) {
        return typeof value === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    /**
     * Coerce a sync token to the bare-UUID form the proxy accepts.
     *
     * A previous refactor minted tokens as `sync-<uuid>`, which the proxy rejects.
     * Those tokens are still sitting in saved scenes and in OBS browser-source URLs,
     * so every entry point normalizes rather than trusting its input. Critically,
     * the token is used BOTH as the REST path segment and as the Firestore document
     * id — normalizing in only one of those places would split reads from writes.
     *
     * @param {string} token
     * @returns {string|null} The lowercased bare UUID, or null if unusable.
     */
    static normalizeSyncToken(token) {
        if (typeof token !== 'string') return null;
        const trimmed = token.trim();
        const bare = trimmed.startsWith('sync-') ? trimmed.slice('sync-'.length) : trimmed;
        return UIHelpers.isUUID(bare) ? bare.toLowerCase() : null;
    }

    /**
     * Notification helper function that renders a floating toast notification.
     * @param {string} title - Notification title
     * @param {string} message - Notification subtext / description
     * @param {string} type - 'success' | 'warning' | 'error' | 'info'
     * @param {number} [duration=4000] - Duration in ms before auto-dismiss (0 to disable)
     */
    static showNotification(title, message, type = 'info', duration = 4000) {
        console.log(`[Notification ${type.toUpperCase()}] ${title}: ${message}`);

        if (typeof document === 'undefined') return null;

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        const icons = {
            success: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
            error: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            warning: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
            info: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
        };

        const iconHtml = icons[type] || icons.info;

        toast.innerHTML = `
            <div class="toast-icon-wrapper">${iconHtml}</div>
            <div class="toast-content">
                <div class="toast-title">${UIHelpers.escapeHtml(title)}</div>
                <div class="toast-message">${UIHelpers.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close notification">&times;</button>
        `;

        let autoDismissTimer = null;

        const removeToast = () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        };

        const dismiss = () => {
            if (autoDismissTimer) {
                clearTimeout(autoDismissTimer);
                autoDismissTimer = null;
            }
            if (toast.classList.contains('toast-hiding')) return;
            toast.classList.add('toast-hiding');
            toast.addEventListener('animationend', removeToast, { once: true });
            setTimeout(removeToast, 350);
        };

        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', dismiss);
        }

        container.appendChild(toast);

        if (duration > 0) {
            autoDismissTimer = setTimeout(dismiss, duration);
        }

        return toast;
    }
}

// Make functions globally available for backwards compatibility
window.getBorderRadiusValue = UIHelpers.getBorderRadiusValue;
window.getBoxShadowValue = UIHelpers.getBoxShadowValue;

