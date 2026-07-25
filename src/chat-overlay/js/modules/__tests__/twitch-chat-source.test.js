import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwitchChatSource } from '../twitch-chat-source.js';

describe('TwitchChatSource - Protocol Parsing', () => {
    let source;
    let mockChatRenderer;
    let mockConfigManager;
    let mockBadgeManager;

    beforeEach(() => {
        mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn(), setCurrentBroadcasterId: vi.fn() };
        mockConfigManager = { updateConfig: vi.fn(), saveLastChannelOnly: vi.fn() };
        mockBadgeManager = { fetchChannelBadges: vi.fn() };
        
        source = new TwitchChatSource(mockConfigManager, mockChatRenderer, mockBadgeManager);
    });

    describe('parseIRCTags', () => {
        it('should extract correct map from a standard IRC tags message', () => {
            const rawMessage = "@badge-info=subscriber/15;badges=broadcaster/1,subscriber/12,glhf-pledge/1;color=#1ABC9C;display-name=detekoi;emotes=25:0-4,12-16/30:6-9;room-id=123456;user-id=123456 PRIVMSG #detekoi :Kappa hello Kappa";
            const tags = source.parseIRCTags(rawMessage);

            expect(tags['display-name']).toBe('detekoi');
            expect(tags['color']).toBe('#1ABC9C');
            expect(tags['room-id']).toBe('123456');
            expect(tags['badges']).toBe('broadcaster/1,subscriber/12,glhf-pledge/1');
            expect(tags['emotes']).toBe('25:0-4,12-16/30:6-9');
        });

        it('should handle messages with empty tags mapping', () => {
            const rawMessage = "PRIVMSG #detekoi :Kappa hello Kappa";
            const tags = source.parseIRCTags(rawMessage);
            expect(Object.keys(tags).length).toBe(0);
        });

        it('should gracefully handle empty values like empty badges strings safely', () => {
            const rawMessage = "@badge-info=;badges=;color=;display-name=nulluser;emotes= PRIVMSG #detekoi :no tags";
            const tags = source.parseIRCTags(rawMessage);
            
            expect(tags['badges']).toBe('');
            expect(tags['emotes']).toBe('');
            expect(tags['color']).toBe('');
            expect(tags['display-name']).toBe('nulluser');
        });
    });

    describe('handlePrivMsg', () => {
        it('should parse and dispatch message blocks correctly to chat renderer', () => {
            const rawMessage = "@badge-info=;badges=;color=#FF0000;display-name=testuser;emotes=123:0-4 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #channel :emote is cool";
            
            const tags = source.parseIRCTags(rawMessage);
            source.handlePrivMsg(rawMessage, tags);

            expect(mockChatRenderer.addChatMessage).toHaveBeenCalledOnce();
            
            const dispatchData = mockChatRenderer.addChatMessage.mock.calls[0][0];
            expect(dispatchData.username).toBe('testuser');
            expect(dispatchData.message).toBe('emote is cool');
            expect(dispatchData.color).toBe('#FF0000');
            // The method converts the raw "123:0-4" string into a structured emotes array mapping object
            expect(dispatchData.emotes).toEqual({ '123': ['0-4'] });
        });
    });
});

describe('TwitchChatSource - Channel emote lifecycle on reconnect', () => {
    let source;
    let mockThirdPartyEmoteManager;

    class FakeWebSocket {
        static OPEN = 1;
        static CONNECTING = 0;
        constructor() { this.readyState = FakeWebSocket.CONNECTING; }
        close() {}
    }

    beforeEach(() => {
        vi.stubGlobal('WebSocket', FakeWebSocket);
        vi.useFakeTimers();

        const mockChatRenderer = { addSystemMessage: vi.fn(), addChatMessage: vi.fn(), setCurrentBroadcasterId: vi.fn() };
        const mockConfigManager = { config: {}, updateConfig: vi.fn(), saveLastChannelOnly: vi.fn() };
        const mockBadgeManager = { fetchChannelBadges: vi.fn(), fetchGlobalBadges: vi.fn().mockResolvedValue() };
        mockThirdPartyEmoteManager = {
            clearChannelEmotes: vi.fn(),
            fetchGlobalEmotes: vi.fn().mockResolvedValue(),
            fetchChannelEmotes: vi.fn().mockResolvedValue()
        };

        source = new TwitchChatSource(mockConfigManager, mockChatRenderer, mockBadgeManager, null, mockThirdPartyEmoteManager);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const simulateUncleanClose = () => {
        source.handleSocketClose({ code: 1006, reason: '', wasClean: false });
        clearTimeout(source.reconnectTimer); // Cancel the scheduled auto-reconnect; tests call connect() directly
    };

    it('preserves channel emotes when reconnecting to the same channel after a socket drop', async () => {
        await source.connect('somechannel');
        expect(mockThirdPartyEmoteManager.clearChannelEmotes).toHaveBeenCalledTimes(1);

        simulateUncleanClose();
        await source.connect('somechannel');

        expect(mockThirdPartyEmoteManager.clearChannelEmotes).toHaveBeenCalledTimes(1);
    });

    it('clears channel emotes when connecting to a different channel', async () => {
        await source.connect('somechannel');
        simulateUncleanClose();
        await source.connect('otherchannel');

        expect(mockThirdPartyEmoteManager.clearChannelEmotes).toHaveBeenCalledTimes(2);
        expect(source.currentBroadcasterId).toBeNull();
    });
});
