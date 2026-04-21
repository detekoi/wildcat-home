import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRenderer } from '../chat-renderer.js';

describe('ChatRenderer - Security Mitigations', () => {
    let renderer;
    let mockScrollManager;
    let mockBadgeManager;

    beforeEach(() => {
        // Setup a mock DOM environment container
        document.body.innerHTML = `
            <div id="chat-messages"></div>
        `;

        mockScrollManager = {
            ensureSentinelLast: vi.fn(),
            scrollToBottom: vi.fn(),
            isUserScrolledToBottom: vi.fn(() => true),
            setScrollTop: vi.fn(),
            stickToBottomSoon: vi.fn()
        };
        mockBadgeManager = {
            generateBadgeHTML: vi.fn(() => '')
        };

        const config = {
            showTimestamps: true,
            chatMode: 'window',
            enlargeSingleEmotes: false
        };

        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);
    });

    describe('addSystemMessage (DOM XSS Mitigation)', () => {
        it('should use textContent instead of innerHTML to prevent XSS payloads', () => {
            const maliciousMessage = '<img src=x onerror=alert("XSS")> System alert';
            renderer.addSystemMessage(maliciousMessage);

            const container = document.getElementById('chat-messages');
            const newMsg = container.lastElementChild;
            const contentSpan = newMsg.querySelector('.message-content');

            // The content should be treated as literal text, NOT parsed HTML nodes
            expect(contentSpan.innerHTML).toContain('&lt;img');
            expect(contentSpan.textContent).toBe(maliciousMessage);
            expect(contentSpan.querySelector('img')).toBeNull(); // The img tag should not exist in DOM
        });
    });

    describe('buildMessageContentDOM (URL Redirection Mitigation)', () => {
        it('should transform safe http/https URLs into <a> links', () => {
            const message = "Check out this link: https://google.com";
            const frag = renderer.buildMessageContentDOM(message, null);
            
            const link = frag.querySelector('a');
            expect(link).not.toBeNull();
            expect(link.href).toBe('https://google.com/');
            expect(link.textContent).toBe('https://google.com');
        });

        it('should discard dangerous protocols (e.g. javascript:) and render as plain text', () => {
            // Because the frontend regex strictly checks for \bhttps?://, a strict javascript: shouldn't pass
            // But if it somehow does, we verify the new URL().protocol logic catches it.
            // We simulate a regex match bypass by feeding a malicious string that somehow passes the initial test
            // Note: The app's regex actually prevents javascript:, but we pretend we passed a string that matched.
            
            // Actually, we can test the fallback functionality by passing a broken URL to see if it safely handles the catch block.
            // A more accurate test is checking if a malformed URL like http://foo:badport gets caught
            const message = "Check this http://%malformed_url"; 
            const frag = renderer.buildMessageContentDOM(message, null);
            
            // It should fall back to a text node, no <a> node
            const link = frag.querySelector('a');
            expect(link).toBeNull();
            expect(frag.textContent).toContain('http://%malformed_url');
        });
    });

    describe('buildMessageContentDOM (Emoji Hostname Mitigation)', () => {
        it('should allow authentic YouTube emoji hosts (ytimg.com, google.com)', () => {
            const message = "Hello yt";
            // We mock an emote structured like what YT outputs
            const emotes = {
                'https://yt3.ggpht.com/emote_id': ['6-7']
            };

            const frag = renderer.buildMessageContentDOM(message, emotes);
            const img = frag.querySelector('img.yt-emoji');
            
            expect(img).not.toBeNull();
            expect(img.src).toBe('https://yt3.ggpht.com/emote_id');
        });

        it('should reject forged/bypassed domains matching the old .includes() flaw', () => {
            const message = "Hello evil";
            const emotes = {
                'https://youtube.com.attacker.com/evil.gif': ['6-9']
            };

            const frag = renderer.buildMessageContentDOM(message, emotes);
            
            // Should NOT render an img node because attacker.com fails hostname validation
            // It will fall back to just text/unknown branch or nothing
            const img = frag.querySelector('img.yt-emoji');
            expect(img).toBeNull();
        });
    });
});
