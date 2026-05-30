/**
 * Chat Connection Module
 * Handles WebSocket connection to Twitch IRC and message parsing
 */

import { ChatSource } from './chat-source.js';
import { UIHelpers } from './ui-helpers.js';

export class TwitchChatSource extends ChatSource {
    constructor(configManager, chatRenderer, badgeManager, cheermoteManager) {
        super();
        this.configManager = configManager;
        this.chatRenderer = chatRenderer;
        this.badgeManager = badgeManager;
        this.cheermoteManager = cheermoteManager;
        this.socket = null;
        this.channel = '';
        this.currentBroadcasterId = null;
        this.isConnecting = false;
        this.isExplicitDisconnect = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.MAX_RECONNECT_ATTEMPTS = 5;
        this.INITIAL_RECONNECT_DELAY = 1000;
        this.MAX_RECONNECT_DELAY = 30000;
        this.statusIndicator = document.getElementById('status-indicator');
    }

    /**
     * Connect to Twitch chat
     */
    async connect(channelName) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.warn("[connectToChat] Socket already open. Closing before reconnecting.");
            this.isExplicitDisconnect = true;
            this.socket.close();
            this.socket = null;
            this.isExplicitDisconnect = false;
        }

        // Ensure any existing socket is closed before creating a new one
        if (this.socket) this.socket.close();

        this.channel = channelName.trim().toLowerCase();
        if (!this.channel) {
            this.chatRenderer.addSystemMessage('Please enter a valid channel name');
            this.isConnecting = false;
            return;
        }

        this.currentBroadcasterId = null; // Reset broadcaster ID on new connection

        this.chatRenderer.addSystemMessage(`Connecting to ${this.channel}'s chat...`, true);
        this.socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.socket.onopen = () => this.handleSocketOpen();
        this.socket.onclose = (event) => this.handleSocketClose(event);
        this.socket.onerror = (error) => this.handleSocketError(error);
        this.socket.onmessage = (event) => this.handleSocketMessage(event);
    }

    /**
     * Handle WebSocket open event
     */
    async handleSocketOpen() {
        // Use timeout to ensure socket is ready before sending commands
        setTimeout(async () => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                console.warn("[socket.onopen timeout] Socket closed before sending commands.");
                this.isConnecting = false;
                return;
            }

            this.socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
            this.socket.send(`PASS SCHMOOPIIE`); // Use anonymous PASS
            this.socket.send(`NICK justinfan${Math.floor(Math.random() * 999999)}`);
            this.socket.send(`JOIN #${this.channel}`);

            this.updateStatus(true);
            this.configManager.updateConfig('lastChannel', this.channel);
            this.configManager.updateConfig('lastTwitchChannel', this.channel);
            this.configManager.saveLastChannelOnly(this.channel, UIHelpers.getUrlParameter('scene') || 'default');

            this.emitConnectionChange(true, this.channel);

            this.chatRenderer.addSystemMessage(
                this.reconnectAttempts > 0 ? `Reconnected to ${this.channel}'s chat.` : `Connected to ${this.channel}'s chat`,
                true
            );
            this.reconnectAttempts = 0; // Reset on successful connection
            this.isConnecting = false;

            // Fetch global badges on successful connection
            await this.badgeManager.fetchGlobalBadges();
            // Channel badges and cheermotes will be fetched on ROOMSTATE with the broadcaster ID
        }, 50); // Small delay can sometimes help ensure readiness
    }

    /**
     * Handle WebSocket close event
     */
    handleSocketClose(event) {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
        this.isConnecting = false;
        const lastConnectedChannel = this.channel; // Store before clearing
        this.socket = null;
        this.channel = '';
        this.currentBroadcasterId = null;

        this.emitConnectionChange(false, '');

        if (!this.isExplicitDisconnect) {
            this.chatRenderer.addSystemMessage('Connection lost. Attempting to reconnect...');
            this.scheduleReconnect(lastConnectedChannel); // Attempt reconnect
        } else {
            this.chatRenderer.addSystemMessage('Disconnected from chat.');
            this.updateStatus(false);
            this.isExplicitDisconnect = false; // Reset flag
        }
    }

    /**
     * Handle WebSocket error event
     */
    handleSocketError(error) {
        console.error('WebSocket Error:', error);
        this.chatRenderer.addSystemMessage('Error connecting to chat. Check console for details.');
        this.isConnecting = false;
        // Let socket.onclose handle potential reconnection logic
    }

    /**
     * Handle WebSocket message event
     */
    handleSocketMessage(event) {
        const messages = event.data.split('\r\n');
        messages.forEach(message => {
            if (!message) return;

            if (message.startsWith('PING ') || message === 'PING') { // Handle PING/PONG keepalive
                this.socket?.send('PONG :tmi.twitch.tv');
                return;
            }

            const tags = this.parseIRCTags(message);

            // Handle ROOMSTATE for broadcaster_id and fetching channel badges
            if (message.includes('ROOMSTATE')) {
                if (tags['room-id'] && tags['room-id'] !== this.currentBroadcasterId) {
                    this.currentBroadcasterId = tags['room-id'];
                    console.log(`Switched to room/broadcaster ID: ${this.currentBroadcasterId}`);
                    this.chatRenderer.setCurrentBroadcasterId(this.currentBroadcasterId);
                    this.badgeManager.fetchChannelBadges(this.currentBroadcasterId); // Fetch badges for the new room
                    // Fetch channel-specific cheermotes (includes global + channel custom)
                    if (this.cheermoteManager) {
                        this.cheermoteManager.fetchCheermotes(this.currentBroadcasterId).catch(err =>
                            console.warn('Failed to fetch channel cheermotes:', err)
                        );
                    }
                }
                return; // ROOMSTATE messages don't need further processing as chat messages
            }

            if (message.includes('PRIVMSG')) { // Handle chat messages
                this.handlePrivMsg(message, tags);
            } else if (message.includes('USERNOTICE')) { // Handle sub/resub/gift/raid events
                this.handleUserNotice(message, tags);
            }
        });
    }

    /**
     * Parse IRC v3 tags
     */
    parseIRCTags(message) {
        const tags = {};
        if (message.startsWith('@')) {
            try {
                const tagPart = message.slice(1, message.indexOf(' '));
                tagPart.split(';').forEach(tag => {
                    if (tag?.includes('=')) {
                        const [key, value] = tag.split('=');
                        if (key) tags[key] = value || '';
                    }
                });
            } catch (err) {
                console.error('Error parsing IRC tags:', err);
            }
        }
        return tags;
    }

    /**
     * Decode IRCv3 tag value escape sequences
     * @see https://ircv3.net/specs/extensions/message-tags.html#escaping-values
     */
    unescapeTagValue(value) {
        if (!value) return '';
        return value
            .replace(/\\s/g, ' ')
            .replace(/\\:/g, ';')
            .replace(/\\r/g, '\r')
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\');
    }

    /**
     * Parse emote tag string into a structured object
     * Shared by handlePrivMsg and handleUserNotice
     * @param {string} emotesTag - Raw emotes tag value (e.g. "25:0-4,12-16/30:6-9")
     * @returns {Object|null} - Parsed emotes object or null
     */
    parseEmoteTags(emotesTag) {
        if (!emotesTag) return null;
        try {
            const emotes = {};
            emotesTag.split('/').forEach(group => {
                if (!group?.includes(':')) return;
                const [emoteId, positions] = group.split(':');
                if (emoteId && positions) emotes[emoteId] = positions.split(',').filter(pos => pos?.includes('-'));
            });
            return emotes;
        } catch (err) {
            console.error('Error parsing emotes:', err, emotesTag);
            return null;
        }
    }

    /**
     * Handle PRIVMSG (chat message)
     */
    handlePrivMsg(message, tags) {
        // Extract username (prefer display-name tag)
        let username = tags['display-name'] || message.match(/:(.*?)!/)?.[1] || 'Anonymous';

        // Extract message content
        let messageContent = '';
        try {
            const msgParts = message.split('PRIVMSG #');
            if (msgParts.length > 1) {
                const colonIndex = msgParts[1].indexOf(' :');
                if (colonIndex !== -1) messageContent = msgParts[1].substring(colonIndex + 2);
            }
        } catch (err) {
            console.error('Error extracting message content:', err);
        }

        // Parse emotes from tags
        const emotes = this.parseEmoteTags(tags.emotes);

        // If broadcasterId hasn't been set yet (e.g. from ROOMSTATE), try to get it from PRIVMSG tags
        if (!this.currentBroadcasterId && tags['room-id']) {
            this.currentBroadcasterId = tags['room-id'];
            console.log(`Got broadcaster ID from PRIVMSG: ${this.currentBroadcasterId}`);
            this.chatRenderer.setCurrentBroadcasterId(this.currentBroadcasterId);
            this.badgeManager.fetchChannelBadges(this.currentBroadcasterId);
        }

        // Detect /me (ACTION) messages: IRC format is \x01ACTION <msg>\x01
        let isAction = false;
        if (messageContent.startsWith('\x01ACTION ') && messageContent.endsWith('\x01')) {
            isAction = true;
            messageContent = messageContent.slice(8, -1); // Strip \x01ACTION  and trailing \x01
        } else if (messageContent.startsWith('ACTION ') && messageContent.endsWith('\x01')) {
            // Sometimes the leading \x01 is already stripped
            isAction = true;
            messageContent = messageContent.slice(7, -1);
        } else if (messageContent.startsWith('\x01ACTION ')) {
            // Sometimes the trailing \x01 is already stripped
            isAction = true;
            messageContent = messageContent.slice(8);
        } else if (messageContent.startsWith('ACTION ')) {
            // Both control chars stripped
            isAction = true;
            messageContent = messageContent.slice(7);
        }

        this.chatRenderer.addChatMessage({
            platform: 'twitch',
            username,
            message: messageContent,
            color: tags.color || null,
            emotes,
            tags,
            isAction
        });
    }

    /**
     * Handle USERNOTICE (sub, resub, gift sub, raid, announcement, etc.)
     * These events arrive via IRC when twitch.tv/commands capability is requested.
     */
    handleUserNotice(message, tags) {
        const msgId = tags['msg-id'];
        if (!msgId) return;

        const displayName = tags['display-name'] || tags.login || 'Someone';
        const systemMsg = this.unescapeTagValue(tags['system-msg']);

        // Extract optional user message (e.g. resub share text)
        let userMessage = '';
        try {
            const parts = message.split('USERNOTICE #');
            if (parts.length > 1) {
                const colonIndex = parts[1].indexOf(' :');
                if (colonIndex !== -1) userMessage = parts[1].substring(colonIndex + 2);
            }
        } catch (err) {
            // No user message attached
        }

        // Parse emotes — always parse when present (needed for both userMessage and systemMsg fallback)
        const emotes = this.parseEmoteTags(tags.emotes);

        // Sub plan display name
        const subPlanMap = { 'Prime': 'Prime', '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };
        const subPlan = subPlanMap[tags['msg-param-sub-plan']] || tags['msg-param-sub-plan'] || '';

        let eventData = null;

        switch (msgId) {
            case 'sub':
                eventData = {
                    eventType: 'sub',
                    icon: '⭐',
                    text: `${displayName} subscribed${subPlan ? ` with ${subPlan}` : ''}!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;

            case 'resub': {
                const months = tags['msg-param-cumulative-months'] || '?';
                const showStreak = tags['msg-param-should-share-streak'] === '1';
                const streak = tags['msg-param-streak-months'];
                let text = `${displayName} resubscribed for ${months} months${subPlan ? ` with ${subPlan}` : ''}!`;
                if (showStreak && streak) {
                    text += ` (${streak} month streak)`;
                }
                eventData = {
                    eventType: 'resub',
                    icon: '⭐',
                    text, userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'subgift': {
                const recipient = tags['msg-param-recipient-display-name'] || 'someone';
                eventData = {
                    eventType: 'subgift',
                    icon: '🎁',
                    text: `${displayName} gifted a ${subPlan || 'Tier 1'} sub to ${recipient}!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'submysterygift': {
                const giftCount = tags['msg-param-mass-gift-count'] || '?';
                eventData = {
                    eventType: 'submysterygift',
                    icon: '🎁',
                    text: `${displayName} is gifting ${giftCount} ${subPlan || 'Tier 1'} subs to the community!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'raid': {
                const viewerCount = tags['msg-param-viewerCount'] || '?';
                eventData = {
                    eventType: 'raid',
                    icon: '🎉',
                    text: `${displayName} is raiding with ${viewerCount} viewers!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'announcement': {
                const announcementColor = tags['msg-param-color'] || 'PRIMARY';
                eventData = {
                    eventType: 'announcement',
                    icon: '📢',
                    text: `${displayName}`,
                    announcementColor,
                    userMessage: userMessage || systemMsg,
                    emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'bitsbadgetier': {
                const threshold = tags['msg-param-threshold'] || '?';
                eventData = {
                    eventType: 'bitsbadgetier',
                    icon: '💎',
                    text: `${displayName} earned a new ${threshold} Bits badge!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'giftpaidupgrade': {
                const sender = tags['msg-param-sender-name'] || tags['msg-param-sender-login'] || 'someone';
                eventData = {
                    eventType: 'giftpaidupgrade',
                    icon: '⭐',
                    text: `${displayName} is continuing their gifted sub from ${sender}!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;
            }

            case 'primepaidupgrade':
                eventData = {
                    eventType: 'primepaidupgrade',
                    icon: '⭐',
                    text: `${displayName} converted from Prime to a ${subPlan || 'paid'} sub!`,
                    userMessage, emotes, tags,
                    color: tags.color || null
                };
                break;

            default:
                // Unknown USERNOTICE type — render with system-msg fallback
                if (systemMsg) {
                    eventData = {
                        eventType: 'unknown',
                        icon: 'ℹ️',
                        text: systemMsg,
                        userMessage, emotes, tags,
                        color: tags.color || null
                    };
                }
                break;
        }

        if (eventData) {
            eventData.platform = 'twitch';
            this.chatRenderer.renderTwitchEvent(eventData);
        }
    }

    /**
     * Disconnect from chat
     */
    disconnect() {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            this.isExplicitDisconnect = true;
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            this.reconnectAttempts = 0;
            this.socket.close();
        } else {
            this.updateStatus(false);
            this.isExplicitDisconnect = false;
        }
    }

    /**
     * Schedule a reconnection attempt
     */
    scheduleReconnect(channelToReconnect) {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            this.chatRenderer.addSystemMessage(`Failed to reconnect after ${this.MAX_RECONNECT_ATTEMPTS} attempts. Please try again manually.`);
            this.reconnectAttempts = 0;
            this.updateStatus(false);
            return;
        }

        const delay = Math.min(
            this.INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
            this.MAX_RECONNECT_DELAY
        );

        this.reconnectAttempts++;
        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

        this.reconnectTimer = setTimeout(() => {
            if (!this.isExplicitDisconnect && channelToReconnect) {
                console.log(`Attempting to reconnect to ${channelToReconnect}...`);
                this.connect(channelToReconnect);
            }
        }, delay);
    }

    /**
     * Update status indicator
     */
    updateStatus(connected) {
        if (!this.statusIndicator) return;
        this.statusIndicator.className = connected ? 'connected' : 'disconnected';
        this.statusIndicator.title = connected ? `Connected to ${this.channel}'s chat` : 'Disconnected';
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Check if currently connected, connecting, or actively attempting to reconnect.
     */
    isActive() {
        return this.isConnected() || this.isConnecting || this.reconnectTimer !== null;
    }

    /**
     * Get current channel
     */
    getCurrentChannel() {
        return this.channel;
    }

    getCurrentTarget() {
        return this.channel;
    }
}


