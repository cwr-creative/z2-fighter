// === Canvas & Arena ===
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 400;
export const GROUND_Y = 320;
export const ARENA_LEFT = 20;
export const ARENA_RIGHT = 780;

// === Player Dimensions ===
export const PLAYER_WIDTH = 48;
export const PLAYER_STAND_HEIGHT = 64;
export const PLAYER_CROUCH_HEIGHT = 40;

// === Gameplay ===
export const MOVE_SPEED = 3;
export const MAX_HP = 5;
export const TICK_RATE = 60;
export const FRAME_TIME = 1000 / TICK_RATE;
export const HITSTUN_FRAMES = 30;
export const BLOCKSTUN_FRAMES = 15;
export const HITSTOP_HIT = 6;
export const HITSTOP_BLOCK = 4;

// === Projectile Heights (y-coordinates) ===
export const HEAD_Y = GROUND_Y - PLAYER_STAND_HEIGHT + 10;   // ~266
export const ANKLE_Y = GROUND_Y - 12;                         // ~308

// === Boomerang ===
export const BOOMERANG_RANGE = 400;
export const BOOMERANG_MAX = 10;
export const BOOMERANG_ARC_AMPLITUDE = 100;

// === Weapon Definitions ===
export const WEAPON_DEFS = {
  sword: {
    id: 'sword',
    name: 'Sword',
    type: 'melee',
    range: 60,
    attackFrames: 24,
    activeStart: 7,
    activeEnd: 13,
    damage: 1,
    description: 'Moderate range, moderate speed.',
  },
  dagger: {
    id: 'dagger',
    name: 'Dagger',
    type: 'melee',
    range: 35,
    attackFrames: 14,
    activeStart: 4,
    activeEnd: 8,
    damage: 1,
    description: 'Short range, fast attacks.',
  },
  spear: {
    id: 'spear',
    name: 'Spear',
    type: 'melee',
    range: 90,
    attackFrames: 36,
    activeStart: 12,
    activeEnd: 20,
    damage: 1,
    description: 'Long range, slow attacks.',
  },
  boomerang: {
    id: 'boomerang',
    name: 'Boomerang',
    type: 'projectile',
    subtype: 'boomerang',
    attackFrames: 18,
    projectileSpawnFrame: 4,
    damage: 1,
    speed: 5,
    description: '4 flight paths, 10 ammo. Recovered on catch.',
  },
  throwingKnife: {
    id: 'throwingKnife',
    name: 'Throwing Knife',
    type: 'projectile',
    subtype: 'knife',
    attackFrames: 10,
    projectileSpawnFrame: 2,
    damage: 1,
    speed: 8,
    description: 'Fast, straight. Enemies can duck under.',
  },
};

export const WEAPON_LIST = Object.keys(WEAPON_DEFS);

// === Default Keybinds ===
export const DEFAULT_BINDS = [
  {
    left: 'KeyA',
    right: 'KeyD',
    crouch: 'KeyS',
    weapon1: 'KeyJ',
    weapon2: 'KeyK',
    weapon3: 'KeyL',
  },
  {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    crouch: 'ArrowDown',
    weapon1: 'Numpad1',
    weapon2: 'Numpad2',
    weapon3: 'Numpad3',
  },
];

// === Gamepad Mapping ===
export const GAMEPAD_MAP = {
  left: { type: 'axis', index: 0, threshold: -0.5 },
  right: { type: 'axis', index: 0, threshold: 0.5 },
  crouch: { type: 'axis', index: 1, threshold: 0.5 },
  weapon1: { type: 'button', index: 0 },
  weapon2: { type: 'button', index: 1 },
  weapon3: { type: 'button', index: 2 },
};

// DPad fallbacks (buttons 12-15 on standard gamepad)
export const GAMEPAD_DPAD = {
  left: 14,
  right: 15,
  crouch: 13,
};
