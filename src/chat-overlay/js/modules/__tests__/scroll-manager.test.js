import { describe, it, expect, beforeEach } from 'vitest';
import { ScrollManager } from '../scroll-manager.js';

describe('ScrollManager - DOM Interactions', () => {
    let scrollManager;

    beforeEach(() => {
        // Setup mock DOM required for scroll measurements
        document.body.innerHTML = `
            <div id="chat-messages" style="height: 500px; overflow-y: scroll;">
                <div id="sentinel"></div>
            </div>
        `;
        
        const chatMessages = document.getElementById('chat-messages');
        scrollManager = new ScrollManager(chatMessages, chatMessages);
    });

    describe('isUserScrolledToBottom', () => {
        it('should return true if the user is locked at the scroll floor (within threshold)', () => {
            // Mock scroll state metrics using DOM properties
            Object.defineProperty(scrollManager.scrollArea, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(scrollManager.scrollArea, 'clientHeight', { value: 500, configurable: true });
            Object.defineProperty(scrollManager.scrollArea, 'scrollTop', { value: 495, configurable: true }); 
            // Math: 1000 - 500 = 500 (max scrollTop). 500 - 495 = 5 (within the 10px snap threshold)

            expect(scrollManager.isUserScrolledToBottom(scrollManager.scrollArea)).toBe(true);
        });

        it('should return false if the user has manually scrolled up reading chat history', () => {
             Object.defineProperty(scrollManager.scrollArea, 'scrollHeight', { value: 1000, configurable: true });
             Object.defineProperty(scrollManager.scrollArea, 'clientHeight', { value: 500, configurable: true });
             Object.defineProperty(scrollManager.scrollArea, 'scrollTop', { value: 200, configurable: true }); 
             // Math: 500 - 200 = 300 (far beyond 10px threshold)
 
             expect(scrollManager.isUserScrolledToBottom(scrollManager.scrollArea)).toBe(false);           
        });
    });
});
