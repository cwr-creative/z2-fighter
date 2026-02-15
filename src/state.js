import * as C from './constants.js';

export function createEmptyInput() {
  return {
    left: false,
    right: false,
    crouch: false,
    weapon1: false,
    weapon2: false,
    weapon3: false,
  };
}

function createPlayerState(index, weapons) {
  return {
    x: index === 0 ? 200 : 600,
    facing: index === 0 ? 1 : -1,   // 1=right, -1=left
    stance: 'standing',               // 'standing' | 'crouching'
    hp: C.MAX_HP,
    weapons,                          // [weaponId, weaponId, weaponId]
    state: 'idle',                    // 'idle' | 'attacking' | 'hitstun' | 'blockstun'
    stateTimer: 0,
    activeWeapon: null,
    attackStance: 'standing',         // stance locked at attack start
    attackSpawned: false,
    boomerangsHeld: C.BOOMERANG_MAX,
    crouchThrowCount: 0,
    standThrowCount: 0,
  };
}

export function createGameState(p1Weapons, p2Weapons) {
  return {
    frame: 0,
    players: [
      createPlayerState(0, p1Weapons),
      createPlayerState(1, p2Weapons),
    ],
    projectiles: [],
    winner: -1,     // -1=none, 0=p1 wins, 1=p2 wins, 2=draw
    hitstop: 0,
    prevInputs: [createEmptyInput(), createEmptyInput()],
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
