# Z2 Clone — Zelda 2 Inspired Fighting Game

A browser-based 2-player fighting game inspired by the combat mechanics of Zelda 2: The Adventure of Link.

## Quick Start

This project uses ES modules, which require a local HTTP server (browsers block `file://` module imports).

```bash
# Any of these work:
npx serve .              # Node.js
python -m http.server    # Python 3
php -S localhost:8000     # PHP
```

Then open `http://localhost:3000` (or whichever port) in your browser.

## File Layout

```
z2clone_v2/
├── index.html              Entry point
├── css/
│   └── style.css           All styling (menus + overlays)
├── src/
│   ├── main.js             App bootstrap, game loop, screen flow
│   ├── constants.js        All tuning values, weapon defs, defaults
│   ├── state.js            Game state factory + cloning
│   ├── simulation.js       Pure deterministic game tick
│   ├── input.js            Keyboard + gamepad capture, rebinding
│   ├── renderer.js         Canvas 2D drawing (placeholder art)
│   ├── network.js          WebRTC peer connection manager
│   └── ui.js               HTML overlay screens (menus, selects)
└── README.md
```

## How to Play

1. **Title screen** — choose Local Play or Online Play.
2. **Weapon select** — each player picks 3 weapons (duplicates allowed, click a slot to remove).
3. **Keybinds** — click any key cell to rebind, then press the desired key. Gamepads are auto-detected.
4. **Fight!** — first to reduce the opponent to 0 HP wins. Each player has 5 HP.

### Default Controls

| Action   | Player 1 | Player 2     |
|----------|----------|--------------|
| Left     | A        | ←            |
| Right    | D        | →            |
| Crouch   | S        | ↓            |
| Weapon 1 | J        | Numpad 1     |
| Weapon 2 | K        | Numpad 2     |
| Weapon 3 | L        | Numpad 3     |

**Gamepad:** Left stick/DPad for movement, face buttons A/B/X for weapons 1/2/3.

## Combat Mechanics

### Stance & Shield

- **Standing:** shield blocks **high** attacks from the front.
- **Crouching:** shield blocks **low** attacks from the front.
- Your **back is always exposed** — no shield protection from behind.
- Facing direction is set by your last movement direction. You cannot move while crouching, but directional input while crouching is ignored for movement (you keep your current facing).

### Melee Weapons (Sword, Dagger, Spear)

- Standing attack = **high** attack → hits crouching opponents, blocked by standing shield.
- Crouching attack = **low** attack → hits standing opponents, blocked by crouching shield.
- Attacks from behind always hit.
- Each weapon differs in range and speed (Dagger < Sword < Spear for both).

### Boomerang

- 10 ammo. Boomerangs that return to you are recovered. Blocked or damaging boomerangs are consumed.
- **4 flight paths**, alternating based on throw stance:
  - **Crouch throws** alternate paths 1 ↔ 2.
  - **Stand throws** alternate paths 3 ↔ 4.

| Path | Outbound | Return |
|------|----------|--------|
| 1 | Arcs underground (no collision) | Ankle-level |
| 2 | Ankle-level | Head-level |
| 3 | Head-level | Ankle-level |
| 4 | Arcs overhead (no collision) | Head-level |

- Head-level projectiles **pass over crouching** players entirely.
- Ankle-level projectiles hit standing players (high shield doesn't block low).

### Throwing Knife

- Travels in a straight line at head-level.
- Crouching dodges it. Standing + facing = blocked by high shield.

## Design Decisions

### Determinism & Rollback Readiness

- **Pure simulation:** `simulateFrame(state, p1Input, p2Input) → newState` is a pure function with no side effects.
- **Serializable state:** All game state is plain JS objects — `JSON.parse(JSON.stringify(state))` for cloning.
- **Fixed timestep:** 60 FPS with an accumulator loop. Rendering is decoupled from simulation.
- **Input edge detection:** Previous-frame inputs are stored in the game state, so attack-on-press works identically during resimulation.
- **No randomness:** Zero calls to `Math.random()`. All behavior is fully deterministic.

The architecture is designed so a GGPO-style rollback layer can be inserted between the input manager and the simulation loop. The `NetworkManager` provides the transport (WebRTC data channel), and the simulation can be re-run from any saved state with corrected inputs.

**Note on cross-platform float determinism:** JavaScript floats (IEEE 754 doubles) are deterministic on the same platform but may differ across CPU architectures. For production rollback netcode, consider fixed-point integer math. This prototype uses regular floats for simplicity.

### Hitstop

Brief frame-freezes on hit/block give visual weight to combat interactions. During hitstop, the simulation skips gameplay updates but still advances the frame counter.

### WebRTC

The online mode uses a manual offer/answer exchange (copy-paste). No signaling server is required. In a production version, you'd add a matchmaking server or use a signaling service.

Currently, online mode transmits inputs but does **not** implement rollback — both players must have low latency for acceptable play. The code structure supports adding rollback without architectural changes.

### Crouching Movement

Crouching locks horizontal movement (you cannot walk while crouching). Facing direction is preserved from your last movement. This creates strategic commitment — turning around requires standing up and moving.

## Future Work

- Sprite-based graphics (replace placeholder rectangles)
- GGPO-style rollback netcode layer
- Signaling server for easier online matchmaking
- Sound effects and music
- Additional weapons
- Gamepad rebinding UI
- Training mode / hitbox visualization
