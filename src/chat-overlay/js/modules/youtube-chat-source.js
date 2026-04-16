import { ChatSource } from './chat-source.js';

export class YouTubeChatSource extends ChatSource {
    constructor(configManager, chatRenderer) {
        super();
        this.configManager = configManager;
        this.chatRenderer = chatRenderer;
        this.ws = null;
        this.target = '';
        this.isExplicitDisconnect = false;
        this.isConnecting = false;
        this.status = false;
        this.reconnectTimeout = null;
        this.seenIds = new Set();
    }

    async connect(target) {
        // Prevent duplicate connections
        if (this.isConnecting) return;
        if (this.status && this.target === target) return;

        this.isConnecting = true;

        // Silently clean up any existing socket without emitting state changes
        if (this.ws) {
            try { this.ws.onclose = null; this.ws.onerror = null; this.ws.close(); } catch(e) {}
            this.ws = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        this.target = target;
        this.isExplicitDisconnect = false;
        this.chatRenderer.addSystemMessage(`Connecting to YouTube: ${target}...`, true);
        
        this.configManager.updateConfig('lastYouTubeTarget', this.target);

        const wsUrl = `ws://localhost:8092/ws`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
        } catch (err) {
            this.isConnecting = false;
            this.chatRenderer.addSystemMessage(`Could not connect to proxy: ${err}`, true);
        }
    }

    handleOpen() {
        this.isConnecting = false;
        this.ws.send(JSON.stringify({
            action: 'JOIN',
            target: this.target
        }));
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'system') {
                if (data.status === 'connected') {
                    this.status = true;
                    this.emitConnectionChange(true, this.target);
                } else if (data.message) {
                    this.chatRenderer.addSystemMessage(`YouTube: ${data.message}`, true);
                }
            } else if (data.type === 'message') {
                // Client-side dedup by message ID
                if (data.id && this.seenIds.has(data.id)) return;
                if (data.id) {
                    this.seenIds.add(data.id);
                    // Cap size to prevent memory leak
                    if (this.seenIds.size > 2000) {
                        const arr = [...this.seenIds].slice(500);
                        this.seenIds = new Set(arr);
                    }
                }
                this.chatRenderer.addChatMessage(data);
            }
        } catch (err) {
            console.error('Failed to parse YouTube message:', err);
        }
    }

    handleClose() {
        this.status = false;
        this.isConnecting = false;
        this.ws = null;
        
        if (!this.isExplicitDisconnect && this.target) {
            // Don't emit false — we're about to reconnect, keep UI stable
            this.chatRenderer.addSystemMessage('YouTube connection lost. Reconnecting in 5s...', true);
            this.reconnectTimeout = setTimeout(() => this.connect(this.target), 5000);
        } else {
            this.emitConnectionChange(false, '');
        }
    }

    handleError(err) {
        console.error('YouTube WebSocket error:', err);
    }

    disconnect() {
        this.isExplicitDisconnect = true;
        this.isConnecting = false;
        this.status = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            try { this.ws.onclose = null; this.ws.close(); } catch(e) {}
            this.ws = null;
        }
        this.target = '';
        this.emitConnectionChange(false, '');
    }

    isConnected() { return this.status; }
    isActive() { return this.status || this.isConnecting || this.ws !== null || this.reconnectTimeout !== null; }
    getCurrentTarget() { return this.target; }
}
