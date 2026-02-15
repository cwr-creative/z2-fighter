/**
 * GGPO-style rollback netcode for online play.
 *
 * Predicts remote input (repeats last confirmed), advances optimistically,
 * and resimulates from a saved snapshot when a misprediction is detected.
 */
import * as C from './constants.js';
import { cloneState, createEmptyInput } from './state.js';
import { simulateFrame } from './simulation.js';

// ─── Utilities ───────────────────────────────────────────────

function inputsEqual(a, b) {
  return a.left === b.left &&
    a.right === b.right &&
    a.crouch === b.crouch &&
    a.weapon1 === b.weapon1 &&
    a.weapon2 === b.weapon2 &&
    a.weapon3 === b.weapon3;
}

// ─── Ring Buffers ────────────────────────────────────────────

class InputHistory {
  constructor(size = 128) {
    this.buf = new Array(size);
    this.frames = new Int32Array(size).fill(-1);
    this.size = size;
  }

  set(frame, input) {
    const idx = frame % this.size;
    this.buf[idx] = { ...input };
    this.frames[idx] = frame;
  }

  get(frame) {
    const idx = frame % this.size;
    if (this.frames[idx] !== frame) return null;
    return this.buf[idx];
  }

  /** Return the most recent confirmed input before `frame`, for prediction. */
  getLastConfirmed(frame) {
    for (let f = frame - 1; f >= Math.max(0, frame - this.size); f--) {
      const inp = this.get(f);
      if (inp) return { ...inp };
    }
    return createEmptyInput();
  }
}

class StateHistory {
  constructor(size = 32) {
    this.buf = new Array(size);
    this.frames = new Int32Array(size).fill(-1);
    this.size = size;
  }

  save(frame, state) {
    const idx = frame % this.size;
    this.buf[idx] = cloneState(state);
    this.frames[idx] = frame;
  }

  load(frame) {
    const idx = frame % this.size;
    if (this.frames[idx] !== frame) return null;
    return cloneState(this.buf[idx]);
  }
}

// ─── Rollback Manager ───────────────────────────────────────

export class RollbackManager {
  constructor() {
    this.localInputs = new InputHistory();
    this.remoteInputs = new InputHistory();
    this.states = new StateHistory();

    // What remote input we actually used when simulating each frame.
    // If it was predicted, we store a copy; if confirmed from the start, null.
    this.predictedRemote = new Map();

    this.currentFrame = 0;
    this.lastConfirmedFrame = -1;

    // Earliest frame that needs rollback correction (null = no rollback pending)
    this._rollbackTarget = null;

    this.stats = { rollbacks: 0, maxDepth: 0 };
  }

  /** Reset for a new match. */
  reset(initialState) {
    this.localInputs = new InputHistory();
    this.remoteInputs = new InputHistory();
    this.states = new StateHistory();
    this.predictedRemote = new Map();
    this.currentFrame = 0;
    this.lastConfirmedFrame = -1;
    this._rollbackTarget = null;
    this.stats = { rollbacks: 0, maxDepth: 0 };

    // Seed the first INPUT_DELAY frames with empty inputs
    const empty = createEmptyInput();
    for (let f = 0; f < C.ROLLBACK_INPUT_DELAY; f++) {
      this.localInputs.set(f, empty);
      this.remoteInputs.set(f, empty);
    }

    this.states.save(0, initialState);
  }

  // ── Receive inputs from network ──

  /**
   * Process an incoming redundant-input message from the remote peer.
   * Message shape: { type:'input', startFrame: N, inputs: [newest … oldest] }
   */
  receiveInputs(msg) {
    const inputs = msg.inputs;
    for (let i = 0; i < inputs.length; i++) {
      const frame = msg.startFrame - i;
      if (frame < 0) continue;

      // Only store if we don't already have confirmed input for this frame
      if (this.remoteInputs.get(frame)) continue;

      this.remoteInputs.set(frame, inputs[i]);

      // Update confirmed-frame watermark
      if (frame > this.lastConfirmedFrame) {
        this.lastConfirmedFrame = frame;
      }

      // Check if we simulated this frame with a wrong prediction
      if (frame < this.currentFrame) {
        const predicted = this.predictedRemote.get(frame);
        if (predicted && !inputsEqual(predicted, inputs[i])) {
          // Mark for rollback to the earliest mispredicted frame
          if (this._rollbackTarget === null || frame < this._rollbackTarget) {
            this._rollbackTarget = frame;
          }
        }
      }
    }
  }

  // ── Tick ──

  /**
   * Advance one simulation frame. Returns the new gameState, or null if we
   * can't advance yet (only during the first INPUT_DELAY frames).
   */
  tick(gameState, localRawInput, isHost, sendFn) {
    // ── 1. Store local input at delayed frame and send ──
    const sendFrame = this.currentFrame + C.ROLLBACK_INPUT_DELAY;
    this.localInputs.set(sendFrame, localRawInput);

    const redundant = [];
    for (let i = 0; i < C.ROLLBACK_INPUT_REDUNDANCY; i++) {
      const f = sendFrame - i;
      const inp = this.localInputs.get(f);
      if (inp) redundant.push(inp);
      else break;
    }
    sendFn({ type: 'input', startFrame: sendFrame, inputs: redundant });

    // ── 2. Do we have our own (delayed) input for currentFrame? ──
    const myInput = this.localInputs.get(this.currentFrame);
    if (!myInput) return null; // still in startup delay

    // ── 3. Handle pending rollback ──
    if (this._rollbackTarget !== null) {
      gameState = this._performRollback(gameState, isHost);
    }

    // ── 4. Get or predict remote input ──
    let theirInput = this.remoteInputs.get(this.currentFrame);
    let predicted = false;

    if (!theirInput) {
      theirInput = this.remoteInputs.getLastConfirmed(this.currentFrame);
      predicted = true;
    }

    if (predicted) {
      this.predictedRemote.set(this.currentFrame, { ...theirInput });
    } else {
      this.predictedRemote.delete(this.currentFrame);
    }

    // ── 5. Save state snapshot, then simulate ──
    this.states.save(this.currentFrame, gameState);

    const p1 = isHost ? myInput : theirInput;
    const p2 = isHost ? theirInput : myInput;
    gameState = simulateFrame(gameState, p1, p2);

    // ── 6. Advance ──
    this.currentFrame++;

    // Clean up old prediction records
    this._cleanupPredictions();

    return gameState;
  }

  // ── Internal: rollback + resimulate ──

  _performRollback(currentGameState, isHost) {
    let target = this._rollbackTarget;
    this._rollbackTarget = null;

    // Clamp to max rollback depth
    const depth = this.currentFrame - target;
    if (depth > C.ROLLBACK_MAX_FRAMES) {
      target = this.currentFrame - C.ROLLBACK_MAX_FRAMES;
    }

    const restored = this.states.load(target);
    if (!restored) {
      // Can't rollback that far — state was evicted. Continue with current.
      return currentGameState;
    }

    this.stats.rollbacks++;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, depth);

    // Resimulate from target to currentFrame
    let state = restored;
    for (let f = target; f < this.currentFrame; f++) {
      const myInput = this.localInputs.get(f);
      let theirInput = this.remoteInputs.get(f);

      if (!theirInput) {
        theirInput = this.remoteInputs.getLastConfirmed(f);
        this.predictedRemote.set(f, { ...theirInput });
      } else {
        this.predictedRemote.delete(f);
      }

      this.states.save(f, state);

      const p1 = isHost ? myInput : theirInput;
      const p2 = isHost ? theirInput : myInput;
      state = simulateFrame(state, p1, p2);
    }

    return state;
  }

  _cleanupPredictions() {
    // Remove prediction records older than max rollback window
    const cutoff = this.currentFrame - C.ROLLBACK_MAX_FRAMES - 1;
    for (const frame of this.predictedRemote.keys()) {
      if (frame < cutoff) this.predictedRemote.delete(frame);
    }
  }

  /** Frames of prediction ahead of last confirmed remote input. */
  get predictionDepth() {
    return Math.max(0, this.currentFrame - this.lastConfirmedFrame - 1);
  }
}
