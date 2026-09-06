import { ChatSource } from './chat-source.js';
import { UIHelpers } from './ui-helpers.js';

// Liveness tuning. The client pings every PING_INTERVAL_MS and the proxy answers
// each one with a pong, so a healthy socket is never silent for longer than one
// ping period. (The proxy's own WebSocket-level pings are invisible to browser JS.)
const PING_INTERVAL_MS = 30000;
const CONNECT_TIMEOUT_MS = 15000;
const STALE_AFTER_MS = 90000;
const WATCHDOG_TICK_MS = 15000;

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
        this.reconnectFailures = 0;
        this.seenIds = new Set();
        this.pingInterval = null;
        this.connectTimeout = null;
        this.watchdogInterval = null;
        this.lastServerMessageAt = 0;
    }

    // `isRetry` is set only by the automatic reconnect loop so that a user-initiated
    // connect starts the backoff counter fresh while retries keep escalating it.
    async connect(target, { isRetry = false } = {}) {
        // Prevent duplicate connections
        if (this.isConnecting) return;
        if (this.status && this.target === target) return;
        if (!isRetry) this.reconnectFailures = 0;

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
        this.teardownSocket();
        this.clearSocketTimers();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        this.target = cleanTarget;
        this.isExplicitDisconnect = false;
        this.chatRenderer.addSystemMessage(`Connecting to YouTube: ${this.target}...`, true);
        this.emitConnectionChange(false, this.target, 'connecting');
        
        this.configManager.updateConfig('lastYouTubeTarget', this.target);
        this.configManager.saveLastYouTubeTargetOnly(this.target, UIHelpers.getUrlParameter('scene') || 'default');

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

            // Client-side heartbeat. The proxy answers with a pong, which feeds the
            // staleness watchdog below.
            this.pingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ action: 'PING' }));
                }
            }, PING_INTERVAL_MS);

            // A socket that never opens (e.g. network not ready when OBS starts the
            // browser source) would otherwise leave isConnecting stuck forever.
            this.lastServerMessageAt = Date.now();
            this.connectTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                    console.warn('[YouTube] proxy socket did not open in time; retrying');
                    this.forceReconnect();
                }
            }, CONNECT_TIMEOUT_MS);

            // A socket that opened but has gone quiet (half-open TCP, proxy restart
            // without a close frame) looks "connected" to the overlay forever.
            this.watchdogInterval = setInterval(() => {
                if (this.ws && Date.now() - this.lastServerMessageAt > STALE_AFTER_MS) {
                    console.warn('[YouTube] no data from proxy for ' + STALE_AFTER_MS / 1000 + 's; reconnecting');
                    this.forceReconnect();
                }
            }, WATCHDOG_TICK_MS);
        } catch (err) {
            this.isConnecting = false;
            this.chatRenderer.addSystemMessage(`Could not connect to proxy: ${err}`, true);
        }
    }

    clearSocketTimers() {
        if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        if (this.watchdogInterval) { clearInterval(this.watchdogInterval); this.watchdogInterval = null; }
    }

    // Detach every handler before closing so a queued open/message/close event on
    // a socket we have abandoned can never run against the new state (in
    // particular handleOpen touching a null this.ws).
    teardownSocket() {
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            try { ws.onopen = null; ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); } catch(e) {}
        }
    }

    // Drop the current socket without waiting for the browser's close handshake
    // (which never completes against a dead peer) and go through the normal
    // reconnect path.
    forceReconnect() {
        this.teardownSocket();
        this.handleClose();
    }

    handleOpen() {
        if (!this.ws) return;
        this.isConnecting = false;
        this.lastServerMessageAt = Date.now();
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        this.ws.send(JSON.stringify({
            action: 'JOIN',
            target: this.target
        }));
    }

    handleMessage(event) {
        this.lastServerMessageAt = Date.now();
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') {
                return;
            }
            if (data.type === 'system') {
                if (data.status === 'connected' && !data.message) {
                    // Bare JOIN ack: the proxy accepted the subscription but has not
                    // necessarily found a live stream yet. Stay in "connecting" so the
                    // UI does not claim a connection that is not delivering chat.
                    this.reconnectFailures = 0;
                    this.emitConnectionChange(false, this.target, 'connecting');
                } else if (data.status === 'connected') {
                    // "Connected to YouTube stream." — the poller is attached to a live chat.
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
                this.chatRenderer.addChatMessage({ ...data, platform: 'youtube' });
            }
        } catch (err) {
            console.error('Failed to parse YouTube message:', err);
        }
    }

    handleClose() {
        this.isConnecting = false;
        this.status = false;
        this.ws = null;
        this.clearSocketTimers();
        
        if (!this.isExplicitDisconnect && this.target) {
            // Silent reconnect — don't disrupt the chat overlay with system messages
            // for routine Cloud Run timeouts or transient disconnects
            this.reconnectFailures += 1;
            const delay = Math.min(5000 * this.reconnectFailures, 30000);

            // Only show a message after 3+ consecutive failures (persistent problem)
            if (this.reconnectFailures >= 3) {
                this.chatRenderer.addSystemMessage(`YouTube reconnecting... (attempt ${this.reconnectFailures})`, true);
            }

            // Report every attempt: without this the settings panel kept reading
            // "Connected" for the whole outage.
            this.emitConnectionChange(false, this.target, 'reconnecting', this.reconnectFailures);
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                this.connect(this.target, { isRetry: true });
            }, delay);
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
        this.teardownSocket();
        this.clearSocketTimers();
        this.reconnectFailures = 0;
        this.target = '';
        this.emitConnectionChange(false, '');
    }

    isConnected() { return this.status; }
    isActive() { return this.status || this.isConnecting || this.ws !== null || this.reconnectTimeout !== null; }
    getCurrentTarget() { return this.target; }
}
