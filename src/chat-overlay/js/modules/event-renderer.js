/**
 * Event Renderer Module
 * Handles rendering of special events (SuperChats, Memberships, Twitch Native Events)
 */

export class EventRenderer {
    constructor(chatRenderer) {
        this.chatRenderer = chatRenderer;
    }

    /** Always read the live config from chatRenderer (it gets reassigned on settings save, scene sync, etc.) */
    get config() {
        return this.chatRenderer.config;
    }

    renderSuperChat(data, targetContainer, currentScrollArea) {
        const { container, isPopup } = this.chatRenderer._resolveTargetContainer();
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

        const contentNodes = this.chatRenderer.buildMessageContentDOM(data.message || "", data.emotes, false, 'youtube');
        if (contentNodes.childNodes.length > 0) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'superchat-body chat-text';
            bodyEl.appendChild(contentNodes);
            superChatEl.appendChild(bodyEl);
        }

        itemContainer.appendChild(superChatEl);
        this.chatRenderer._finalizeAppend(itemContainer, container, isPopup);
    }

    renderMembershipEvent(data, targetContainer, currentScrollArea) {
        const { container, isPopup } = this.chatRenderer._resolveTargetContainer();
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
        this.chatRenderer._finalizeAppend(itemContainer, container, isPopup);
    }

    /**
     * Render a Twitch native event (sub, resub, gift sub, raid, announcement, etc.)
     * Called from TwitchChatSource.handleUserNotice()
     */
    renderTwitchEvent(data) {
        const { container, isPopup } = this.chatRenderer._resolveTargetContainer();
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
            const contentNodes = this.chatRenderer.buildMessageContentDOM(data.userMessage, data.emotes, hasBits, 'twitch');
            bodyEl.appendChild(contentNodes);

            eventEl.appendChild(bodyEl);
        }

        itemContainer.appendChild(eventEl);
        this.chatRenderer._finalizeAppend(itemContainer, container, isPopup);
    }
}
