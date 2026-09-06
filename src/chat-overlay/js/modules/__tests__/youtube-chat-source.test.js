import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YouTubeChatSource } from '../youtube-chat-source.js';

describe('YouTubeChatSource - URL Substring URL Redirection Mitigations', () => {
    let source;
    let mockChatRenderer;
    let mockConfigManager;

    beforeEach(() => {
        mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn() };
        mockConfigManager = { updateConfig: vi.fn(), saveLastYouTubeTargetOnly: vi.fn() };
        source = new YouTubeChatSource(mockConfigManager, mockChatRenderer);
        source.ws = { close: vi.fn(), send: vi.fn() };
        
        // Mock global WebSocket to trigger onopen right away and unset isConnecting
        vi.stubGlobal('WebSocket', class WebSocketMock {
            constructor() {
                setTimeout(() => this.onopen?.(), 0);
            }
            close() {}
            send() {}
        });
        
        // Mock window to prevent errors with window.location
        vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    });

    it('should extract video ID correctly from valid youtube.com links', async () => {
        await source.connect('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(source.target).toBe('dQw4w9WgXcQ');

        source.disconnect();
        await source.connect('https://youtube.com/watch?v=123xyz');
        expect(source.target).toBe('123xyz');
    });

    it('should extract handle correctly from valid youtube.com/@ links', async () => {
        await source.connect('https://youtube.com/@detekoi');
        expect(source.target).toBe('@detekoi');
    });

    it('should extract ID correctly from youtu.be short links', async () => {
        await source.connect('https://youtu.be/dQw4w9WgXcQ');
        expect(source.target).toBe('dQw4w9WgXcQ');
    });

    it('should reject malicious URLs bypassing simple string includes checks', async () => {
        // Attackers might use subdomains or domains containing "youtube.com" to bypass str.includes('youtube.com')
        const maliciousTarget1 = 'https://youtube.com.attacker.com/watch?v=123';
        const maliciousTarget2 = 'https://attacker-youtube.com/watch?v=123';

        await source.connect(maliciousTarget1);
        // It failed hostname validation and fell back to raw string interpretation instead of parsing it
        expect(source.target).toBe(maliciousTarget1); 

        source.disconnect();
        await source.connect(maliciousTarget2);
        expect(source.target).toBe(maliciousTarget2);
    });

    it('should pass straight strings through unparsed', async () => {
        await source.connect('dQw4w9WgXcQ');
        expect(source.target).toBe('dQw4w9WgXcQ');

        source.disconnect();
        await source.connect('@detekoi');
        expect(source.target).toBe('@detekoi');
    });
});

describe('YouTubeChatSource - System Message Handling', () => {
    let source;
    let mockChatRenderer;
    let mockConfigManager;

    beforeEach(() => {
        mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn() };
        mockConfigManager = { updateConfig: vi.fn(), saveLastYouTubeTargetOnly: vi.fn() };
        source = new YouTubeChatSource(mockConfigManager, mockChatRenderer);
        source.ws = { close: vi.fn(), send: vi.fn() };
    });

    it('should close WebSocket when "Could not find a live stream" is received', () => {
        source.handleMessage({
            data: JSON.stringify({
                type: 'system',
                message: 'Could not find a live stream. Please check the channel name and try again.'
            })
        });
        expect(source.ws.close).toHaveBeenCalled();
    });

    it('should close WebSocket when "Lost connection" is received', () => {
        source.handleMessage({
            data: JSON.stringify({
                type: 'system',
                message: 'Lost connection to YouTube stream. Reconnecting...'
            })
        });
        expect(source.ws.close).toHaveBeenCalled();
    });

    it('should not close WebSocket for other system messages', () => {
        source.handleMessage({
            data: JSON.stringify({
                type: 'system',
                message: 'Waiting for YouTube stream to go live...'
            })
        });
        expect(source.ws.close).not.toHaveBeenCalled();
    });
});


describe('YouTubeChatSource - Liveness watchdog', () => {
    let source;
    let sockets;
    let mockChatRenderer;
    let mockConfigManager;

    class WebSocketMock {
        static OPEN = 1;
        constructor() {
            this.readyState = 0;
            this.send = vi.fn();
            this.close = vi.fn();
            sockets.push(this);
        }
        open() {
            this.readyState = WebSocketMock.OPEN;
            this.onopen?.();
        }
        receive(obj) {
            this.onmessage?.({ data: JSON.stringify(obj) });
        }
    }

    beforeEach(() => {
        vi.useFakeTimers();
        sockets = [];
        mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn() };
        mockConfigManager = { updateConfig: vi.fn(), saveLastYouTubeTargetOnly: vi.fn() };
        vi.stubGlobal('WebSocket', WebSocketMock);
        vi.stubGlobal('window', { location: { hostname: 'localhost' } });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        source = new YouTubeChatSource(mockConfigManager, mockChatRenderer);
    });

    afterEach(() => {
        source.disconnect();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('retries when the socket never opens', async () => {
        await source.connect('@parfaitfair');
        expect(sockets).toHaveLength(1);

        vi.advanceTimersByTime(15000);
        expect(sockets[0].close).toHaveBeenCalled();
        expect(source.isActive()).toBe(true); // reconnect scheduled

        vi.advanceTimersByTime(5000); // first backoff step
        expect(sockets).toHaveLength(2);
    });

    it('reconnects an open socket that goes silent', async () => {
        await source.connect('@parfaitfair');
        sockets[0].open();
        sockets[0].receive({ type: 'system', status: 'connected', message: 'Connected to YouTube stream.' });
        expect(source.isConnected()).toBe(true);

        vi.advanceTimersByTime(120000);
        expect(sockets[0].close).toHaveBeenCalled();
        expect(source.isConnected()).toBe(false);

        vi.advanceTimersByTime(5000);
        expect(sockets).toHaveLength(2);
        expect(sockets[1]).not.toBe(sockets[0]);
    });

    it('treats pong replies as liveness and keeps a quiet chat connected', async () => {
        await source.connect('@parfaitfair');
        sockets[0].open();
        sockets[0].receive({ type: 'system', status: 'connected', message: 'Connected to YouTube stream.' });

        for (let i = 0; i < 10; i++) {
            vi.advanceTimersByTime(30000);
            expect(sockets[0].send).toHaveBeenLastCalledWith(JSON.stringify({ action: 'PING' }));
            sockets[0].receive({ type: 'pong' });
        }

        expect(sockets[0].close).not.toHaveBeenCalled();
        expect(source.isConnected()).toBe(true);
        expect(sockets).toHaveLength(1);
        expect(mockChatRenderer.addChatMessage).not.toHaveBeenCalled();
    });

    it('does not report connected on the bare JOIN ack, only once the stream is found', async () => {
        const states = [];
        source.onConnectionChange((connected, target, state) => states.push({ connected, state }));
        await source.connect('@parfaitfair');
        sockets[0].open();

        sockets[0].receive({ type: 'system', status: 'connected', target: '@parfaitfair' });
        expect(source.isConnected()).toBe(false);
        expect(states.at(-1)).toEqual({ connected: false, state: 'connecting' });

        sockets[0].receive({ type: 'system', status: 'connected', message: 'Connected to YouTube stream.' });
        expect(source.isConnected()).toBe(true);
        expect(states.at(-1).connected).toBe(true);
    });

    it('stops all timers on explicit disconnect', async () => {
        await source.connect('@parfaitfair');
        sockets[0].open();
        source.disconnect();

        vi.advanceTimersByTime(600000);
        expect(sockets).toHaveLength(1);
        expect(source.isActive()).toBe(false);
    });
});
