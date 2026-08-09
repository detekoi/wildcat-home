/**
 * Base Interface for Chat Sources
 */
export class ChatSource {
    constructor() {
        this._connCb = null;
    }
    
    connect(target) { throw new Error('abstract'); }
    disconnect() { throw new Error('abstract'); }
    isConnected() { return false; }
    getCurrentTarget() { return ''; }
    onConnectionChange(cb) { this._connCb = cb; }

    /**
     * @param {boolean} connected - whether chat is currently flowing
     * @param {string} target - channel / video the source is attached to
     * @param {string} state - 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
     * @param {number} attempt - reconnect attempt number, when state is 'reconnecting'
     */
    emitConnectionChange(connected, target, state = connected ? 'connected' : 'disconnected', attempt = 0) {
        if (this._connCb) this._connCb(connected, target, state, attempt);
    }
}
