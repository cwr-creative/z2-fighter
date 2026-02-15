/**
 * Entry point — wires together all modules and runs the game loop.
 */
import * as C from './constants.js';
import { createGameState } from './state.js';
import { simulateFrame } from './simulation.js';
import { InputManager } from './input.js';
import { render } from './renderer.js';
import { NetworkManager } from './network.js';
import { UIManager } from './ui.js';
import { RollbackManager } from './rollback.js';

// ─── Globals ─────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const inputManager = new InputManager();
const networkManager = new NetworkManager();
const ui = new UIManager();
const rollbackManager = new RollbackManager();

let gameState = null;
let isOnline = false;
let isHost = false;
let running = false;
let showingGame = false; // true while we should keep rendering the game state

// Fixed-timestep accumulator
let lastTime = 0;
let accumulator = 0;

// Stored weapon selections for rematches
let lastP1Weapons = null;
let lastP2Weapons = null;

// ─── Online State ────────────────────────────────────────────

let localWeapons = null;   // this player's weapon picks
let remoteWeapons = null;  // peer's weapon picks
let localReady = false;    // local player clicked "Ready!"
let remoteReady = false;   // peer signaled ready to fight

/** Handle all incoming messages from the remote peer. */
function handleRemoteMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'weapons':
      remoteWeapons = msg.weapons;
      checkWeaponsReady();
      break;

    case 'ready':
      remoteReady = true;
      checkStartReady();
      break;

    case 'input':
      // Route to rollback manager for redundant-input handling
      rollbackManager.receiveInputs(msg);
      break;

    case 'rematch':
      if (lastP1Weapons && lastP2Weapons) {
        ui.hideAll();
        startCombat(lastP1Weapons, lastP2Weapons);
      }
      break;

    case 'reselect':
      goToWeaponSelect();
      break;
  }
}

/** Once both players have sent weapons, proceed to keybinds. */
function checkWeaponsReady() {
  if (!localWeapons || !remoteWeapons) return;

  // Host = P1, Guest = P2
  if (isHost) {
    lastP1Weapons = localWeapons;
    lastP2Weapons = remoteWeapons;
  } else {
    lastP1Weapons = remoteWeapons;
    lastP2Weapons = localWeapons;
  }

  goToKeybinds();
}

/** Once BOTH players have signaled ready, start combat. */
function checkStartReady() {
  if (!localReady || !remoteReady) return;
  if (lastP1Weapons && lastP2Weapons) {
    startCombat(lastP1Weapons, lastP2Weapons);
  }
}

// ─── Flow ────────────────────────────────────────────────────

function goToTitle() {
  running = false;
  showingGame = false;
  isOnline = false;
  localWeapons = null;
  remoteWeapons = null;
  localReady = false;
  remoteReady = false;
  networkManager.close();
  ui.setupTitle(
    () => goToWeaponSelect(),
    () => goToOnlineSetup()
  );
}

function goToOnlineSetup() {
  running = false;
  isOnline = true;

  // Wire up the message handler BEFORE connection completes
  networkManager.onRemoteInput = handleRemoteMessage;

  ui.setupOnline(networkManager, (hostFlag) => {
    isHost = hostFlag;
    goToWeaponSelect();
  });
}

function goToWeaponSelect() {
  running = false;

  if (isOnline) {
    // Online: each player picks only their own 3 weapons
    localWeapons = null;
    remoteWeapons = null;

    ui.setupWeaponSelectOnline((weapons) => {
      localWeapons = weapons;
      networkManager.sendMessage({ type: 'weapons', weapons });
      // Show waiting state until peer's weapons arrive
      ui.showWaiting('Waiting for opponent to pick weapons...');
      checkWeaponsReady();
    });
  } else {
    // Local: both players pick on the same screen
    ui.setupWeaponSelect((p1w, p2w) => {
      lastP1Weapons = p1w;
      lastP2Weapons = p2w;
      goToKeybinds();
    });
  }
}

function goToKeybinds() {
  localReady = false;
  remoteReady = false;

  if (isOnline) {
    // Online: only bind the local player's keys (always slot 0)
    ui.setupKeybindsOnline(inputManager, () => {
      localReady = true;
      networkManager.sendMessage({ type: 'ready' });
      if (remoteReady) {
        startCombat(lastP1Weapons, lastP2Weapons);
      } else {
        ui.showWaiting('Waiting for opponent...');
      }
    });
  } else {
    ui.setupKeybinds(inputManager, () => {
      startCombat(lastP1Weapons, lastP2Weapons);
    });
  }
}

function startCombat(p1Weapons, p2Weapons) {
  ui.hideAll();
  gameState = createGameState(p1Weapons, p2Weapons);
  inputManager.autoAssignGamepads();

  // Initialize rollback manager for online play
  if (isOnline) {
    rollbackManager.reset(gameState);
  }

  running = true;
  showingGame = true;
  lastTime = performance.now();
  accumulator = 0;
}

// ─── Victory Handling ────────────────────────────────────────

function handlePostGame(choice) {
  showingGame = false;
  if (choice === 'rematch' && lastP1Weapons && lastP2Weapons) {
    if (isOnline) networkManager.sendMessage({ type: 'rematch' });
    startCombat(lastP1Weapons, lastP2Weapons);
  } else if (choice === 'reselect') {
    if (isOnline) networkManager.sendMessage({ type: 'reselect' });
    goToWeaponSelect();
  } else {
    goToTitle();
  }
}

// ─── Game Loop ───────────────────────────────────────────────

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  if (running && gameState) {
    const dt = Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;
    accumulator += dt;

    // Fixed-timestep simulation
    while (accumulator >= C.FRAME_TIME) {
      if (isOnline) {
        if (!tickOnline()) break;
      } else {
        tickLocal();
      }
      accumulator -= C.FRAME_TIME;

      if (gameState.winner !== -1) {
        running = false;
        // Send extra inputs so peer can finish
        if (isOnline) {
          const lastInput = inputManager.getInput(0);
          const sendFrame = rollbackManager.currentFrame + C.ROLLBACK_INPUT_DELAY;
          for (let f = 0; f < 10; f++) {
            networkManager.sendMessage({
              type: 'input',
              startFrame: sendFrame + f,
              inputs: [lastInput],
            });
          }
        }
        setTimeout(() => {
          ui.showVictory(gameState.winner, handlePostGame);
        }, 1500);
        break;
      }
    }
  }

  // Keep rendering the game state (including victory overlay) even after running stops
  if (showingGame && gameState) {
    render(ctx, gameState, isOnline ? rollbackManager : null);
  }
}

/** Local play: read both players' inputs and simulate. */
function tickLocal() {
  const p1Input = inputManager.getInput(0);
  const p2Input = inputManager.getInput(1);
  gameState = simulateFrame(gameState, p1Input, p2Input);
}

/**
 * Online play: rollback netcode — predict remote input if missing,
 * rollback and resimulate on misprediction. Never stalls.
 */
function tickOnline() {
  const localInput = inputManager.getInput(0);

  const result = rollbackManager.tick(
    gameState,
    localInput,
    isHost,
    (msg) => networkManager.sendMessage(msg)
  );

  if (result === null) {
    return false; // still in input-delay startup
  }

  gameState = result;
  return true;
}

// ─── Restart via Enter key during victory ────────────────────

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && gameState && gameState.winner !== -1 && !running) {
    handlePostGame('rematch');
  }
});

// ─── Boot ────────────────────────────────────────────────────

goToTitle();
requestAnimationFrame(gameLoop);
