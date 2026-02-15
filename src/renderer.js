/**
 * Canvas 2D renderer — draws game state with procedural stick figures.
 * Rendering is fully separated from simulation.
 */
import * as C from './constants.js';

const COLORS = {
  sky: '#87CEEB',
  ground: '#5B8C3E',
  groundDark: '#4A7532',
  p1: '#3366CC',
  p1Light: '#6699FF',
  p1Skin: '#FFCC99',
  p2: '#CC3333',
  p2Light: '#FF6666',
  p2Skin: '#FFCC99',
  shield: '#FFD700',
  shieldBlock: '#FFFFFF',
  hitstun: '#FFFFFF',
  blockstun: '#FFFF88',
  hpFull: '#44CC44',
  hpEmpty: '#333333',
  knife: '#CCCCCC',
  boomerang: '#DD8800',
  boomerangArc: 'rgba(221,136,0,0.15)',
  attackSlash: '#FFFFAA',
  weaponSteel: '#C0C0C0',
  weaponHandle: '#8B4513',
  weaponSpear: '#D2B48C',
};

export function render(ctx, state) {
  ctx.clearRect(0, 0, C.CANVAS_WIDTH, C.CANVAS_HEIGHT);

  drawArena(ctx);
  drawProjectiles(ctx, state);
  drawPlayers(ctx, state);
  drawHUD(ctx, state);
}

// ─── Arena ───────────────────────────────────────────────────

function drawArena(ctx) {
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, C.CANVAS_WIDTH, C.GROUND_Y);

  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, C.GROUND_Y, C.CANVAS_WIDTH, C.CANVAS_HEIGHT - C.GROUND_Y);

  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, C.GROUND_Y);
  ctx.lineTo(C.CANVAS_WIDTH, C.GROUND_Y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(C.ARENA_LEFT, 0);
  ctx.lineTo(C.ARENA_LEFT, C.GROUND_Y);
  ctx.moveTo(C.ARENA_RIGHT, 0);
  ctx.lineTo(C.ARENA_RIGHT, C.GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Stick Figure Body Layout ────────────────────────────────

function getBodyLayout(p) {
  const cx = p.x + C.PLAYER_WIDTH / 2;
  const footY = C.GROUND_Y;
  const crouch = p.stance === 'crouching';

  if (!crouch) {
    // Standing proportions within 48×64
    const headR = 7;
    const headY = footY - 58;
    const neckY = headY + headR + 1;
    const shoulderY = neckY + 4;
    const hipY = footY - 22;
    const kneeY = footY - 10;
    return { cx, footY, headY, headR, neckY, shoulderY, hipY, kneeY, crouch };
  } else {
    // Crouching — compressed, knees bent
    const headR = 6;
    const headY = footY - 36;
    const neckY = headY + headR + 1;
    const shoulderY = neckY + 3;
    const hipY = footY - 14;
    const kneeY = footY - 6;
    return { cx, footY, headY, headR, neckY, shoulderY, hipY, kneeY, crouch };
  }
}

// ─── Attack Phase Helpers ────────────────────────────────────

/** Returns {phase, t} where phase is 'windup'|'active'|'recovery' and t is 0..1 progress within that phase */
function getAttackPhase(p) {
  if (p.state !== 'attacking' || !p.activeWeapon) return null;
  const wDef = C.WEAPON_DEFS[p.activeWeapon];
  if (!wDef) return null;

  const elapsed = wDef.attackFrames - p.stateTimer;

  if (wDef.type === 'melee') {
    if (elapsed < wDef.activeStart) {
      return { phase: 'windup', t: elapsed / wDef.activeStart, wDef };
    } else if (elapsed <= wDef.activeEnd) {
      return { phase: 'active', t: (elapsed - wDef.activeStart) / (wDef.activeEnd - wDef.activeStart + 1), wDef };
    } else {
      return { phase: 'recovery', t: (elapsed - wDef.activeEnd) / (wDef.attackFrames - wDef.activeEnd), wDef };
    }
  } else {
    // Projectile weapons: windup before spawn, recovery after
    if (elapsed < wDef.projectileSpawnFrame) {
      return { phase: 'windup', t: elapsed / wDef.projectileSpawnFrame, wDef };
    } else if (elapsed === wDef.projectileSpawnFrame) {
      return { phase: 'active', t: 0.5, wDef };
    } else {
      return { phase: 'recovery', t: (elapsed - wDef.projectileSpawnFrame) / (wDef.attackFrames - wDef.projectileSpawnFrame), wDef };
    }
  }
}

// ─── Players ─────────────────────────────────────────────────

function drawPlayers(ctx, state) {
  for (let i = 0; i < 2; i++) {
    drawPlayer(ctx, state.players[i], i, state);
  }
}

function drawPlayer(ctx, p, idx, state) {
  const body = getBodyLayout(p);
  const baseColor = idx === 0 ? COLORS.p1 : COLORS.p2;
  const lightColor = idx === 0 ? COLORS.p1Light : COLORS.p2Light;

  // Flash during hitstun/blockstun
  let tint = null;
  if (p.state === 'hitstun' && p.stateTimer % 4 < 2) {
    tint = COLORS.hitstun;
  } else if (p.state === 'blockstun' && p.stateTimer % 4 < 2) {
    tint = COLORS.blockstun;
  }

  const lineColor = tint || baseColor;
  const skinColor = tint || COLORS.p1Skin;

  const atk = getAttackPhase(p);
  const facing = p.facing;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Legs ──
  drawLegs(ctx, body, facing, lineColor);

  // ── Torso ──
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(body.cx, body.neckY);
  ctx.lineTo(body.cx, body.hipY);
  ctx.stroke();

  // ── Arms ──
  drawArms(ctx, body, p, atk, lineColor);

  // ── Head ──
  ctx.fillStyle = skinColor;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(body.cx, body.headY, body.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes — two dots facing the right direction
  const eyeOffX = facing * 3;
  const eyeSpread = 2;
  ctx.fillStyle = tint ? lineColor : '#000';
  ctx.fillRect(body.cx + eyeOffX - eyeSpread - 1, body.headY - 2, 2, 2);
  ctx.fillRect(body.cx + eyeOffX + eyeSpread, body.headY - 2, 2, 2);

  // ── Attack slash effect (active frames only) ──
  if (atk && atk.phase === 'active' && atk.wDef.type === 'melee') {
    drawMeleeSlashEffect(ctx, p, atk, body);
  }

  // Player label
  ctx.fillStyle = lightColor;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`P${idx + 1}`, body.cx, body.headY - body.headR - 6);
}

// ─── Legs ────────────────────────────────────────────────────

function drawLegs(ctx, body, _facing, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  const legSpread = body.crouch ? 10 : 7;
  const hipX = body.cx;

  if (body.crouch) {
    // Crouching: knees bent outward
    ctx.beginPath();
    ctx.moveTo(hipX, body.hipY);
    ctx.lineTo(hipX - legSpread, body.kneeY);
    ctx.lineTo(hipX - legSpread - 3, body.footY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipX, body.hipY);
    ctx.lineTo(hipX + legSpread, body.kneeY);
    ctx.lineTo(hipX + legSpread + 3, body.footY);
    ctx.stroke();
  } else {
    // Standing: slight spread, small feet
    ctx.beginPath();
    ctx.moveTo(hipX, body.hipY);
    ctx.lineTo(hipX - legSpread, body.footY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipX, body.hipY);
    ctx.lineTo(hipX + legSpread, body.footY);
    ctx.stroke();
  }

  // Feet — small horizontal lines
  ctx.lineWidth = 2;
  const footLen = 4;
  ctx.beginPath();
  const lFootX = body.crouch ? hipX - legSpread - 3 : hipX - legSpread;
  const rFootX = body.crouch ? hipX + legSpread + 3 : hipX + legSpread;
  ctx.moveTo(lFootX - footLen * 0.3, body.footY);
  ctx.lineTo(lFootX + footLen, body.footY);
  ctx.moveTo(rFootX - footLen, body.footY);
  ctx.lineTo(rFootX + footLen * 0.3, body.footY);
  ctx.stroke();
}

// ─── Arms ────────────────────────────────────────────────────

function drawArms(ctx, body, p, atk, lineColor) {
  const facing = p.facing;
  const shoulderX = body.cx;
  const shoulderY = body.shoulderY;

  // Both arms point forward (facing direction)
  // Shield arm drawn first (behind), weapon arm drawn second (in front)
  drawShieldArm(ctx, body, p, shoulderX, shoulderY, facing, lineColor);
  drawWeaponArm(ctx, body, p, atk, shoulderX, shoulderY, facing, lineColor);
}

function drawShieldArm(ctx, body, p, sx, sy, side, lineColor) {
  // Shield arm extends forward, slightly shorter reach than weapon arm
  const elbowX = sx + side * 6;
  const elbowY = sy + 6;
  const handX = sx + side * 10;
  const handY = sy + 2;

  // Arm
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  // Shield — tall rectangle on the arm, facing forward
  const shieldW = 4;
  const shieldH = body.crouch ? 24 : 32;
  const shieldColor = p.state === 'blockstun' ? COLORS.shieldBlock : COLORS.shield;
  ctx.fillStyle = shieldColor;
  ctx.strokeStyle = '#AA8800';
  ctx.lineWidth = 1;
  ctx.fillRect(handX - shieldW / 2, handY - shieldH / 2, shieldW, shieldH);
  ctx.strokeRect(handX - shieldW / 2, handY - shieldH / 2, shieldW, shieldH);
}

function drawWeaponArm(ctx, _body, p, atk, sx, sy, side, lineColor) {
  const facing = p.facing;
  // Determine arm pose based on attack phase
  let elbowX, elbowY, handX, handY, weaponAngle;

  if (!atk) {
    // Idle — arm forward, hand near torso level
    elbowX = sx + side * 6;
    elbowY = sy + 8;
    handX = sx + side * 8;
    handY = sy + 14;
    weaponAngle = facing * 0.3; // slight forward angle
  } else if (atk.phase === 'windup') {
    // Windup — arm pulls BACK behind the body, weapon cocked
    const t = atk.t;
    // Elbow goes behind and up
    elbowX = sx - side * (4 + 10 * t);
    elbowY = sy + 4 - 6 * t;
    // Hand goes further back and up
    handX = sx - side * (8 + 14 * t);
    handY = sy - 2 - 8 * t;
    weaponAngle = -facing * (0.5 + 1.2 * t); // weapon angles back
  } else if (atk.phase === 'active') {
    // Active — arm fully extended forward
    const t = atk.t;
    elbowX = sx + side * (12 + 4 * t);
    elbowY = sy + 2;
    handX = sx + side * (18 + 8 * t);
    // Attack height: standing attacks go high, crouching attacks go low
    if (p.attackStance === 'standing') {
      handY = sy - 4 + 4 * t;
    } else {
      handY = sy + 14 + 6 * t;
    }
    weaponAngle = facing * (0.1 + 0.3 * t);
  } else {
    // Recovery — arm returning to idle
    const t = atk.t;
    elbowX = sx + side * (12 - 4 * t);
    elbowY = sy + 2 + 10 * t;
    handX = sx + side * (18 - 6 * t);
    handY = sy + 6 + 12 * t;
    weaponAngle = facing * (0.3 - 0.2 * t);
  }

  // Draw arm
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  // Draw weapon in hand
  drawWeaponInHand(ctx, p, atk, handX, handY, weaponAngle, facing);
}

// ─── Weapon Drawing ──────────────────────────────────────────

function drawWeaponInHand(ctx, p, atk, hx, hy, angle, facing) {
  // Determine which weapon to show
  let weaponId = null;
  if (atk) {
    weaponId = p.activeWeapon;
  } else {
    // Show first weapon in idle
    weaponId = p.weapons[0];
  }
  if (!weaponId) return;

  const wDef = C.WEAPON_DEFS[weaponId];
  if (!wDef) return;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);

  if (wDef.id === 'sword') {
    drawSwordWeapon(ctx, facing, wDef);
  } else if (wDef.id === 'dagger') {
    drawDaggerWeapon(ctx, facing, wDef);
  } else if (wDef.id === 'spear') {
    drawSpearWeapon(ctx, facing, wDef);
  } else if (wDef.subtype === 'boomerang') {
    drawBoomerangWeapon(ctx, facing);
  } else if (wDef.subtype === 'knife') {
    drawThrowingKnifeWeapon(ctx, facing);
  }

  ctx.restore();
}

function drawSwordWeapon(ctx, facing, wDef) {
  const dir = facing;
  const bladeLen = wDef.range;

  // Blade
  ctx.strokeStyle = COLORS.weaponSteel;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(dir * bladeLen, -1);
  ctx.stroke();

  // Crossguard
  ctx.strokeStyle = COLORS.weaponHandle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dir * 1, -4);
  ctx.lineTo(dir * 1, 4);
  ctx.stroke();

  // Handle nub
  ctx.fillStyle = COLORS.weaponHandle;
  ctx.fillRect(-dir * 2 - 1, -1.5, 3, 3);
}

function drawDaggerWeapon(ctx, facing, wDef) {
  const dir = facing;
  const bladeLen = wDef.range;

  // Short blade
  ctx.strokeStyle = COLORS.weaponSteel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(dir * bladeLen, -1);
  ctx.stroke();

  // Small guard
  ctx.strokeStyle = COLORS.weaponHandle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dir * 1, -3);
  ctx.lineTo(dir * 1, 3);
  ctx.stroke();
}

function drawSpearWeapon(ctx, facing, wDef) {
  const dir = facing;
  const shaftLen = wDef.range;
  const headLen = 6;

  // Long shaft
  ctx.strokeStyle = COLORS.weaponSpear;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-dir * 3, 0);
  ctx.lineTo(dir * shaftLen, 0);
  ctx.stroke();

  // Spearhead (triangle)
  ctx.fillStyle = COLORS.weaponSteel;
  ctx.beginPath();
  ctx.moveTo(dir * shaftLen, 0);
  ctx.lineTo(dir * (shaftLen + headLen), 0);
  ctx.lineTo(dir * shaftLen, -3);
  ctx.moveTo(dir * shaftLen, 0);
  ctx.lineTo(dir * (shaftLen + headLen), 0);
  ctx.lineTo(dir * shaftLen, 3);
  ctx.fill();
}

function drawBoomerangWeapon(ctx, facing) {
  const dir = facing;
  // V-shape boomerang
  ctx.strokeStyle = COLORS.boomerang;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(dir * -4, -5);
  ctx.lineTo(dir * 2, 0);
  ctx.lineTo(dir * -4, 5);
  ctx.stroke();
}

function drawThrowingKnifeWeapon(ctx, facing) {
  const dir = facing;
  // Small blade
  ctx.fillStyle = COLORS.weaponSteel;
  ctx.beginPath();
  ctx.moveTo(dir * 8, 0);
  ctx.lineTo(dir * 1, -2.5);
  ctx.lineTo(dir * 1, 2.5);
  ctx.closePath();
  ctx.fill();

  // Tiny handle
  ctx.strokeStyle = COLORS.weaponHandle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-dir * 4, 0);
  ctx.stroke();
}

// ─── Melee Slash Effect ──────────────────────────────────────

function drawMeleeSlashEffect(ctx, p, atk, body) {
  const startX = p.x + (p.facing === 1 ? C.PLAYER_WIDTH : 0);
  const endX = startX + p.facing * atk.wDef.range;

  const isHigh = p.attackStance === 'standing';
  const slashY = isHigh ? body.shoulderY : body.hipY + 8;

  ctx.strokeStyle = COLORS.attackSlash;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(startX, slashY);
  ctx.lineTo(endX, slashY);
  ctx.stroke();

  ctx.lineWidth = 8;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(startX, slashY);
  ctx.lineTo(endX, slashY);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// ─── Projectiles ─────────────────────────────────────────────

function drawProjectiles(ctx, state) {
  for (const proj of state.projectiles) {
    if (!proj.active) continue;

    if (proj.type === 'knife') {
      drawKnife(ctx, proj);
    } else if (proj.type === 'boomerang') {
      drawBoomerang(ctx, proj, state.frame);
    }
  }
}

function drawKnife(ctx, proj) {
  ctx.fillStyle = COLORS.knife;
  ctx.save();
  ctx.translate(proj.x, proj.y);

  ctx.beginPath();
  ctx.moveTo(proj.direction * 10, 0);
  ctx.lineTo(-proj.direction * 3, -3);
  ctx.lineTo(-proj.direction * 3, 3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBoomerang(ctx, proj, frame) {
  ctx.save();
  ctx.translate(proj.x, proj.y);

  const angle = frame * 0.3;
  ctx.rotate(angle);

  ctx.fillStyle = COLORS.boomerang;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(6, 0);
  ctx.moveTo(0, 6);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#AA6600';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (proj.height === 'none') {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = proj.y > C.GROUND_Y ? '#553300' : '#AADDFF';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────────────

function drawHUD(ctx, state) {
  const barW = 120;
  const barH = 16;
  const padding = 30;

  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    const x = i === 0 ? padding : C.CANVAS_WIDTH - padding - barW;
    const y = 12;

    ctx.fillStyle = i === 0 ? COLORS.p1Light : COLORS.p2Light;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillText(`Player ${i + 1}`, i === 0 ? x : x + barW, y);

    const barY = y + 6;
    ctx.fillStyle = COLORS.hpEmpty;
    ctx.fillRect(x, barY, barW, barH);

    const hpRatio = p.hp / C.MAX_HP;
    ctx.fillStyle = hpRatio > 0.4 ? COLORS.hpFull : '#CC4444';
    ctx.fillRect(x, barY, barW * hpRatio, barH);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, barY, barW, barH);

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.hp}/${C.MAX_HP}`, x + barW / 2, barY + 12);

    drawWeaponIndicators(ctx, p, i, x, barY + barH + 6);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`F:${state.frame}`, C.CANVAS_WIDTH / 2, 16);

  if (state.winner !== -1) {
    drawVictory(ctx, state.winner);
  }
}

function drawWeaponIndicators(ctx, p, idx, startX, y) {
  for (let w = 0; w < 3; w++) {
    const weaponId = p.weapons[w];
    const wDef = C.WEAPON_DEFS[weaponId];
    if (!wDef) continue;

    const x = idx === 0 ? startX + w * 42 : startX + (2 - w) * 42;
    const isActive = p.state === 'attacking' && p.activeWeapon === weaponId;

    ctx.fillStyle = isActive ? '#FFCC00' : 'rgba(255,255,255,0.6)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    let label = `${w + 1}:${wDef.name.slice(0, 4)}`;
    if (wDef.subtype === 'boomerang') {
      label += `(${p.boomerangsHeld})`;
    }
    ctx.fillText(label, x, y + 10);
  }
}

function drawVictory(ctx, winner) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, C.CANVAS_WIDTH, C.CANVAS_HEIGHT);

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';

  let text;
  if (winner === 2) text = 'DRAW!';
  else text = `PLAYER ${winner + 1} WINS!`;

  ctx.fillText(text, C.CANVAS_WIDTH / 2, C.CANVAS_HEIGHT / 2 - 10);

  ctx.font = '16px monospace';
  ctx.fillText('Press Enter to rematch', C.CANVAS_WIDTH / 2, C.CANVAS_HEIGHT / 2 + 30);
}
