/**
 * Input manager — captures keyboard and gamepad state, maps to game inputs.
 * Keybinds are per-player and rebindable at runtime.
 */
import * as C from './constants.js';
import { createEmptyInput } from './state.js';

export class InputManager {
  constructor() {
    // Per-player keybinds (keyboard code → action)
    this.binds = [
      { ...C.DEFAULT_BINDS[0] },
      { ...C.DEFAULT_BINDS[1] },
    ];

    // Raw key state (code → boolean)
    this._keys = {};

    // Gamepad indices assigned to players (-1 = none)
    this._gamepads = [-1, -1];

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    this._keys[e.code] = true;
    // Prevent browser default for game keys
    if (this._isGameKey(e.code)) e.preventDefault();
  }

  _onKeyUp(e) {
    this._keys[e.code] = false;
  }

  _isGameKey(code) {
    for (const binds of this.binds) {
      for (const action in binds) {
        if (binds[action] === code) return true;
      }
    }
    return false;
  }

  /** Set a keybind for a player. action: 'left'|'right'|'crouch'|'weapon1'|'weapon2'|'weapon3' */
  rebind(playerIdx, action, code) {
    this.binds[playerIdx][action] = code;
  }

  /** Get all binds for a player (for display/save). */
  getBinds(playerIdx) {
    return { ...this.binds[playerIdx] };
  }

  /** Assign a gamepad index to a player. */
  assignGamepad(playerIdx, gamepadIndex) {
    this._gamepads[playerIdx] = gamepadIndex;
  }

  /** Auto-detect gamepads and assign to unassigned player slots. */
  autoAssignGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let nextSlot = 0;
    for (let i = 0; i < pads.length && nextSlot < 2; i++) {
      if (pads[i] && pads[i].connected) {
        this._gamepads[nextSlot] = i;
        nextSlot++;
      }
    }
  }

  /** Poll current input for a player (keyboard + gamepad merged). */
  getInput(playerIdx) {
    const input = createEmptyInput();
    const binds = this.binds[playerIdx];

    // Keyboard
    for (const action in binds) {
      if (this._keys[binds[action]]) {
        input[action] = true;
      }
    }

    // Gamepad
    const padIdx = this._gamepads[playerIdx];
    if (padIdx >= 0) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads[padIdx];
      if (pad && pad.connected) {
        this._readGamepad(pad, input);
      }
    }

    return input;
  }

  _readGamepad(pad, input) {
    // Left stick / axes
    const axes = pad.axes;
    if (axes.length >= 2) {
      if (axes[0] < -0.5) input.left = true;
      if (axes[0] > 0.5) input.right = true;
      if (axes[1] > 0.5) input.crouch = true;
    }

    // DPad (buttons 12-15 on standard gamepad)
    if (pad.buttons.length > 15) {
      if (pad.buttons[C.GAMEPAD_DPAD.left]?.pressed) input.left = true;
      if (pad.buttons[C.GAMEPAD_DPAD.right]?.pressed) input.right = true;
      if (pad.buttons[C.GAMEPAD_DPAD.crouch]?.pressed) input.crouch = true;
    }

    // Face buttons for weapons
    if (pad.buttons[C.GAMEPAD_MAP.weapon1.index]?.pressed) input.weapon1 = true;
    if (pad.buttons[C.GAMEPAD_MAP.weapon2.index]?.pressed) input.weapon2 = true;
    if (pad.buttons[C.GAMEPAD_MAP.weapon3.index]?.pressed) input.weapon3 = true;
  }

  /** Wait for next key press, returns a Promise<code>. Used for rebinding UI. */
  waitForKey() {
    return new Promise(resolve => {
      const handler = (e) => {
        e.preventDefault();
        window.removeEventListener('keydown', handler);
        resolve(e.code);
      };
      window.addEventListener('keydown', handler);
    });
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
