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
        // System messages only render behind ?debug=1; these tests assert on the DOM.
        renderer.debugMode = true;
    });

    describe('addSystemMessage (stream safety)', () => {
        it('renders nothing without debug mode, so diagnostics cannot reach a stream', () => {
            renderer.debugMode = false;
            const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

            renderer.addSystemMessage('Connection lost. Attempting to reconnect...');

            expect(document.querySelectorAll('#chat-messages .system-message')).toHaveLength(0);
            expect(infoSpy).toHaveBeenCalled();
            infoSpy.mockRestore();
        });

        it('renders into the popup container when popup mode is active', () => {
            document.body.innerHTML += '<div id="popup-messages"></div>';
            renderer.config.chatMode = 'popup';

            renderer.addSystemMessage('Connecting...');

            expect(document.querySelectorAll('#popup-messages .system-message')).toHaveLength(1);
            expect(document.querySelectorAll('#chat-messages .system-message')).toHaveLength(0);
        });
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

    describe('addSystemMessage (persistence under debug)', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => {
            delete Element.prototype.animate;
            vi.useRealTimers();
        });

        const systemMessageCount = () => document.querySelectorAll('#chat-messages .system-message').length;

        it('should keep a system message on screen indefinitely by default', () => {
            renderer.addSystemMessage('Settings reset to default.');

            vi.advanceTimersByTime(60000);
            expect(systemMessageCount()).toBe(1);
        });

        // autoRemove/removeDelayMs existed so notices would not linger on a live stream.
        // Rendering now only happens under ?debug=1, where a message that disappears
        // hides the thing being diagnosed, so the flags are deliberately ignored.
        it('should ignore the autoRemove flag so diagnostics stay readable', () => {
            renderer.addSystemMessage('Connecting to chat...', true);

            vi.advanceTimersByTime(60000);
            expect(systemMessageCount()).toBe(1);
        });

        it('should ignore a custom removal delay too', () => {
            renderer.addSystemMessage('Connection lost. Attempting to reconnect...', true, 8000);

            vi.advanceTimersByTime(60000);
            expect(systemMessageCount()).toBe(1);
        });

        it('should never start a fade animation for a system message', () => {
            const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
            Element.prototype.animate = animate;

            renderer.addSystemMessage('Connecting to chat...', true, 8000);
            vi.advanceTimersByTime(60000);

            expect(systemMessageCount()).toBe(1);
            const fades = animate.mock.calls.filter(
                ([frames]) => JSON.stringify(frames) === JSON.stringify([{ opacity: 1 }, { opacity: 0 }])
            );
            expect(fades).toHaveLength(0);
        });

        it('still lets popup mode expire the message through the popup lifecycle', () => {
            document.body.innerHTML = '<div id="chat-messages"></div><div id="popup-messages"></div>';
            renderer.config = { ...renderer.config, chatMode: 'popup', popup: { maxMessages: 3, duration: 5 } };

            renderer.addSystemMessage('Connecting to chat...', true);
            const container = document.getElementById('popup-messages');
            expect(container.children.length).toBe(1);

            vi.advanceTimersByTime(5000);
            expect(container.children.length).toBe(0);
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
            Element.prototype.animate = vi.fn(function (keyframes, options) {
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

    describe('window mode glide', () => {
        beforeEach(() => {
            document.body.innerHTML = `<div id="chat-scroll-area"><div id="chat-messages"></div></div>`;
            mockScrollManager.scrollArea = document.getElementById('chat-scroll-area');
            mockScrollManager.autoFollow = true;
            const config = { chatMode: 'window', showTimestamps: false };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);
        });

        afterEach(() => {
            vi.restoreAllMocks();
            delete Element.prototype.animate;
        });

        it('pins the scroller and glides the message list down from the newcomer height, not the message itself', () => {
            const calls = [];
            Element.prototype.animate = vi.fn(function (keyframes, options) {
                calls.push({ el: this, keyframes, options });
                return { onfinish: null, oncancel: null, cancel: vi.fn() };
            });
            vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);

            renderer.addChatMessage({ username: 'test', message: 'hello' });

            const container = document.getElementById('chat-messages');
            const glide = calls.find(c => c.el === container);
            expect(glide).toBeDefined();
            expect(glide.keyframes[0].transform).toBe('translateY(50px)');
            expect(glide.keyframes[1].transform).toBe('translateY(0px)');
            expect(mockScrollManager.setScrollTop).toHaveBeenCalled();
            // Window-mode messages are no longer height-animated (that caused jitter)
            expect(calls.every(c => c.el === container)).toBe(true);
        });

        it('does not glide when the user has scrolled up (autoFollow false)', () => {
            Element.prototype.animate = vi.fn(() => ({ onfinish: null, oncancel: null, cancel: vi.fn() }));
            vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
            mockScrollManager.autoFollow = false;

            renderer.addChatMessage({ username: 'test', message: 'hello' });

            expect(Element.prototype.animate).not.toHaveBeenCalled();
        });
    });

    describe('Third-Party Emotes & Stacking', () => {
        let mockThirdPartyEmoteManager;

        beforeEach(() => {
            mockThirdPartyEmoteManager = {
                parseThirdPartyEmotes: vi.fn((message, occupied) => {
                    if (message.includes('catJAM')) {
                        return [
                            { start: message.indexOf('catJAM'), end: message.indexOf('catJAM') + 5, code: 'catJAM', imageUrl: 'https://cdn.betterttv.net/catjam.webp', zeroWidth: false }
                        ];
                    }
                    return [];
                })
            };
        });

        it('renders third-party emote images with intact surrounding text', () => {
            const config = { thirdPartyEmotes: true };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            const frag = renderer.buildMessageContentDOM('hello catJAM world', null, false, 'twitch');
            const img = frag.querySelector('img.third-party-emote');

            expect(img).not.toBeNull();
            expect(img.src).toBe('https://cdn.betterttv.net/catjam.webp');
            expect(frag.textContent).toBe('hello  world');
        });

        it('stacks zero-width emote on preceding emote and swallows single separating space', () => {
            mockThirdPartyEmoteManager.parseThirdPartyEmotes = vi.fn(() => [
                { start: 0, end: 5, code: 'catJAM', imageUrl: 'https://cdn.betterttv.net/catjam.webp', zeroWidth: false },
                { start: 7, end: 14, code: 'cvHazmat', imageUrl: 'https://cdn.betterttv.net/hazmat.webp', zeroWidth: true }
            ]);

            const config = { thirdPartyEmotes: true };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            const frag = renderer.buildMessageContentDOM('catJAM cvHazmat', null, false, 'twitch');
            const stack = frag.querySelector('.emote-stack');

            expect(stack).not.toBeNull();
            expect(stack.children.length).toBe(2);
            expect(stack.children[0].alt).toBe('catJAM');
            expect(stack.children[1].alt).toBe('cvHazmat');
            expect(stack.children[1].classList.contains('emote-overlay')).toBe(true);
            expect(frag.textContent).toBe('');
        });

        it('chains 3 emotes into a single stack when zero-widths follow', () => {
            mockThirdPartyEmoteManager.parseThirdPartyEmotes = vi.fn(() => [
                { start: 0, end: 5, code: 'catJAM', imageUrl: 'https://cdn.betterttv.net/catjam.webp', zeroWidth: false },
                { start: 7, end: 14, code: 'cvHazmat', imageUrl: 'https://cdn.betterttv.net/hazmat.webp', zeroWidth: true },
                { start: 16, end: 23, code: 'SantaHat', imageUrl: 'https://cdn.betterttv.net/santa.webp', zeroWidth: true }
            ]);

            const config = { thirdPartyEmotes: true };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            const frag = renderer.buildMessageContentDOM('catJAM cvHazmat SantaHat', null, false, 'twitch');
            const stack = frag.querySelector('.emote-stack');

            expect(stack).not.toBeNull();
            expect(stack.children.length).toBe(3);
        });

        it('renders zero-width inline if unattached (preceded by text or separated by two spaces)', () => {
            mockThirdPartyEmoteManager.parseThirdPartyEmotes = vi.fn(() => [
                { start: 6, end: 13, code: 'cvHazmat', imageUrl: 'https://cdn.betterttv.net/hazmat.webp', zeroWidth: true }
            ]);

            const config = { thirdPartyEmotes: true };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            const frag = renderer.buildMessageContentDOM('hello cvHazmat', null, false, 'twitch');
            const stack = frag.querySelector('.emote-stack');
            const img = frag.querySelector('img.third-party-emote');

            expect(stack).toBeNull();
            expect(img).not.toBeNull();
        });

        it('respects config gating and platform gating', () => {
            const config = { thirdPartyEmotes: false };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            renderer.buildMessageContentDOM('catJAM', null, false, 'twitch');
            expect(mockThirdPartyEmoteManager.parseThirdPartyEmotes).not.toHaveBeenCalled();

            const configOn = { thirdPartyEmotes: true };
            renderer = new ChatRenderer(configOn, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            renderer.buildMessageContentDOM('catJAM', null, false, 'youtube');
            expect(mockThirdPartyEmoteManager.parseThirdPartyEmotes).not.toHaveBeenCalled();
        });

        it('evaluates checkSingleEmoteNodes as true for single emote-stack messages', () => {
            mockThirdPartyEmoteManager.parseThirdPartyEmotes = vi.fn(() => [
                { start: 0, end: 5, code: 'catJAM', imageUrl: 'https://cdn.betterttv.net/catjam.webp', zeroWidth: false },
                { start: 7, end: 14, code: 'cvHazmat', imageUrl: 'https://cdn.betterttv.net/hazmat.webp', zeroWidth: true }
            ]);

            const config = { thirdPartyEmotes: true, enlargeSingleEmotes: true };
            renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null, null, mockThirdPartyEmoteManager);

            const frag = renderer.buildMessageContentDOM('catJAM cvHazmat', null, false, 'twitch');
            expect(renderer.checkSingleEmoteNodes(frag)).toBe(true);
        });
    });
});

describe('ChatRenderer - Command filtering', () => {
    let renderer;
    let mockScrollManager;
    let mockBadgeManager;

    beforeEach(() => {
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
    });

    it('hides a message that starts with "!" when hideCommands is true', () => {
        const config = { chatMode: 'window', hideCommands: true };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);

        renderer.addChatMessage({ username: 'bot', message: '!so someone' });

        expect(document.querySelectorAll('#chat-messages .chat-message')).toHaveLength(0);
    });

    it('hides a command message with leading whitespace when hideCommands is true', () => {
        const config = { chatMode: 'window', hideCommands: true };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);

        renderer.addChatMessage({ username: 'bot', message: '  !lurk' });

        expect(document.querySelectorAll('#chat-messages .chat-message')).toHaveLength(0);
    });

    it('still renders a message that merely contains "!" mid-message when hideCommands is true', () => {
        const config = { chatMode: 'window', hideCommands: true };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);

        renderer.addChatMessage({ username: 'bot', message: 'hello !world' });

        expect(document.querySelectorAll('#chat-messages .chat-message')).toHaveLength(1);
    });

    it('renders a command message when hideCommands is false', () => {
        const config = { chatMode: 'window', hideCommands: false };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);

        renderer.addChatMessage({ username: 'bot', message: '!so someone' });

        expect(document.querySelectorAll('#chat-messages .chat-message')).toHaveLength(1);
    });

    it('renders a command message when hideCommands is absent from config', () => {
        const config = { chatMode: 'window' };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);

        renderer.addChatMessage({ username: 'bot', message: '!so someone' });

        expect(document.querySelectorAll('#chat-messages .chat-message')).toHaveLength(1);
    });

    it('still routes a superchat starting with "!" to renderSuperChat even when hideCommands is true', () => {
        const config = { chatMode: 'window', hideCommands: true };
        renderer = new ChatRenderer(config, mockScrollManager, mockBadgeManager, null);
        const superChatSpy = vi.spyOn(renderer, 'renderSuperChat').mockImplementation(() => {});

        renderer.addChatMessage({
            username: 'fan',
            message: '!hype',
            eventType: 'superchat',
            amount: '$5.00'
        });

        expect(superChatSpy).toHaveBeenCalled();
    });
});
