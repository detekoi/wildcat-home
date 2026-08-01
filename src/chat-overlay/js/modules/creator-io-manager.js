/**
 * Creator I/O Manager Module
 * Static utility module for importing/exporting chat scene JSON configurations and clipboard handling.
 */

import { UIHelpers } from './ui-helpers.js';

export class CreatorIOManager {
    /**
     * Export a single scene instance to a JSON file download.
     */
    static exportInstance(instance) {
        if (!instance) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(instance, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const safeName = (instance.name || 'chat_scene').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
        downloadAnchor.setAttribute("download", `${safeName}_config.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    /**
     * Export all scene instances to a JSON file download.
     */
    static exportAllInstances(instances, instanceOrder) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
            instances: instances,
            instanceOrder: instanceOrder
        }, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `chat_scenes_export.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    /**
     * Trigger file picker and import scene instances from a JSON file.
     * Returns a Promise resolving to the parsed structure or null on failure.
     */
    static importInstanceFile(onSuccess, onError) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (onSuccess) onSuccess(parsed);
                } catch (err) {
                    console.error('Import failed:', err);
                    if (onError) onError(err);
                }
            };
            reader.readAsText(file);
        };
        fileInput.click();
    }

    /**
     * Copy text to clipboard and trigger notification.
     */
    static async copyUrl(text, onNotification = UIHelpers.showNotification) {
        try {
            await navigator.clipboard.writeText(text);
            onNotification('Copied', 'URL copied to clipboard!', 'success');
        } catch (err) {
            console.error('Failed to copy URL:', err);
            onNotification('Copy Failed', 'Please select and copy the text manually.', 'error');
        }
    }
}
