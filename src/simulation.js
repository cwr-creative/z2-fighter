/**
 * Pure, deterministic game simulation.
 * Takes a state + two input snapshots, returns the next state.
 * No side effects — suitable for rollback netcode.
 */
import * as C from './constants.js';
import { cloneState } from './state.js';

// ─── Public API ──────────────────────────────────────────────

export function simulateFrame(state, p1Input, p2Input) {
  const s = cloneState(state);
  const inputs = [p1Input, p2Input];

  if (s.winner !== -1) return s;

  // Hitstop — freeze gameplay but still advance frame counter
  if (s.hitstop > 0) {
    s.hitstop--;
    s.frame++;
    return s;
  }

  for (let i = 0; i < 2; i++) updatePlayer(s, i, inputs[i]);
  resolvePlayerCollision(s);
  updateProjectiles(s);
  checkMeleeHits(s);
  checkProjectileHits(s);
  checkWin(s);

  s.projectiles = s.projectiles.filter(p => p.active);
  s.prevInputs = [{ ...p1Input }, { ...p2Input }];
  s.frame++;
  return s;
}

// ─── Player Update ───────────────────────────────────────────

function updatePlayer(state, idx, input) {
  const p = state.players[idx];

  // Tick state timer
  if (p.stateTimer > 0) {
    p.stateTimer--;
    if (p.stateTimer === 0 && (p.state === 'attacking' || p.state === 'hitstun' || p.state === 'blockstun')) {
      p.state = 'idle';
      p.activeWeapon = null;
      p.attackSpawned = false;
    }
  }

  const canAct = (p.state === 'idle' || p.state === 'attacking');

  // Movement — allowed when idle or attacking (not during hitstun/blockstun)
  if (canAct) {
    // Stance — only changeable when idle (locked during attack)
    if (p.state === 'idle') {
      p.stance = input.crouch ? 'crouching' : 'standing';
    }

    let dx = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    if (dx !== 0) {
      // Facing — only changeable when idle (committed during attack)
      if (p.state === 'idle') {
        p.facing = dx;
      }
      if (p.stance === 'standing') {
        p.x += dx * C.MOVE_SPEED;
        p.x = Math.max(C.ARENA_LEFT, Math.min(C.ARENA_RIGHT - C.PLAYER_WIDTH, p.x));
      }
    }
  }

  // Attacks — only when idle, on rising edge (press, not hold)
  if (p.state === 'idle') {
    const prev = state.prevInputs[idx];
    for (let w = 0; w < 3; w++) {
      const key = `weapon${w + 1}`;
      if (input[key] && !prev[key]) {
        tryAttack(state, idx, p.weapons[w]);
        break;
      }
    }
  }

  // Spawn projectile at the right moment in the attack animation
  if (p.state === 'attacking' && !p.attackSpawned && p.activeWeapon) {
    const wDef = C.WEAPON_DEFS[p.activeWeapon];
    if (wDef && wDef.type === 'projectile') {
      const elapsed = wDef.attackFrames - p.stateTimer;
      if (elapsed >= wDef.projectileSpawnFrame) {
        spawnProjectile(state, idx);
        p.attackSpawned = true;
      }
    }
  }
}

// ─── Player Collision ────────────────────────────────────────

function resolvePlayerCollision(state) {
  const a = state.players[0];
  const b = state.players[1];

  const aRight = a.x + C.PLAYER_WIDTH;
  const bRight = b.x + C.PLAYER_WIDTH;

  // No overlap — nothing to do
  if (aRight <= b.x || bRight <= a.x) return;

  // Push apart equally from center of overlap
  const overlap = Math.min(aRight - b.x, bRight - a.x);
  const half = Math.ceil(overlap / 2);

  if (a.x < b.x || (a.x === b.x && a.facing === -1)) {
    a.x -= half;
    b.x += (overlap - half);
  } else {
    b.x -= half;
    a.x += (overlap - half);
  }

  // Clamp to arena — if one is against a wall, the other absorbs all push
  for (const p of [a, b]) {
    if (p.x < C.ARENA_LEFT) {
      const correction = C.ARENA_LEFT - p.x;
      p.x = C.ARENA_LEFT;
      const other = (p === a) ? b : a;
      other.x += correction;
    }
    if (p.x > C.ARENA_RIGHT - C.PLAYER_WIDTH) {
      const correction = p.x - (C.ARENA_RIGHT - C.PLAYER_WIDTH);
      p.x = C.ARENA_RIGHT - C.PLAYER_WIDTH;
      const other = (p === a) ? b : a;
      other.x -= correction;
    }
  }

  // Final clamp for safety
  a.x = Math.max(C.ARENA_LEFT, Math.min(C.ARENA_RIGHT - C.PLAYER_WIDTH, a.x));
  b.x = Math.max(C.ARENA_LEFT, Math.min(C.ARENA_RIGHT - C.PLAYER_WIDTH, b.x));
}

function tryAttack(state, idx, weaponId) {
  const p = state.players[idx];
  const wDef = C.WEAPON_DEFS[weaponId];
  if (!wDef) return;

  // Ammo check for boomerangs
  if (wDef.subtype === 'boomerang' && p.boomerangsHeld <= 0) return;

  p.state = 'attacking';
  p.stateTimer = wDef.attackFrames;
  p.activeWeapon = weaponId;
  p.attackStance = p.stance;
  p.attackSpawned = false;
}

// ─── Projectile Spawning ─────────────────────────────────────

function spawnProjectile(state, idx) {
  const p = state.players[idx];
  const wDef = C.WEAPON_DEFS[p.activeWeapon];
  const spawnX = p.x + (p.facing === 1 ? C.PLAYER_WIDTH : 0);

  if (wDef.subtype === 'boomerang') {
    if (p.boomerangsHeld <= 0) return;
    p.boomerangsHeld--;

    let path;
    if (p.attackStance === 'crouching') {
      path = (p.crouchThrowCount % 2 === 0) ? 1 : 2;
      p.crouchThrowCount++;
    } else {
      path = (p.standThrowCount % 2 === 0) ? 3 : 4;
      p.standThrowCount++;
    }

    state.projectiles.push({
      type: 'boomerang',
      owner: idx,
      x: spawnX,
      y: boomerangStartY(path),
      direction: p.facing,
      speed: wDef.speed,
      damage: wDef.damage,
      flightPath: path,
      phase: 'outbound',
      distanceTraveled: 0,
      height: boomerangOutboundHeight(path),
      active: true,
    });
  } else if (wDef.subtype === 'knife') {
    const isLow = p.attackStance === 'crouching';
    state.projectiles.push({
      type: 'knife',
      owner: idx,
      x: spawnX,
      y: isLow ? C.ANKLE_Y : C.HEAD_Y,
      direction: p.facing,
      speed: wDef.speed,
      damage: wDef.damage,
      height: isLow ? 'ankle' : 'head',
      active: true,
    });
  }
}

function boomerangStartY(path) {
  return (path <= 2) ? C.ANKLE_Y : C.HEAD_Y;
}

function boomerangOutboundHeight(path) {
  // Paths 1 & 4 arc out of play (no collision on outbound)
  if (path === 1 || path === 4) return 'none';
  return (path === 2) ? 'ankle' : 'head';
}

function boomerangReturnHeight(path) {
  // 1→ankle, 2→head, 3→ankle, 4→head
  return (path === 1 || path === 3) ? 'ankle' : 'head';
}

function boomerangReturnY(path) {
  const h = boomerangReturnHeight(path);
  return h === 'ankle' ? C.ANKLE_Y : C.HEAD_Y;
}

// ─── Projectile Update ───────────────────────────────────────

function updateProjectiles(state) {
  for (const proj of state.projectiles) {
    if (!proj.active) continue;

    if (proj.type === 'knife') {
      proj.x += proj.direction * proj.speed;
      if (proj.x < -50 || proj.x > C.CANVAS_WIDTH + 50) proj.active = false;
    } else if (proj.type === 'boomerang') {
      updateBoomerang(state, proj);
    }
  }
}

function updateBoomerang(state, proj) {
  proj.x += proj.direction * proj.speed;
  proj.distanceTraveled += proj.speed;

  if (proj.phase === 'outbound') {
    // Visual y for arcing paths
    const t = proj.distanceTraveled / C.BOOMERANG_RANGE;
    if (proj.flightPath === 1) {
      proj.y = C.ANKLE_Y + C.BOOMERANG_ARC_AMPLITUDE * Math.sin(Math.PI * t);
      proj.height = 'none';
    } else if (proj.flightPath === 4) {
      proj.y = C.HEAD_Y - C.BOOMERANG_ARC_AMPLITUDE * Math.sin(Math.PI * t);
      proj.height = 'none';
    }
    // Paths 2 & 3 keep their initial y and height (set at spawn)

    if (proj.distanceTraveled >= C.BOOMERANG_RANGE) {
      proj.phase = 'returning';
      proj.direction *= -1;
      proj.distanceTraveled = 0;
      proj.height = boomerangReturnHeight(proj.flightPath);
      proj.y = boomerangReturnY(proj.flightPath);
    }
  } else {
    // Returning — fixed y/height (set when phase switched)
    // Check catch by owner
    const owner = state.players[proj.owner];
    const ownerCX = owner.x + C.PLAYER_WIDTH / 2;
    if (Math.abs(proj.x - ownerCX) < 28) {
      proj.active = false;
      owner.boomerangsHeld = Math.min(owner.boomerangsHeld + 1, C.BOOMERANG_MAX);
      return;
    }

    if (proj.x < -50 || proj.x > C.CANVAS_WIDTH + 50) {
      proj.active = false;
    }
  }
}

// ─── Hit Detection ───────────────────────────────────────────

function checkMeleeHits(state) {
  for (let i = 0; i < 2; i++) {
    const atk = state.players[i];
    if (atk.state !== 'attacking') continue;

    const wDef = C.WEAPON_DEFS[atk.activeWeapon];
    if (!wDef || wDef.type !== 'melee') continue;

    const elapsed = wDef.attackFrames - atk.stateTimer;
    // Only register hit on first active frame (prevents multi-hit)
    if (elapsed !== wDef.activeStart) continue;

    const def = state.players[1 - i];
    if (def.state === 'hitstun') continue; // can't hit during hitstun

    // Range check — attack extends from attacker's front edge
    const atkEdge = atk.x + (atk.facing === 1 ? C.PLAYER_WIDTH : 0);
    const defNear = atk.facing === 1 ? def.x : def.x + C.PLAYER_WIDTH;
    const dist = (defNear - atkEdge) * atk.facing;

    if (dist < -C.PLAYER_WIDTH || dist > wDef.range) continue;

    const attackHeight = atk.attackStance === 'standing' ? 'high' : 'low';
    resolveHit(state, i, 1 - i, attackHeight, wDef.damage);
  }
}

function checkProjectileHits(state) {
  for (const proj of state.projectiles) {
    if (!proj.active || proj.height === 'none') continue;

    for (let i = 0; i < 2; i++) {
      if (i === proj.owner) continue;

      const def = state.players[i];
      if (def.state === 'hitstun') continue;

      // X overlap
      if (proj.x < def.x || proj.x > def.x + C.PLAYER_WIDTH) continue;

      if (proj.height === 'head') {
        // Head-level: passes over crouching players entirely
        if (def.stance === 'crouching') continue;

        // Standing player — check shield
        if (isFacingProjectile(def, proj)) {
          // Blocked (standing shield = high, blocks head-level)
          proj.active = false;
          def.state = 'blockstun';
          def.stateTimer = C.BLOCKSTUN_FRAMES;
          state.hitstop = C.HITSTOP_BLOCK;
        } else {
          proj.active = false;
          applyDamage(state, i, proj.damage);
        }
      } else if (proj.height === 'ankle') {
        if (def.stance === 'standing') {
          // Standing shield is high — can't block ankle
          proj.active = false;
          applyDamage(state, i, proj.damage);
        } else {
          // Crouching — check shield (low shield blocks ankle)
          if (isFacingProjectile(def, proj)) {
            proj.active = false;
            def.state = 'blockstun';
            def.stateTimer = C.BLOCKSTUN_FRAMES;
            state.hitstop = C.HITSTOP_BLOCK;
          } else {
            proj.active = false;
            applyDamage(state, i, proj.damage);
          }
        }
      }
      break; // projectile can only hit one player
    }
  }
}

/**
 * Resolve a melee hit — checks blocking rules.
 * attackHeight: 'high' | 'low'
 */
function resolveHit(state, atkIdx, defIdx, attackHeight, damage) {
  const atk = state.players[atkIdx];
  const def = state.players[defIdx];

  // Is defender facing the attacker?
  const defCX = def.x + C.PLAYER_WIDTH / 2;
  const atkCX = atk.x + C.PLAYER_WIDTH / 2;
  const facingAttacker =
    (def.facing === 1 && atkCX > defCX) ||
    (def.facing === -1 && atkCX < defCX);

  // Shield blocks if facing attacker AND shield height matches attack height
  const shieldHigh = def.stance === 'standing';
  const blocked = facingAttacker && (
    (attackHeight === 'high' && shieldHigh) ||
    (attackHeight === 'low' && !shieldHigh)
  );

  if (blocked) {
    def.state = 'blockstun';
    def.stateTimer = C.BLOCKSTUN_FRAMES;
    state.hitstop = C.HITSTOP_BLOCK;
  } else {
    applyDamage(state, defIdx, damage);
  }
}

function isFacingProjectile(defender, proj) {
  // Defender faces against the projectile's travel direction to block it
  return defender.facing === -proj.direction;
}

function applyDamage(state, playerIdx, damage) {
  const p = state.players[playerIdx];
  p.hp = Math.max(0, p.hp - damage);
  p.state = 'hitstun';
  p.stateTimer = C.HITSTUN_FRAMES;
  state.hitstop = C.HITSTOP_HIT;
}

function checkWin(state) {
  const p1Dead = state.players[0].hp <= 0;
  const p2Dead = state.players[1].hp <= 0;
  if (p1Dead && p2Dead) state.winner = 2;
  else if (p1Dead) state.winner = 1;
  else if (p2Dead) state.winner = 0;
}
