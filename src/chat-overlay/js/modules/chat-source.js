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

    emitConnectionChange(connected, target) {
        if (this._connCb) this._connCb(connected, target);
    }
}
