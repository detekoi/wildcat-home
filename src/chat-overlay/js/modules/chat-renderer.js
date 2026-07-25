/**
 * Chat Renderer Module
 * Handles rendering of chat messages and system messages to the DOM
 */

import { UIHelpers } from './ui-helpers.js';

const ENTRY_MS = 350;
const EXIT_MS = 400;

function motionDisabled(el) {
    if (typeof el.animate !== 'function') return true;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class ChatRenderer {
    constructor(config, scrollManager, badgeManager, pronounManager, cheermoteManager, thirdPartyEmoteManager = null) {
        this.config = config;
        this.scrollManager = scrollManager;
        this.badgeManager = badgeManager;
        this.pronounManager = pronounManager;
        this.cheermoteManager = cheermoteManager;
        this.thirdPartyEmoteManager = thirdPartyEmoteManager;
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
        this._glideWindowEntry(messageElement);

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

        const contentNodes = this.buildMessageContentDOM(data.message || "", data.emotes, false, 'youtube');
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
            const iconEl = document.createElement('i');
            iconEl.className = 'twitch-event-icon';
            iconEl.setAttribute('data-lucide', data.icon);
            headerEl.appendChild(iconEl);
            // Render the Lucide SVG; scoped to just this icon element
            if (typeof lucide !== 'undefined') {
                try { lucide.createIcons({ attrs: { class: 'twitch-event-icon-svg' }, nameAttr: 'data-lucide', nodes: [iconEl] }); } catch (e) { /* fallback: icon stays as empty <i> */ }
            }
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
            const contentNodes = this.buildMessageContentDOM(data.userMessage, data.emotes, hasBits, 'twitch');
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
            this._glideWindowEntry(itemContainer);
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
            const contentNodes = this.buildMessageContentDOM(data.message, data.emotes, hasBits, data.platform || 'twitch');
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
                while (bWrapper.firstChild) messageElement.appendChild(bWrapper.firstChild);
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

            if (this.config.chatMode !== 'popup') {
                this._glideWindowEntry(messageElement);
            }

            // After message added, listen for image loads to adjust scroll if needed
            if (this.config.chatMode !== 'popup' && currentScrollArea && this.scrollManager.isUserScrolledToBottom(currentScrollArea)) {
                const imgs = messageElement.querySelectorAll('img');
                imgs.forEach(img => {
                    if (!img.complete) {
                        img.addEventListener('load', () => this._glideOnContentGrowth(), { once: true });
                        img.addEventListener('error', () => this._glideOnContentGrowth(), { once: true });
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
    buildMessageContentDOM(message, emotes, hasBits = false, platform = 'twitch') {
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

        // Native emote + cheermote occupied ranges for third-party emote exclusion
        const occupiedRanges = [
            ...emotePositions.map(e => ({ start: e.start, end: e.end })),
            ...cheermotePositions.map(c => ({ start: c.start, end: c.end }))
        ];

        // Parse third-party emotes (BTTV / FFZ / 7TV) if Twitch and enabled
        let thirdPartyPositions = [];
        if (platform === 'twitch' && this.config.thirdPartyEmotes !== false && this.thirdPartyEmoteManager) {
            thirdPartyPositions = this.thirdPartyEmoteManager.parseThirdPartyEmotes(message, occupiedRanges);
        }

        // Merge emote positions, cheermote positions, and third-party emote positions into a unified list
        const allPositions = [
            ...emotePositions.map(e => ({ ...e, type: 'emote' })),
            ...cheermotePositions.map(c => ({ ...c, type: 'cheermote' })),
            ...thirdPartyPositions.map(t => ({ ...t, type: 'thirdparty' }))
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
            let lastEmote = null; // { node: HTMLElement, end: number }

            for (const pos of allPositions) {
                // Skip if this position overlaps with a previous one
                if (pos.start < lastIndex) continue;

                // Check zero-width attach condition
                const isZeroWidthAttach = pos.type === 'thirdparty'
                    && pos.zeroWidth
                    && lastEmote
                    && pos.start === lastEmote.end + 2
                    && message[lastEmote.end + 1] === ' ';

                if (isZeroWidthAttach) {
                    // Attach zero-width emote to preceding emote (swallow separating space)
                    let stackNode;
                    if (lastEmote.node.classList && lastEmote.node.classList.contains('emote-stack')) {
                        stackNode = lastEmote.node;
                    } else {
                        stackNode = document.createElement('span');
                        stackNode.className = 'emote-stack';
                        frag.replaceChild(stackNode, lastEmote.node);
                        stackNode.appendChild(lastEmote.node);
                    }

                    const overlayImg = document.createElement('img');
                    overlayImg.className = 'emote emote-overlay';
                    overlayImg.src = pos.imageUrl;
                    overlayImg.alt = pos.code;
                    overlayImg.title = pos.code;
                    if (pos.imageUrl.includes('3x.webp')) {
                        overlayImg.onerror = function () {
                            this.onerror = function () { this.src = this.src.replace('2x.webp', '1x.webp'); };
                            this.src = this.src.replace('3x.webp', '2x.webp');
                        };
                    }
                    stackNode.appendChild(overlayImg);

                    lastEmote = { node: stackNode, end: pos.end };
                    lastIndex = pos.end + 1;
                    continue;
                }

                if (pos.start > lastIndex) {
                    const textChunk = message.slice(lastIndex, pos.start);
                    appendTextWithUrls(textChunk);
                    if (textChunk.length > 0) {
                        lastEmote = null;
                    }
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
                    lastEmote = null; // Zero-width cannot attach to cheermotes
                    lastIndex = pos.end + 1;
                } else if (pos.type === 'thirdparty') {
                    const img = document.createElement('img');
                    img.className = 'emote third-party-emote';
                    img.src = pos.imageUrl;
                    img.alt = pos.code;
                    img.title = pos.code;
                    if (pos.imageUrl.includes('3x.webp')) {
                        img.onerror = function () {
                            this.onerror = function () { this.src = this.src.replace('2x.webp', '1x.webp'); };
                            this.src = this.src.replace('3x.webp', '2x.webp');
                        };
                    }
                    frag.appendChild(img);
                    lastEmote = { node: img, end: pos.end };
                    lastIndex = pos.end + 1;
                } else {
                    // Render native Twitch / YT emote
                    const emoteCode = message.substring(pos.start, pos.end + 1);

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
                        } catch (e) {}
                    }

                    const img = document.createElement('img');
                    img.className = 'emote';
                    if (isYtEmoji) {
                        img.classList.add('yt-emoji');
                        img.src = pos.id;
                        img.alt = emoteCode;
                        img.title = emoteCode;
                        frag.appendChild(img);
                        lastEmote = null;
                    } else if (!pos.id.startsWith('http')) {
                        const baseUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(pos.id)}/default/dark`;
                        img.src = `${baseUrl}/3.0`;
                        img.onerror = function () {
                            this.onerror = function () { this.src = `${baseUrl}/1.0`; };
                            this.src = `${baseUrl}/2.0`;
                        };
                        img.alt = emoteCode;
                        img.title = emoteCode;
                        frag.appendChild(img);
                        lastEmote = { node: img, end: pos.end };
                    } else {
                        frag.appendChild(document.createTextNode(emoteCode));
                        lastEmote = null;
                    }
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
                if (hasOneEmote) return false;
                hasOneEmote = true;
            } else if (child.nodeName.toLowerCase() === 'span' && child.classList.contains('emote-stack')) {
                if (hasOneEmote) return false;
                const children = Array.from(child.childNodes);
                if (children.length === 0 || !children.every(c => c.nodeName.toLowerCase() === 'img' && c.classList.contains('emote'))) {
                    return false;
                }
                hasOneEmote = true;
            } else {
                return false;
            }
        }
        return hasOneEmote && !hasText;
    }

    /**
     * Handle popup message animation and removal
     */
    handlePopupMessage(messageElement, targetContainer) {
        void messageElement.offsetWidth; // Force reflow for transition
        this._animatePopupEntry(messageElement);
        messageElement.classList.add('visible');

        // Limit popup messages
        const popupMsgs = Array.from(targetContainer.querySelectorAll('.popup-message:not([data-removing])'));
        const maxMessages = this.config.popup?.maxMessages;
        if (popupMsgs.length > maxMessages && maxMessages > 0) {
            try {
                const removeCount = popupMsgs.length - maxMessages;
                for (let i = 0; i < removeCount; i++) {
                    this.removePopup(popupMsgs[i]);
                }
            } catch (err) { console.error('Error removing excess popup messages:', err); }
        }

        // Auto-remove timer
        const duration = (this.config.popup?.duration || 5) * 1000;
        if (duration > 0 && duration < 60000) { // Validate duration
            messageElement._expiryTimer = setTimeout(() => this.removePopup(messageElement), duration);
        }
    }

    _animatePopupEntry(el) {
        if (motionDisabled(el)) return;
        const h = el.offsetHeight;
        if (!h) return;

        el.style.overflow = 'hidden';
        const anim = el.animate([
            { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', offset: 0 }
        ], { duration: ENTRY_MS, easing: 'ease-out' });

        const onFinish = () => {
            el.style.overflow = '';
        };

        anim.onfinish = onFinish;
        anim.oncancel = onFinish;
    }

    /**
     * Glide the whole window-mode message list when new content pushes it up.
     * Animating the newcomer's height forces layout + scroll re-pinning every
     * frame (visible jitter); instead, pin the scroller to the bottom once,
     * offset the list downward by the added height, and let the compositor
     * animate the offset back to zero.
     */
    _glideWindowBy(offsetPx) {
        const container = this.chatMessages;
        const scroller = this.scrollManager?.scrollArea;
        if (!container || !scroller || !offsetPx) return false;
        if (motionDisabled(container)) return false;

        // Pin scroll and apply the offset in the same synchronous block so no
        // intermediate state is ever painted
        this.scrollManager.setScrollTop(scroller, scroller.scrollHeight);

        let start = offsetPx;
        if (this._glideAnim) {
            // A glide is already running (message burst): continue from the
            // list's current visual offset instead of snapping
            const current = getComputedStyle(container).transform;
            if (current && current !== 'none') {
                try { start += new DOMMatrixReadOnly(current).m42; } catch (e) { /* keep start */ }
            }
            this._glideAnim.cancel();
        }

        const anim = container.animate([
            { transform: `translateY(${start}px)` },
            { transform: 'translateY(0px)' }
        ], { duration: ENTRY_MS, easing: 'ease-out' });

        const clear = () => { if (this._glideAnim === anim) this._glideAnim = null; };
        anim.onfinish = clear;
        anim.oncancel = clear;
        this._glideAnim = anim;
        return true;
    }

    _glideWindowEntry(el) {
        if (this.config.chatMode === 'popup') return;
        if (!this.scrollManager?.autoFollow) return;
        const marginBottom = parseFloat(getComputedStyle(el).marginBottom) || 0;
        this._glideWindowBy(el.offsetHeight + marginBottom);
    }

    /**
     * Late content growth (e.g. an emote image finishing its load) pushes the
     * pinned scroll away from the bottom; glide over the gap instead of the
     * instant re-pin jump.
     */
    _glideOnContentGrowth() {
        if (this.config.chatMode === 'popup' || !this.scrollManager?.autoFollow) return;
        const scroller = this.scrollManager.scrollArea;
        if (!scroller) return;
        const gap = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
        if (!(gap > 1 && this._glideWindowBy(gap))) {
            this.scrollManager.stickToBottomSoon();
        }
    }

    removePopup(el) {
        if (el.dataset.removing) return;
        el.dataset.removing = 'true';

        if (el._expiryTimer) {
            clearTimeout(el._expiryTimer);
            el._expiryTimer = null;
        }

        el.classList.remove('visible');
        void el.offsetWidth; // Force reflow
        el.classList.add('removing');

        if (motionDisabled(el)) {
            if (el.parentNode) el.remove();
            return;
        }

        el.style.overflow = 'hidden';
        const anim = el.animate([
            { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
        ], { duration: EXIT_MS, easing: 'ease-out', fill: 'forwards' });

        const finish = () => {
            if (el.parentNode) el.remove();
        };

        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, EXIT_MS + 100);
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
