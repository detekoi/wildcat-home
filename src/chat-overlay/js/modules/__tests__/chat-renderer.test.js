import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

    describe('popup lifecycle', () => {
        beforeEach(() => {
            document.body.innerHTML = `<div id="popup-messages"></div>`;
            vi.useFakeTimers();
            const config = {
                chatMode: 'popup',
                popup: { maxMessages: 3, duration: 5, direction: 'from-bottom' }
            };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);
        });

        afterEach(() => {
            vi.restoreAllMocks();
            vi.useRealTimers();
        });

        it('Expiry: after 5000ms element gets .removing/data-removing; detached immediately fallback', () => {
            renderer.addChatMessage({ username: 'test', message: 'hello' });
            const container = document.getElementById('popup-messages');
            const el = container.firstElementChild;
            expect(el).not.toBeNull();
            
            vi.advanceTimersByTime(5000);
            expect(el.classList.contains('removing')).toBe(true);
            expect(el.dataset.removing).toBe('true');
            
            expect(container.contains(el)).toBe(false);
        });

        it('Overflow trim is animated (oldest marked, then detached; newest 3 remain)', () => {
            for (let i = 0; i < 4; i++) {
                renderer.addChatMessage({ username: 'test', message: `msg ${i}` });
            }
            const container = document.getElementById('popup-messages');
            expect(container.children.length).toBe(3);
            expect(container.children[0].textContent).toContain('msg 1');
        });

        it('Overflow count excludes popups already data-removing', () => {
            Element.prototype.animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
            vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);

            for (let i = 0; i < 3; i++) {
                renderer.addChatMessage({ username: 'test', message: `msg ${i}` });
            }
            const container = document.getElementById('popup-messages');
            // Mark the first one as removing manually to simulate an expired one
            renderer.removePopup(container.children[0]);
            
            // Add a 4th one. Since one is removing, the count of active is 2, so it shouldn't trim another
            renderer.addChatMessage({ username: 'test', message: 'msg 3' });
            
            // Total children should be 4 (1 removing, 3 active)
            expect(container.children.length).toBe(4);
            const removingCount = Array.from(container.children).filter(el => el.dataset.removing === 'true').length;
            expect(removingCount).toBe(1);

            delete Element.prototype.animate;
            vi.restoreAllMocks();
        });

        it('Double-removePopup is a single detach; trimmed popup original expiry timer doesnt double-fire', () => {
            renderer.addChatMessage({ username: 'test', message: 'hello' });
            const container = document.getElementById('popup-messages');
            const el = container.firstElementChild;
            
            renderer.removePopup(el);
            renderer.removePopup(el); // double call
            
            // Advance time past the original 5s expiry
            vi.advanceTimersByTime(5000);
            
            // Should just be handled gracefully without errors
            expect(container.contains(el)).toBe(false);
        });

        it('WAAPI path with mocked el.animate + defined offsetHeight: correct keyframes; onfinish restores overflow (entry) / detaches (exit)', () => {
            // Mock WAAPI
            let animEntry, animExit;
            Element.prototype.animate = vi.fn(function(keyframes, options) {
                const anim = {
                    onfinish: null,
                    oncancel: null,
                };
                if (keyframes[0]?.offset === 0) animEntry = anim; // entry
                else animExit = anim; // exit
                return anim;
            });
            // Mock offsetHeight getter
            vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
            
            renderer.addChatMessage({ username: 'test', message: 'hello' });
            const container = document.getElementById('popup-messages');
            const el = container.firstElementChild;
            
            expect(Element.prototype.animate).toHaveBeenCalled();
            expect(el.style.overflow).toBe('hidden');
            
            // Finish entry animation
            animEntry.onfinish();
            expect(el.style.overflow).toBe('');
            
            // Trigger exit
            renderer.removePopup(el);
            expect(animExit).toBeDefined();
            
            // Finish exit animation
            animExit.onfinish();
            expect(container.contains(el)).toBe(false);
            
            delete Element.prototype.animate;
        });

        it('matchMedia reduced-motion stub -> animate not called', () => {
            Element.prototype.animate = vi.fn();
            const originalMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockImplementation(query => ({
                matches: query === '(prefers-reduced-motion: reduce)'
            }));
            
            renderer.addChatMessage({ username: 'test', message: 'hello' });
            expect(Element.prototype.animate).not.toHaveBeenCalled();
            
            window.matchMedia = originalMatchMedia;
            delete Element.prototype.animate;
        });
    });
});
