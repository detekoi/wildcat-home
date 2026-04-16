import { ChatSource } from './chat-source.js';

export class YouTubeChatSource extends ChatSource {
    constructor(configManager, chatRenderer) {
        super();
        this.configManager = configManager;
        this.chatRenderer = chatRenderer;
        this.ws = null;
        this.target = '';
        this.isExplicitDisconnect = false;
        this.status = false;
        this.reconnectTimeout = null;
    }

    async connect(target) {
        if (this.ws) {
            this.disconnect();
        }
        
        this.target = target;
        this.isExplicitDisconnect = false;
        this.chatRenderer.addSystemMessage(`Connecting to YouTube: ${target}...`, true);
        
        this.configManager.updateConfig('lastYouTubeTarget', this.target);
        // Wait, for scene specific logic, we should probably save it like twitch does.
        // For now, updating config is enough for the UI to persist it.

        const wsUrl = `ws://localhost:8092/ws`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);
        } catch (err) {
            this.chatRenderer.addSystemMessage(`Could not connect to proxy: ${err}`, true);
        }
    }

    handleOpen() {
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
                    this.chatRenderer.addSystemMessage(`YouTube: ${data.message}`);
                }
            } else if (data.type === 'message') {
                this.chatRenderer.addChatMessage(data);
            }
        } catch (err) {
            console.error('Failed to parse YouTube message:', err);
        }
    }

    handleClose() {
        this.status = false;
        this.emitConnectionChange(false, '');
        
        if (!this.isExplicitDisconnect) {
            this.chatRenderer.addSystemMessage('YouTube connection lost. Reconnecting in 5s...');
            this.reconnectTimeout = setTimeout(() => this.connect(this.target), 5000);
        }
    }

    handleError(err) {
        console.error('YouTube WebSocket error:', err);
    }

    disconnect() {
        this.isExplicitDisconnect = true;
        this.status = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.target = '';
        this.emitConnectionChange(false, '');
    }

    isConnected() { return this.status; }
    getCurrentTarget() { return this.target; }
}
