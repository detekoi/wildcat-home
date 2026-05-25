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

        // Clean up target if the user pasted a full URL
        let cleanTarget = target.trim();
        try {
            // Handle full YouTube URLs
            const url = new URL(cleanTarget.startsWith('http') ? cleanTarget : `https://${cleanTarget}`);
            const host = url.hostname;
            
            if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
                // Extract video ID from watch?v= or youtu.be/
                const vidParam = url.searchParams.get('v');
                if (vidParam) {
                    cleanTarget = vidParam;
                } else if (host === 'youtu.be') {
                    cleanTarget = url.pathname.slice(1);
                }
                // Extract video ID from /live/VIDEO_ID format
                else if (url.pathname.startsWith('/live/')) {
                    cleanTarget = url.pathname.split('/')[2];
                }
                // Extract handle from /@handle
                else if (url.pathname.startsWith('/@')) {
                    cleanTarget = url.pathname.split('/')[1]; // @handle
                }
            }
        } catch (e) {
            // If URL parsing fails, ignore and try the string as provided
        }

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
        
        this.target = cleanTarget;
        this.isExplicitDisconnect = false;
        this.chatRenderer.addSystemMessage(`Connecting to YouTube: ${this.target}...`, true);
        
        this.configManager.updateConfig('lastYouTubeTarget', this.target);

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '';
        const wsUrl = isLocalhost 
            ? 'ws://localhost:8092/ws' 
            : 'wss://ytchat.wildcat.chat/ws';
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = this.handleOpen.bind(this);
            this.ws.onmessage = this.handleMessage.bind(this);
            this.ws.onclose = this.handleClose.bind(this);
            this.ws.onerror = this.handleError.bind(this);

            // Start client-side heartbeat to keep Cloud Run connection alive
            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ action: 'PING' }));
                }
            }, 30000); // 30 seconds
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
                    this.reconnectFailures = 0;
                    this.emitConnectionChange(true, this.target);
                } else if (data.message) {
                    this.chatRenderer.addSystemMessage(`YouTube: ${data.message}`, true);
                    
                    // If the server gave up polling because the stream isn't live yet,
                    // forcefully close the connection so our auto-reconnect loop takes over.
                    // This ensures the overlay recovers if left open for hours before going live.
                    if (data.message.includes("Could not find a live stream") || data.message.includes("Lost connection")) {
                        if (this.ws) {
                            this.ws.close();
                        }
                    }
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
        this.isConnecting = false;
        this.status = false;
        this.ws = null;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        if (!this.isExplicitDisconnect && this.target) {
            // Silent reconnect — don't disrupt the chat overlay with system messages
            // for routine Cloud Run timeouts or transient disconnects
            this.reconnectFailures = (this.reconnectFailures || 0) + 1;
            const delay = Math.min(5000 * this.reconnectFailures, 30000);
            
            // Only show a message after 3+ consecutive failures (persistent problem)
            if (this.reconnectFailures >= 3) {
                this.chatRenderer.addSystemMessage(`YouTube reconnecting... (attempt ${this.reconnectFailures})`, true);
            }
            
            this.reconnectTimeout = setTimeout(() => this.connect(this.target), delay);
        } else {
            this.status = false;
            this.reconnectFailures = 0;
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
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.target = '';
        this.emitConnectionChange(false, '');
    }

    isConnected() { return this.status; }
    isActive() { return this.status || this.isConnecting || this.ws !== null || this.reconnectTimeout !== null; }
    getCurrentTarget() { return this.target; }
}
