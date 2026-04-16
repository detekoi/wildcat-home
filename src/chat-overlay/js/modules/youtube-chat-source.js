import { ChatSource } from './chat-source.js';

/**
 * YouTube Chat Source Stub
 */
export class YouTubeChatSource extends ChatSource {
    constructor(chatRenderer) {
        super();
        this.chatRenderer = chatRenderer;
        this.ws = null;
        this.target = '';
        this.isExplicitDisconnect = false;
        this.status = false;
    }

    async connect(target) {
        // Stub implementation
        this.target = target;
        this.isExplicitDisconnect = false;
        
        // Simulating the flow
        this.chatRenderer.addSystemMessage(`YouTube connection stub: looking up ${target}...`, true);
        
        setTimeout(() => {
            this.status = true;
            this.chatRenderer.addSystemMessage(`Connected to YouTube stub: ${target}`, true);
            this.emitConnectionChange(true, target);
        }, 500);
    }

    disconnect() {
        this.isExplicitDisconnect = true;
        this.status = false;
        this.target = '';
        this.emitConnectionChange(false, '');
    }

    isConnected() { return this.status; }
    getCurrentTarget() { return this.target; }
}
