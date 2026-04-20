/**
 * Chat Renderer Module
 * Handles rendering of chat messages and system messages to the DOM
 */

import { UIHelpers } from './ui-helpers.js';

export class ChatRenderer {
    constructor(config, scrollManager, badgeManager, pronounManager) {
        this.config = config;
        this.scrollManager = scrollManager;
        this.badgeManager = badgeManager;
        this.pronounManager = pronounManager;
        this.chatMessages = document.getElementById('chat-messages');
        this.currentBroadcasterId = null;
    }

    /**
     * Set the current broadcaster ID
     */
    setCurrentBroadcasterId(broadcasterId) {
        this.currentBroadcasterId = broadcasterId;
    }

    /**
     * Add a system message to the chat
     */
    addSystemMessage(message, autoRemove = false) {
        if (!this.chatMessages) {
            console.error("Chat messages container not found for system message.");
            return;
        }

        const shouldScroll = this.config.chatMode === 'window' && this.scrollManager.autoFollow;
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message system-message';

        let timestamp = '';
        if (this.config.showTimestamps) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            timestamp = `${hours}:${minutes} `;
        }

        messageElement.innerHTML = `<span class="timestamp">${timestamp}</span><span class="message-content">${message}</span>`;
        this.chatMessages.appendChild(messageElement);

        // Keep sentinel as the last element
        this.scrollManager.ensureSentinelLast();

        if (this.config.chatMode === 'window') {
            this.limitMessages();
        }

        if (shouldScroll) {
            this.scrollManager.scrollToBottom();
        }

        // Auto-remove temporary messages after 3 seconds
        if (autoRemove) {
            setTimeout(() => {
                if (messageElement && messageElement.parentNode) {
                    messageElement.remove();
                }
            }, 3000);
        }
    }

    renderSuperChat(data, targetContainer, currentScrollArea) {
        const itemContainer = document.createElement('div');
        const isPopup = this.config.chatMode === 'popup';
        itemContainer.className = isPopup ? 'popup-message superchat-message' : 'chat-message superchat-message';
        if (isPopup) itemContainer.classList.add(this.config.popup?.direction || 'from-bottom');
        
        const superChatEl = document.createElement('div');
        superChatEl.className = 'superchat';
        if (data.bodyColor) superChatEl.style.setProperty('--body-color', data.bodyColor);
        if (data.headerColor) superChatEl.style.setProperty('--header-color', data.headerColor);

        const headerEl = document.createElement('div');
        headerEl.className = 'superchat-header';
        
        const authorEl = document.createElement('span');
        authorEl.className = 'superchat-author';
        authorEl.textContent = data.username;
        headerEl.appendChild(authorEl);
        
        if (data.amount) {
            const amountEl = document.createElement('span');
            amountEl.className = 'superchat-amount';
            amountEl.textContent = " - " + data.amount;
            headerEl.appendChild(amountEl);
        }
        superChatEl.appendChild(headerEl);

        const contentNodes = this.buildMessageContentDOM(data.message || "", data.emotes);
        if (contentNodes.childNodes.length > 0) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'superchat-body chat-text';
            bodyEl.appendChild(contentNodes);
            superChatEl.appendChild(bodyEl);
        }

        itemContainer.appendChild(superChatEl);
        targetContainer.appendChild(itemContainer);

        if (isPopup) {
            this.handlePopupMessage(itemContainer, targetContainer);
        } else {
            this.scrollManager.ensureSentinelLast();
            this.limitMessages();
            if (this.scrollManager.autoFollow && currentScrollArea) {
                this.scrollManager.scrollToBottom();
            }
        }
    }

    renderMembershipEvent(data, targetContainer, currentScrollArea) {
        const itemContainer = document.createElement('div');
        const isPopup = this.config.chatMode === 'popup';
        itemContainer.className = isPopup ? 'popup-message membership-message system-message' : 'chat-message membership-message system-message';
        if (isPopup) itemContainer.classList.add(this.config.popup?.direction || 'from-bottom');

        const memEl = document.createElement('div');
        memEl.className = 'membership';
        
        const textEl = document.createElement('span');
        textEl.className = 'membership-text';
        textEl.textContent = `⭐ ${data.username} changed memberships: ${data.subtext || "Join"}`;
        memEl.appendChild(textEl);
        
        itemContainer.appendChild(memEl);
        targetContainer.appendChild(itemContainer);

        if (isPopup) {
            this.handlePopupMessage(itemContainer, targetContainer);
        } else {
            this.scrollManager.ensureSentinelLast();
            this.limitMessages();
            if (this.scrollManager.autoFollow && currentScrollArea) {
                this.scrollManager.scrollToBottom();
            }
        }
    }

    /**
     * Add a user message to the chat
     */
    addChatMessage(data) {
        try {
            if (!data.username || !data.message) return;

            let targetContainer;
            let currentScrollArea;

            if (this.config.chatMode === 'popup') {
                targetContainer = document.getElementById('popup-messages');
                if (!targetContainer) { console.error('Popup messages container not found'); return; }
            } else { // window mode
                targetContainer = this.chatMessages;
                currentScrollArea = this.scrollManager.scrollArea;
                if (!targetContainer) { console.error('Chat messages container not found'); return; }
                if (!currentScrollArea) { console.error('Chat scroll area not found'); }
            }
            if (!targetContainer) { console.error('Target container could not be determined or found.'); return; }

            const eventType = data.eventType || 'chat';
            if (eventType === 'superchat' || eventType === 'supersticker') {
                this.renderSuperChat(data, targetContainer, currentScrollArea);
                return;
            } else if (eventType === 'new-member' || eventType === 'member-milestone' || eventType === 'gift-purchase' || eventType === 'gift-received') {
                this.renderMembershipEvent(data, targetContainer, currentScrollArea);
                return;
            }

            const shouldScroll = this.config.chatMode === 'window' && this.scrollManager.autoFollow;
            const messageElement = document.createElement('div');

            if (this.config.chatMode === 'popup') {
                messageElement.className = 'popup-message';
                messageElement.classList.add(this.config.popup?.direction || 'from-bottom');
            } else {
                messageElement.className = 'chat-message';
            }

            let timestamp = '';
            if (this.config.showTimestamps) {
                const now = new Date();
                timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} `;
            }

            let userColor = data.color || UIHelpers.generateColorFromName(data.username);
            if (this.config.overrideUsernameColors) {
                userColor = this.config.usernameColor;
            }

            // Build node tree dynamically instead of via innerHTML
            const contentNodes = this.buildMessageContentDOM(data.message, data.emotes);
            const isSingleEmote = this.checkSingleEmoteNodes(contentNodes);

            if (timestamp) {
                const tsSpan = document.createElement('span');
                tsSpan.className = 'timestamp';
                tsSpan.textContent = timestamp;
                messageElement.appendChild(tsSpan);
            }

            const showPlatformBadges = this.config.showPlatformBadges !== false;
            if (showPlatformBadges) {
                const platform = data.platform || 'twitch';
                const pBadge = document.createElement('span');
                pBadge.className = `platform-badge platform-${platform}`;
                pBadge.setAttribute('aria-label', platform);
                messageElement.appendChild(pBadge);
            }

            const badgesHtml = data.tags?.badges
                ? this.badgeManager.generateBadgeHTML(data.tags.badges, this.currentBroadcasterId)
                : '';
            
            if (badgesHtml) {
                const bWrapper = document.createElement('span');
                bWrapper.innerHTML = badgesHtml;
                while(bWrapper.firstChild) messageElement.appendChild(bWrapper.firstChild);
            }

            if (this.config.showPronouns !== false) {
                const cachedPronoun = this.pronounManager?.getPronounDisplay(data.username);
                if (cachedPronoun) {
                    const pSpan = document.createElement('span');
                    pSpan.className = 'pronoun-badge';
                    pSpan.textContent = cachedPronoun; 
                    messageElement.appendChild(pSpan);
                } else if (this.pronounManager) {
                    const boxId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const pStub = document.createElement('span');
                    pStub.className = 'pronoun-badge';
                    pStub.id = `pronoun-${boxId}`;
                    pStub.style.display = 'none';
                    messageElement.appendChild(pStub);

                    this.pronounManager.getUserPronoun(data.username).then(pronoun => {
                        if (pronoun) {
                            const el = document.getElementById(`pronoun-${boxId}`);
                            if (el) {
                                el.textContent = pronoun;
                                el.style.display = 'inline';
                            }
                        }
                    });
                }
            }

            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'username';
            usernameSpan.style.color = userColor;
            usernameSpan.textContent = `${data.username}:`;
            messageElement.appendChild(usernameSpan);

            const contentContainer = document.createElement('span');
            contentContainer.className = 'message-content';
            contentContainer.appendChild(contentNodes);
            messageElement.appendChild(contentContainer);

            // Apply single-emote class if detected
            if (isSingleEmote) {
                messageElement.classList.add('single-emote-message');
            }

            targetContainer.appendChild(messageElement);

            // After message added, listen for image loads to adjust scroll if needed
            if (this.config.chatMode !== 'popup' && currentScrollArea && this.scrollManager.isUserScrolledToBottom(currentScrollArea)) {
                const imgs = messageElement.querySelectorAll('img');
                imgs.forEach(img => {
                    if (!img.complete) {
                        img.addEventListener('load', () => this.scrollManager.stickToBottomSoon(), { once: true });
                        img.addEventListener('error', () => this.scrollManager.stickToBottomSoon(), { once: true });
                    }
                });
            }

            if (this.config.chatMode !== 'popup') {
                // Keep sentinel as the last element
                this.scrollManager.ensureSentinelLast();
            }

            if (this.config.chatMode === 'popup') {
                this.handlePopupMessage(messageElement, targetContainer);
            } else { // Window mode
                this.limitMessages();
                if (shouldScroll && currentScrollArea) {
                    this.scrollManager.scrollToBottom();
                }
            }
        } catch (error) {
            console.error('Error adding chat message:', error);
        }
    }

    /**
     * Build secure DOM fragment for message content parsing emotes and URLs
     */
    buildMessageContentDOM(message, emotes) {
        const frag = document.createDocumentFragment();
        
        let emotePositions = [];
        if (emotes && typeof emotes === 'object') {
            for (const emoteId in emotes) {
                if (!emotes.hasOwnProperty(emoteId)) continue;
                for (const pos of emotes[emoteId]) {
                    if (pos?.includes('-')) {
                        const [s, e] = pos.split('-');
                        const start = parseInt(s, 10);
                        const end = parseInt(e, 10);
                        if (!isNaN(start) && !isNaN(end) && start >= 0 && start <= end && end < message.length) {
                            emotePositions.push({ start, end, id: emoteId });
                        }
                    }
                }
            }
        }
        emotePositions.sort((a, b) => a.start - b.start);

        if (emotePositions.length === 0) {
            // No emotes, check for URLs
            const urlRegex = /(\bhttps?:\/\/[^\s<]+)/g;
            let lastIndex = 0;
            let match;
            while ((match = urlRegex.exec(message)) !== null) {
                if (match.index > lastIndex) {
                    frag.appendChild(document.createTextNode(message.slice(lastIndex, match.index)));
                }
                const a = document.createElement('a');
                a.href = match[0];
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = match[0]; // safe
                frag.appendChild(a);
                lastIndex = urlRegex.lastIndex;
            }
            if (lastIndex < message.length) {
                frag.appendChild(document.createTextNode(message.slice(lastIndex)));
            }
        } else {
            // Has emotes
            const urlRegex = /(\bhttps?:\/\/[^\s<]+)/g;
            const appendTextWithUrls = (text) => {
                if (!text) return;
                let lastIdx = 0;
                let match;
                while ((match = urlRegex.exec(text)) !== null) {
                    if (match.index > lastIdx) {
                        frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
                    }
                    const a = document.createElement('a');
                    a.href = match[0];
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = match[0]; // safe
                    frag.appendChild(a);
                    lastIdx = urlRegex.lastIndex;
                }
                if (lastIdx < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIdx)));
                }
            };

            let lastIndex = 0;
            for (const emote of emotePositions) {
                if (emote.start > lastIndex) {
                    appendTextWithUrls(message.slice(lastIndex, emote.start));
                }
                // Determine if it's an InnerTube emote or Twitch emote structure
                // InnerTube emotes passed from our Normalizer might have URL rather than ID in some future cases,
                // but for now sticking to the twitch structure compatibility.
                const emoteCode = message.substring(emote.start, emote.end + 1);
                
                // Restrict YT emoji URLs to trusted domains to prevent loading untrusted resources
                const isYtEmoji = emote.id.startsWith('http') && 
                                  (emote.id.includes('youtube.com') || 
                                   emote.id.includes('ytimg.com') || 
                                   emote.id.includes('google.com') ||
                                   emote.id.includes('ggpht.com'));
                
                const img = document.createElement('img');
                img.className = 'emote';
                if (isYtEmoji) {
                    img.classList.add('yt-emoji');
                    img.src = emote.id;
                } else if (!emote.id.startsWith('http')) {
                    const baseUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emote.id)}/default/dark`;
                    img.src = `${baseUrl}/3.0`;
                    img.onerror = function() {
                        this.onerror = function() { this.src = `${baseUrl}/1.0`; };
                        this.src = `${baseUrl}/2.0`;
                    };
                } else {
                    // Fallback for malicious or unrecognized HTTP IDs
                    frag.appendChild(document.createTextNode(emoteCode));
                    lastIndex = emote.end + 1;
                    continue;
                }
                img.alt = emoteCode;
                img.title = emoteCode;
                frag.appendChild(img);
                
                lastIndex = emote.end + 1;
            }
            if (lastIndex < message.length) {
                appendTextWithUrls(message.slice(lastIndex));
            }
        }
        
        return frag;
    }

    /**
     * Check if message content nodes contain only a single emote
     */
    checkSingleEmoteNodes(frag) {
        if (!this.config.enlargeSingleEmotes) return false;
        let hasOneEmote = false;
        let hasText = false;
        for (const child of frag.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.textContent.trim() !== '') hasText = true;
            } else if (child.nodeName.toLowerCase() === 'img' && child.classList.contains('emote')) {
                if (hasOneEmote) return false; // More than one
                hasOneEmote = true;
            } else {
                return false; // Other element types
            }
        }
        return hasOneEmote && !hasText;
    }

    /**
     * Handle popup message animation and removal
     */
    handlePopupMessage(messageElement, targetContainer) {
        void messageElement.offsetWidth; // Force reflow for transition
        messageElement.classList.add('visible');

        // Limit popup messages
        const popupMsgs = Array.from(targetContainer.querySelectorAll('.popup-message'));
        const maxMessages = this.config.popup?.maxMessages;
        if (popupMsgs.length > maxMessages && maxMessages > 0) {
            try {
                const removeCount = popupMsgs.length - maxMessages;
                for (let i = 0; i < removeCount; i++) {
                    popupMsgs[i]?.parentNode?.removeChild(popupMsgs[i]);
                }
            } catch (err) { console.error('Error removing excess popup messages:', err); }
        }

        // Auto-remove timer
        const duration = (this.config.popup?.duration || 5) * 1000;
        if (duration > 0 && duration < 60000) { // Validate duration
            setTimeout(() => {
                messageElement.classList.remove('visible'); // Start slide-out
                requestAnimationFrame(() => { // Ensure transition starts
                    void messageElement.offsetWidth; // Force reflow
                    messageElement.classList.add('removing');
                    setTimeout(() => { // Remove after transition
                        messageElement.parentNode?.removeChild(messageElement);
                    }, 300); // Match CSS transition duration
                });
            }, duration);
        }
    }

    /**
     * Limit the number of messages displayed in window mode
     */
    limitMessages() {
        if (!this.chatMessages) return;
        const max = this.config.maxMessages || 50;

        const scroller = this.scrollManager.scrollArea;
        const wasAtBottom = this.scrollManager.isUserScrolledToBottom(scroller);
        let distanceFromBottom = 0;
        if (scroller) {
            distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        }

        // Collect non-pinned, non-sentinel children to consider for removal
        const pinnedSelector = '.superchat-message';
        const candidates = Array.from(this.chatMessages.children)
            .filter(el => el !== this.scrollManager.bottomSentinel)
            .filter(el => !el.matches(pinnedSelector));

        while (candidates.length > max) {
            const oldest = candidates.shift();
            oldest.remove();
        }

        // Keep sentinel last
        this.scrollManager.ensureSentinelLast();

        // Restore scroll on next frame after layout settles
        if (scroller) {
            requestAnimationFrame(() => {
                if (wasAtBottom && this.scrollManager.autoFollow) {
                    this.scrollManager.setScrollTop(scroller, scroller.scrollHeight);
                } else {
                    this.scrollManager.setScrollTop(scroller, Math.max(0, scroller.scrollHeight - scroller.clientHeight - distanceFromBottom));
                }
            });
        }
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.chatMessages) {
            while (this.chatMessages.firstChild) {
                this.chatMessages.removeChild(this.chatMessages.firstChild);
            }
            this.scrollManager.ensureSentinelLast();
        }
    }
}
