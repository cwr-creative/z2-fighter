/**
 * WebRTC peer connection manager.
 * Uses manual offer/answer exchange (copy-paste) for signaling.
 * Data channel transports serialized input frames.
 *
 * This module provides the transport layer. The GGPO-style rollback
 * layer in rollback.js sits between this and the game loop.
 */

export class NetworkManager {
  constructor() {
    this.pc = null;
    this.dataChannel = null;
    this.isHost = false;
    this.connected = false;

    /** Called when remote input is received: (inputObj) => void */
    this.onRemoteInput = null;
    /** Called when connection state changes: (connected: boolean) => void */
    this.onConnectionChange = null;
  }

  _createPeerConnection() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    this.pc = new RTCPeerConnection(config);

    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      this.connected = (s === 'connected' || s === 'completed');
      this.onConnectionChange?.(this.connected);
    };
  }

  _setupDataChannel(dc) {
    this.dataChannel = dc;
    dc.onopen = () => {
      this.connected = true;
      this.onConnectionChange?.(true);
    };
    dc.onclose = () => {
      this.connected = false;
      this.onConnectionChange?.(false);
    };
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.onRemoteInput?.(msg);
      } catch { /* ignore malformed */ }
    };
  }

  /**
   * Host: create an offer string to share with the guest.
   * Returns a base64-encoded SDP offer.
   */
  async createOffer() {
    this._createPeerConnection();
    this.isHost = true;

    const dc = this.pc.createDataChannel('game', { ordered: true });
    this._setupDataChannel(dc);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this._waitForIce();

    return btoa(JSON.stringify(this.pc.localDescription));
  }

  /**
   * Guest: accept a host's offer string and produce an answer string.
   */
  async acceptOffer(offerB64) {
    this._createPeerConnection();
    this.isHost = false;

    this.pc.ondatachannel = (e) => {
      this._setupDataChannel(e.channel);
    };

    const offer = JSON.parse(atob(offerB64));
    await this.pc.setRemoteDescription(offer);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this._waitForIce();

    return btoa(JSON.stringify(this.pc.localDescription));
  }

  /**
   * Host: accept the guest's answer string to complete the connection.
   */
  async acceptAnswer(answerB64) {
    const answer = JSON.parse(atob(answerB64));
    await this.pc.setRemoteDescription(answer);
  }

  /** Send a serialized input frame to the remote peer. */
  sendInput(frameNumber, input) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ frame: frameNumber, input }));
    }
  }

  /** Send arbitrary message (for weapon selection sync, etc.) */
  sendMessage(msg) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  close() {
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.connected = false;
  }

  _waitForIce() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
      // Fallback timeout — some browsers stall on gathering
      setTimeout(resolve, 5000);
    });
  }
}
