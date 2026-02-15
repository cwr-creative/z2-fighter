/**
 * UI manager — handles HTML overlay screens (title, weapon select,
 * keybinding, online setup, victory).
 */
import * as C from './constants.js';

// Friendly key names for display
const KEY_NAMES = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F',
  KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  KeyM: 'M', KeyN: 'N', KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R',
  KeyS: 'S', KeyT: 'T', KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X',
  KeyY: 'Y', KeyZ: 'Z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  ArrowLeft: '\u2190', ArrowRight: '\u2192', ArrowUp: '\u2191', ArrowDown: '\u2193',
  Space: 'Space', Enter: 'Enter', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3',
  Numpad4: 'Num4', Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7',
  Numpad8: 'Num8', Numpad9: 'Num9',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
  Backquote: '`', Tab: 'Tab',
};

function keyName(code) {
  return KEY_NAMES[code] || code;
}

export class UIManager {
  constructor() {
    this.screens = {};
    const ids = ['titleScreen', 'onlineSetup', 'weaponSelect', 'keybindScreen', 'victoryScreen'];
    for (const id of ids) {
      this.screens[id] = document.getElementById(id);
    }
  }

  showScreen(id) {
    for (const key in this.screens) {
      this.screens[key].classList.toggle('hidden', key !== id);
    }
  }

  hideAll() {
    for (const key in this.screens) {
      this.screens[key].classList.add('hidden');
    }
  }

  // ─── Title Screen ──────────────────────────────────────────

  setupTitle(onLocal, onOnline) {
    document.getElementById('localPlayBtn').onclick = onLocal;
    document.getElementById('onlinePlayBtn').onclick = onOnline;
    this.showScreen('titleScreen');
  }

  // ─── Online Setup ──────────────────────────────────────────

  setupOnline(networkManager, onReady) {
    this.showScreen('onlineSetup');
    const container = this.screens.onlineSetup;
    container.innerHTML = `
      <h2>Online Setup</h2>
      <div class="online-panel">
        <div class="online-section">
          <h3>Host a Game</h3>
          <button id="createOfferBtn" class="btn">Create Offer</button>
          <textarea id="offerText" readonly placeholder="Offer code will appear here..."></textarea>
          <button id="copyOfferBtn" class="btn btn-small" style="display:none">Copy</button>
          <h4>Paste guest's answer:</h4>
          <textarea id="answerInput" placeholder="Paste answer code here..."></textarea>
          <button id="acceptAnswerBtn" class="btn">Accept Answer</button>
        </div>
        <div class="divider">OR</div>
        <div class="online-section">
          <h3>Join a Game</h3>
          <textarea id="offerInput" placeholder="Paste host's offer code here..."></textarea>
          <button id="joinBtn" class="btn">Join</button>
          <textarea id="answerText" readonly placeholder="Answer code will appear here..."></textarea>
          <button id="copyAnswerBtn" class="btn btn-small" style="display:none">Copy</button>
        </div>
      </div>
      <p id="onlineStatus" class="status">Not connected</p>
      <button id="onlineBackBtn" class="btn btn-secondary">Back</button>
    `;

    const statusEl = document.getElementById('onlineStatus');

    document.getElementById('createOfferBtn').onclick = async () => {
      statusEl.textContent = 'Creating offer...';
      const offer = await networkManager.createOffer();
      document.getElementById('offerText').value = offer;
      document.getElementById('copyOfferBtn').style.display = '';
      statusEl.textContent = 'Offer created. Share it and wait for answer.';
    };

    document.getElementById('copyOfferBtn').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('offerText').value);
    };

    document.getElementById('acceptAnswerBtn').onclick = async () => {
      const answerB64 = document.getElementById('answerInput').value.trim();
      if (!answerB64) return;
      statusEl.textContent = 'Accepting answer...';
      await networkManager.acceptAnswer(answerB64);
      statusEl.textContent = 'Connecting...';
    };

    document.getElementById('joinBtn').onclick = async () => {
      const offerB64 = document.getElementById('offerInput').value.trim();
      if (!offerB64) return;
      statusEl.textContent = 'Creating answer...';
      const answer = await networkManager.acceptOffer(offerB64);
      document.getElementById('answerText').value = answer;
      document.getElementById('copyAnswerBtn').style.display = '';
      statusEl.textContent = 'Answer created. Share it with the host.';
    };

    document.getElementById('copyAnswerBtn').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('answerText').value);
    };

    networkManager.onConnectionChange = (connected) => {
      if (connected) {
        statusEl.textContent = 'Connected!';
        statusEl.classList.add('connected');
        setTimeout(() => onReady(networkManager.isHost), 500);
      } else {
        statusEl.textContent = 'Disconnected';
        statusEl.classList.remove('connected');
      }
    };

    document.getElementById('onlineBackBtn').onclick = () => {
      networkManager.close();
      this.showScreen('titleScreen');
    };
  }

  // ─── Weapon Select ─────────────────────────────────────────

  setupWeaponSelect(onDone) {
    this.showScreen('weaponSelect');
    const container = this.screens.weaponSelect;

    const selections = [[], []];

    const renderUI = () => {
      container.innerHTML = `
        <h2>Select Weapons</h2>
        <p class="subtitle">Each player picks 3 weapons. Duplicates allowed.</p>
        <div class="weapon-grid">
          ${C.WEAPON_LIST.map(id => {
            const w = C.WEAPON_DEFS[id];
            return `
              <div class="weapon-card" data-weapon="${id}">
                <div class="weapon-name">${w.name}</div>
                <div class="weapon-type">${w.type}</div>
                <div class="weapon-desc">${w.description}</div>
                <div class="weapon-actions">
                  <button class="btn btn-small weapon-add" data-player="0" data-weapon="${id}"
                    ${selections[0].length >= 3 ? 'disabled' : ''}>+ P1</button>
                  <button class="btn btn-small weapon-add" data-player="1" data-weapon="${id}"
                    ${selections[1].length >= 3 ? 'disabled' : ''}>+ P2</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="selection-display">
          ${[0, 1].map(pi => `
            <div class="player-selection">
              <h3>Player ${pi + 1}</h3>
              <div class="slots">
                ${[0, 1, 2].map(si => {
                  const wId = selections[pi][si];
                  const name = wId ? C.WEAPON_DEFS[wId].name : '(empty)';
                  return `<span class="slot ${wId ? 'filled' : ''}"
                    data-player="${pi}" data-slot="${si}">${name}</span>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <button id="weaponDoneBtn" class="btn btn-primary"
          ${(selections[0].length < 3 || selections[1].length < 3) ? 'disabled' : ''}>
          Continue to Keybinds
        </button>
      `;

      // Bind add buttons
      container.querySelectorAll('.weapon-add').forEach(btn => {
        btn.onclick = () => {
          const pi = parseInt(btn.dataset.player);
          const wId = btn.dataset.weapon;
          if (selections[pi].length < 3) {
            selections[pi].push(wId);
            renderUI();
          }
        };
      });

      // Bind slot click to remove
      container.querySelectorAll('.slot.filled').forEach(el => {
        el.onclick = () => {
          const pi = parseInt(el.dataset.player);
          const si = parseInt(el.dataset.slot);
          selections[pi].splice(si, 1);
          renderUI();
        };
      });

      // Done button
      const doneBtn = document.getElementById('weaponDoneBtn');
      if (doneBtn) {
        doneBtn.onclick = () => {
          if (selections[0].length === 3 && selections[1].length === 3) {
            onDone([...selections[0]], [...selections[1]]);
          }
        };
      }
    };

    renderUI();
  }

  // ─── Keybind Screen ────────────────────────────────────────

  setupKeybinds(inputManager, onDone) {
    this.showScreen('keybindScreen');
    const container = this.screens.keybindScreen;
    const actions = ['left', 'right', 'crouch', 'weapon1', 'weapon2', 'weapon3'];
    const actionLabels = {
      left: 'Move Left', right: 'Move Right', crouch: 'Crouch',
      weapon1: 'Weapon 1', weapon2: 'Weapon 2', weapon3: 'Weapon 3',
    };

    let rebinding = null; // { player, action } or null

    const renderUI = () => {
      container.innerHTML = `
        <h2>Keybindings</h2>
        <p class="subtitle">Click a key to rebind. Gamepads auto-mapped.</p>
        <div class="keybind-table">
          <div class="keybind-header">
            <span>P1 Key</span><span>Action</span><span>P2 Key</span>
          </div>
          ${actions.map(action => {
            const b0 = inputManager.getBinds(0);
            const b1 = inputManager.getBinds(1);
            const isRebinding0 = rebinding && rebinding.player === 0 && rebinding.action === action;
            const isRebinding1 = rebinding && rebinding.player === 1 && rebinding.action === action;
            return `
              <div class="keybind-row">
                <button class="keybind-btn ${isRebinding0 ? 'rebinding' : ''}"
                  data-player="0" data-action="${action}">
                  ${isRebinding0 ? '...' : keyName(b0[action])}
                </button>
                <span class="action-label">${actionLabels[action]}</span>
                <button class="keybind-btn ${isRebinding1 ? 'rebinding' : ''}"
                  data-player="1" data-action="${action}">
                  ${isRebinding1 ? '...' : keyName(b1[action])}
                </button>
              </div>
            `;
          }).join('')}
        </div>
        <button id="resetBindsBtn" class="btn btn-secondary">Reset to Defaults</button>
        <button id="keybindDoneBtn" class="btn btn-primary">Start Fight!</button>
      `;

      container.querySelectorAll('.keybind-btn').forEach(btn => {
        btn.onclick = async () => {
          if (rebinding) return;
          const pi = parseInt(btn.dataset.player);
          const action = btn.dataset.action;
          rebinding = { player: pi, action };
          renderUI();

          const code = await inputManager.waitForKey();
          inputManager.rebind(pi, action, code);
          rebinding = null;
          renderUI();
        };
      });

      document.getElementById('resetBindsBtn').onclick = () => {
        for (const action of actions) {
          inputManager.rebind(0, action, C.DEFAULT_BINDS[0][action]);
          inputManager.rebind(1, action, C.DEFAULT_BINDS[1][action]);
        }
        renderUI();
      };

      document.getElementById('keybindDoneBtn').onclick = onDone;
    };

    renderUI();
  }

  // ─── Weapon Select (Online) ─────────────────────────────────

  setupWeaponSelectOnline(onDone) {
    this.showScreen('weaponSelect');
    const container = this.screens.weaponSelect;
    const selection = [];

    const renderUI = () => {
      container.innerHTML = `
        <h2>Select Your Weapons</h2>
        <p class="subtitle">Pick 3 weapons for yourself. Duplicates allowed.</p>
        <div class="weapon-grid">
          ${C.WEAPON_LIST.map(id => {
            const w = C.WEAPON_DEFS[id];
            return `
              <div class="weapon-card" data-weapon="${id}">
                <div class="weapon-name">${w.name}</div>
                <div class="weapon-type">${w.type}</div>
                <div class="weapon-desc">${w.description}</div>
                <div class="weapon-actions">
                  <button class="btn btn-small weapon-add" data-weapon="${id}"
                    ${selection.length >= 3 ? 'disabled' : ''}>+ Add</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="selection-display">
          <div class="player-selection">
            <h3>Your Weapons</h3>
            <div class="slots">
              ${[0, 1, 2].map(si => {
                const wId = selection[si];
                const name = wId ? C.WEAPON_DEFS[wId].name : '(empty)';
                return `<span class="slot ${wId ? 'filled' : ''}"
                  data-slot="${si}">${name}</span>`;
              }).join('')}
            </div>
          </div>
        </div>
        <button id="weaponDoneBtn" class="btn btn-primary"
          ${selection.length < 3 ? 'disabled' : ''}>
          Confirm Weapons
        </button>
      `;

      container.querySelectorAll('.weapon-add').forEach(btn => {
        btn.onclick = () => {
          const wId = btn.dataset.weapon;
          if (selection.length < 3) {
            selection.push(wId);
            renderUI();
          }
        };
      });

      container.querySelectorAll('.slot.filled').forEach(el => {
        el.onclick = () => {
          const si = parseInt(el.dataset.slot);
          selection.splice(si, 1);
          renderUI();
        };
      });

      const doneBtn = document.getElementById('weaponDoneBtn');
      if (doneBtn) {
        doneBtn.onclick = () => {
          if (selection.length === 3) {
            onDone([...selection]);
          }
        };
      }
    };

    renderUI();
  }

  // ─── Keybinds (Online) ────────────────────────────────────

  setupKeybindsOnline(inputManager, onDone) {
    this.showScreen('keybindScreen');
    const container = this.screens.keybindScreen;
    const actions = ['left', 'right', 'crouch', 'weapon1', 'weapon2', 'weapon3'];
    const actionLabels = {
      left: 'Move Left', right: 'Move Right', crouch: 'Crouch',
      weapon1: 'Weapon 1', weapon2: 'Weapon 2', weapon3: 'Weapon 3',
    };

    let rebinding = null;

    const renderUI = () => {
      const binds = inputManager.getBinds(0);
      container.innerHTML = `
        <h2>Your Keybindings</h2>
        <p class="subtitle">Click a key to rebind. Gamepads auto-mapped.</p>
        <div class="keybind-table" style="width:260px">
          <div class="keybind-header">
            <span>Action</span><span>Key</span>
          </div>
          ${actions.map(action => {
            const isReb = rebinding && rebinding.action === action;
            return `
              <div class="keybind-row">
                <span class="action-label">${actionLabels[action]}</span>
                <button class="keybind-btn ${isReb ? 'rebinding' : ''}"
                  data-action="${action}">
                  ${isReb ? '...' : keyName(binds[action])}
                </button>
              </div>
            `;
          }).join('')}
        </div>
        <button id="resetBindsBtn" class="btn btn-secondary">Reset to Defaults</button>
        <button id="keybindDoneBtn" class="btn btn-primary">Ready!</button>
      `;

      container.querySelectorAll('.keybind-btn').forEach(btn => {
        btn.onclick = async () => {
          if (rebinding) return;
          const action = btn.dataset.action;
          rebinding = { action };
          renderUI();

          const code = await inputManager.waitForKey();
          inputManager.rebind(0, action, code);
          rebinding = null;
          renderUI();
        };
      });

      document.getElementById('resetBindsBtn').onclick = () => {
        for (const action of actions) {
          inputManager.rebind(0, action, C.DEFAULT_BINDS[0][action]);
        }
        renderUI();
      };

      document.getElementById('keybindDoneBtn').onclick = onDone;
    };

    renderUI();
  }

  // ─── Waiting Screen ───────────────────────────────────────

  showWaiting(message) {
    this.showScreen('weaponSelect');
    const container = this.screens.weaponSelect;
    container.innerHTML = `
      <h2>${message}</h2>
      <div class="waiting-spinner"></div>
    `;
  }

  // ─── Victory Screen ────────────────────────────────────────

  showVictory(winner, onChoice) {
    this.showScreen('victoryScreen');
    const container = this.screens.victoryScreen;
    const text = winner === 2 ? 'DRAW!' : `Player ${winner + 1} Wins!`;
    container.innerHTML = `
      <h2>${text}</h2>
      <button id="playAgainBtn" class="btn btn-primary">Play Again</button>
      <button id="reselectBtn" class="btn btn-secondary">Reselect Weapons</button>
      <button id="backToTitleBtn" class="btn btn-secondary">Back to Title</button>
    `;
    document.getElementById('playAgainBtn').onclick = () => onChoice('rematch');
    document.getElementById('reselectBtn').onclick = () => onChoice('reselect');
    document.getElementById('backToTitleBtn').onclick = () => onChoice('title');
  }
}
