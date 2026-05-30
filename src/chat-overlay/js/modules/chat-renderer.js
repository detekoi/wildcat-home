/**
 * Chat Renderer Module
 * Handles rendering of chat messages and system messages to the DOM
 */

import { UIHelpers } from './ui-helpers.js';

export class ChatRenderer {
    constructor(config, scrollManager, badgeManager, pronounManager, cheermoteManager) {
        this.config = config;
        this.scrollManager = scrollManager;
        this.badgeManager = badgeManager;
        this.pronounManager = pronounManager;
        this.cheermoteManager = cheermoteManager;
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

        if (this.config.showTimestamps) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const tsSpan = document.createElement('span');
            tsSpan.className = 'timestamp';
            tsSpan.textContent = `${hours}:${minutes} `;
            messageElement.appendChild(tsSpan);
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'message-content';
        contentSpan.textContent = message;
        messageElement.appendChild(contentSpan);

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
        const { container, isPopup } = this._resolveTargetContainer();
        if (!container) return;

        const itemContainer = document.createElement('div');
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
        this._finalizeAppend(itemContainer, container, isPopup);
    }

    renderMembershipEvent(data, targetContainer, currentScrollArea) {
        const { container, isPopup } = this._resolveTargetContainer();
        if (!container) return;

        const itemContainer = document.createElement('div');
        itemContainer.className = isPopup ? 'popup-message membership-message system-message' : 'chat-message membership-message system-message';
        if (isPopup) itemContainer.classList.add(this.config.popup?.direction || 'from-bottom');

        const memEl = document.createElement('div');
        memEl.className = 'membership';
        
        const textEl = document.createElement('span');
        textEl.className = 'membership-text';
        textEl.textContent = `⭐ ${data.username} changed memberships: ${data.subtext || "Join"}`;
        memEl.appendChild(textEl);
        
        itemContainer.appendChild(memEl);
        this._finalizeAppend(itemContainer, container, isPopup);
    }

    /**
     * Render a Twitch native event (sub, resub, gift sub, raid, announcement, etc.)
     * Called from TwitchChatSource.handleUserNotice()
     */
    renderTwitchEvent(data) {
        const { container, isPopup } = this._resolveTargetContainer();
        if (!container) return;

        const itemContainer = document.createElement('div');
        itemContainer.className = isPopup
            ? 'popup-message twitch-event-message'
            : 'chat-message twitch-event-message';
        if (isPopup) itemContainer.classList.add(this.config.popup?.direction || 'from-bottom');

        const eventEl = document.createElement('div');
        eventEl.className = `twitch-event twitch-event--${data.eventType}`;

        // Announcement color accent
        if (data.eventType === 'announcement' && data.announcementColor) {
            const colorMap = {
                'PRIMARY': '#9147ff',
                'BLUE': '#0076ff',
                'GREEN': '#00c853',
                'ORANGE': '#ff6f00',
                'PURPLE': '#9147ff'
            };
            const accentColor = colorMap[data.announcementColor.toUpperCase()] || colorMap.PRIMARY;
            eventEl.style.setProperty('--event-accent', accentColor);
        }

        // Event header: icon + text
        const headerEl = document.createElement('div');
        headerEl.className = 'twitch-event-header';

        if (data.icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'twitch-event-icon';
            iconEl.textContent = data.icon;
            headerEl.appendChild(iconEl);
        }

        const textEl = document.createElement('span');
        textEl.className = 'twitch-event-text';
        textEl.textContent = data.text;
        headerEl.appendChild(textEl);

        eventEl.appendChild(headerEl);

        // Optional user message (resub share, announcement body, etc.)
        if (data.userMessage) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'twitch-event-body';

            // Use buildMessageContentDOM for emote support in the user message
            const hasBits = !!(data.tags?.bits);
            const contentNodes = this.buildMessageContentDOM(data.userMessage, data.emotes, hasBits);
            bodyEl.appendChild(contentNodes);

            eventEl.appendChild(bodyEl);
        }

        itemContainer.appendChild(eventEl);
        this._finalizeAppend(itemContainer, container, isPopup);
    }

    /**
     * Resolve the target container for appending messages (shared by all render methods)
     * @returns {{ container: HTMLElement|null, isPopup: boolean }}
     */
    _resolveTargetContainer() {
        const isPopup = this.config.chatMode === 'popup';
        if (isPopup) {
            return { container: document.getElementById('popup-messages'), isPopup };
        }
        return { container: this.chatMessages, isPopup };
    }

    /**
     * Append an item to the container and handle scroll/sentinel/popup behavior
     * @param {HTMLElement} itemContainer - The message element to append
     * @param {HTMLElement} container - The target container
     * @param {boolean} isPopup - Whether in popup mode
     */
    _finalizeAppend(itemContainer, container, isPopup) {
        container.appendChild(itemContainer);
        if (isPopup) {
            this.handlePopupMessage(itemContainer, container);
        } else {
            this.scrollManager.ensureSentinelLast();
            this.limitMessages();
            if (this.scrollManager.autoFollow) {
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
            const hasBits = !!(data.tags?.bits);
            const contentNodes = this.buildMessageContentDOM(data.message, data.emotes, hasBits);
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
            usernameSpan.textContent = data.isAction ? `${data.username}` : `${data.username}:`;
            messageElement.appendChild(usernameSpan);

            const contentContainer = document.createElement('span');
            contentContainer.className = 'message-content';
            if (data.isAction) {
                contentContainer.classList.add('action-text');
                contentContainer.style.color = userColor;
            }
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
    buildMessageContentDOM(message, emotes, hasBits = false) {
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

        // Parse cheermotes if the message has bits and we have cheermote data
        let cheermotePositions = [];
        if (hasBits && this.cheermoteManager) {
            cheermotePositions = this.cheermoteManager.parseCheermotes(message);
        }

        // Merge emote positions and cheermote positions into a unified list
        const allPositions = [
            ...emotePositions.map(e => ({ ...e, type: 'emote' })),
            ...cheermotePositions.map(c => ({ ...c, type: 'cheermote' }))
        ].sort((a, b) => a.start - b.start);

        // URL detection helper for text segments
        const urlRegex = /(\bhttps?:\/\/[^\s<]+)/g;
        const appendTextWithUrls = (text) => {
            if (!text) return;
            urlRegex.lastIndex = 0;
            let lastIdx = 0;
            let match;
            while ((match = urlRegex.exec(text)) !== null) {
                if (match.index > lastIdx) {
                    frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
                }
                try {
                    const validUrl = new URL(match[0]);
                    if (validUrl.protocol === 'http:' || validUrl.protocol === 'https:') {
                        const a = document.createElement('a');
                        a.href = validUrl.href;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.textContent = match[0]; // safe
                        frag.appendChild(a);
                    } else {
                        frag.appendChild(document.createTextNode(match[0]));
                    }
                } catch (e) {
                    frag.appendChild(document.createTextNode(match[0]));
                }
                lastIdx = urlRegex.lastIndex;
            }
            if (lastIdx < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx)));
            }
        };

        if (allPositions.length === 0) {
            // No emotes or cheermotes — just parse URLs
            appendTextWithUrls(message);
        } else {
            let lastIndex = 0;
            for (const pos of allPositions) {
                // Skip if this position overlaps with a previous one
                if (pos.start < lastIndex) continue;

                if (pos.start > lastIndex) {
                    appendTextWithUrls(message.slice(lastIndex, pos.start));
                }

                if (pos.type === 'cheermote') {
                    // Render cheermote: animated image + colored bit amount
                    const wrapper = document.createElement('span');
                    wrapper.className = 'cheermote';

                    const img = document.createElement('img');
                    img.className = 'emote cheermote-img';
                    img.src = pos.imageUrl;
                    img.alt = pos.text;
                    img.title = `${pos.prefix} ${pos.bits}`;
                    wrapper.appendChild(img);

                    const bitsSpan = document.createElement('span');
                    bitsSpan.className = 'cheermote-bits';
                    bitsSpan.style.color = pos.color;
                    bitsSpan.textContent = pos.bits;
                    wrapper.appendChild(bitsSpan);

                    frag.appendChild(wrapper);
                    lastIndex = pos.end + 1;
                } else {
                    // Render emote (existing logic)
                    const emoteCode = message.substring(pos.start, pos.end + 1);

                    // Restrict YT emoji URLs to trusted domains
                    let isYtEmoji = false;
                    if (pos.id.startsWith('http')) {
                        try {
                            const emoteUrl = new URL(pos.id);
                            const host = emoteUrl.hostname;
                            if (host === 'youtube.com' || host.endsWith('.youtube.com') ||
                                host === 'ytimg.com' || host.endsWith('.ytimg.com') ||
                                host === 'google.com' || host.endsWith('.google.com') ||
                                host === 'ggpht.com' || host.endsWith('.ggpht.com') ||
                                host === 'gstatic.com' || host.endsWith('.gstatic.com')) {
                                isYtEmoji = true;
                            }
                        } catch (e) {
                            // Invalid URL
                        }
                    }

                    const img = document.createElement('img');
                    img.className = 'emote';
                    if (isYtEmoji) {
                        img.classList.add('yt-emoji');
                        img.src = pos.id;
                    } else if (!pos.id.startsWith('http')) {
                        const baseUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(pos.id)}/default/dark`;
                        img.src = `${baseUrl}/3.0`;
                        img.onerror = function() {
                            this.onerror = function() { this.src = `${baseUrl}/1.0`; };
                            this.src = `${baseUrl}/2.0`;
                        };
                    } else {
                        // Fallback for malicious or unrecognized HTTP IDs
                        frag.appendChild(document.createTextNode(emoteCode));
                        lastIndex = pos.end + 1;
                        continue;
                    }
                    img.alt = emoteCode;
                    img.title = emoteCode;
                    frag.appendChild(img);
                    lastIndex = pos.end + 1;
                }
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
