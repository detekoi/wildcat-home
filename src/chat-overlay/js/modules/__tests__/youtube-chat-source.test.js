import { describe, it, expect, vi, beforeEach } from 'vitest';
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

