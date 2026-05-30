import { TwitchChatSource } from './twitch-chat-source.js';
import { YouTubeChatSource } from './youtube-chat-source.js';

export class ChatConnection {
    constructor(configManager, chatRenderer, badgeManager, cheermoteManager) {
        this.twitch = new TwitchChatSource(configManager, chatRenderer, badgeManager, cheermoteManager);
        this.youtube = new YouTubeChatSource(configManager, chatRenderer);
        this.callbacks = [];
        this.twitch.onConnectionChange((c, t) => this.emit('twitch', c, t));
        this.youtube.onConnectionChange((c, t) => this.emit('youtube', c, t));
    }

    get currentBroadcasterId() {
        return this.twitch.currentBroadcasterId;
    }

    connectTwitch(channel) { return this.twitch.connect(channel); }
    connectYouTube(target) { return this.youtube.connect(target); }
    disconnectTwitch() { this.twitch.disconnect(); }
    disconnectYouTube() { this.youtube.disconnect(); }

    isTwitchConnected() { return this.twitch.isConnected(); }
    isYouTubeConnected() { return this.youtube.isConnected(); }
    getTwitchChannel() { return this.twitch.getCurrentTarget(); }
    getYouTubeTarget() { return this.youtube.getCurrentTarget(); }

    // Legacy methods for backwards compat
    connect(channel) { return this.connectTwitch(channel); }
    disconnect() { this.disconnectTwitch(); }
    isConnected() { return this.isTwitchConnected(); } // Fallback to Twitch status
    getCurrentChannel() { return this.getTwitchChannel(); }

    onConnectionChange(cb) { this.callbacks.push(cb); }
    emit(platform, connected, target) {
        for (const cb of this.callbacks) cb(platform, connected, target);
    }
}
