/**
 * Canvas 2D renderer — draws game state with placeholder graphics.
 * Rendering is fully separated from simulation.
 */
import * as C from './constants.js';

const COLORS = {
  sky: '#87CEEB',
  ground: '#5B8C3E',
  groundDark: '#4A7532',
  p1: '#3366CC',
  p1Light: '#6699FF',
  p2: '#CC3333',
  p2Light: '#FF6666',
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
  // Sky
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, C.CANVAS_WIDTH, C.GROUND_Y);

  // Ground
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, C.GROUND_Y, C.CANVAS_WIDTH, C.CANVAS_HEIGHT - C.GROUND_Y);

  // Ground line
  ctx.strokeStyle = COLORS.groundDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, C.GROUND_Y);
  ctx.lineTo(C.CANVAS_WIDTH, C.GROUND_Y);
  ctx.stroke();

  // Arena bounds
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

// ─── Players ─────────────────────────────────────────────────

function drawPlayers(ctx, state) {
  for (let i = 0; i < 2; i++) {
    drawPlayer(ctx, state.players[i], i, state);
  }
}

function drawPlayer(ctx, p, idx, state) {
  const isCrouching = p.stance === 'crouching';
  const h = isCrouching ? C.PLAYER_CROUCH_HEIGHT : C.PLAYER_STAND_HEIGHT;
  const y = C.GROUND_Y - h;
  const baseColor = idx === 0 ? COLORS.p1 : COLORS.p2;
  const lightColor = idx === 0 ? COLORS.p1Light : COLORS.p2Light;

  // Body flash during hitstun/blockstun
  let bodyColor = baseColor;
  if (p.state === 'hitstun' && p.stateTimer % 4 < 2) {
    bodyColor = COLORS.hitstun;
  } else if (p.state === 'blockstun' && p.stateTimer % 4 < 2) {
    bodyColor = COLORS.blockstun;
  }

  // Body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(p.x, y, C.PLAYER_WIDTH, h);

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x, y, C.PLAYER_WIDTH, h);

  // Face indicator (small triangle on the front side)
  const faceX = p.facing === 1 ? p.x + C.PLAYER_WIDTH : p.x;
  const faceDir = p.facing;
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.moveTo(faceX, y + 8);
  ctx.lineTo(faceX + faceDir * 8, y + 14);
  ctx.lineTo(faceX, y + 20);
  ctx.closePath();
  ctx.fill();

  // Eyes (two dots)
  ctx.fillStyle = '#FFF';
  const eyeBaseX = p.facing === 1 ? p.x + C.PLAYER_WIDTH - 14 : p.x + 6;
  ctx.fillRect(eyeBaseX, y + 10, 3, 3);
  ctx.fillRect(eyeBaseX + 6, y + 10, 3, 3);

  // Shield bar (on the facing side, at appropriate height)
  const shieldX = p.facing === 1 ? p.x + C.PLAYER_WIDTH - 4 : p.x;
  const shieldW = 4;
  let shieldY, shieldH;
  if (p.stance === 'standing') {
    // High shield — top half
    shieldY = y;
    shieldH = h / 2;
  } else {
    // Low shield — bottom half
    shieldY = y + h / 2;
    shieldH = h / 2;
  }
  ctx.fillStyle = p.state === 'blockstun' ? COLORS.shieldBlock : COLORS.shield;
  ctx.fillRect(shieldX, shieldY, shieldW, shieldH);

  // Melee attack visual
  if (p.state === 'attacking' && p.activeWeapon) {
    const wDef = C.WEAPON_DEFS[p.activeWeapon];
    if (wDef && wDef.type === 'melee') {
      const elapsed = wDef.attackFrames - p.stateTimer;
      if (elapsed >= wDef.activeStart && elapsed <= wDef.activeEnd) {
        drawMeleeSlash(ctx, p, wDef, y, h);
      }
    }
  }

  // Player label
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`P${idx + 1}`, p.x + C.PLAYER_WIDTH / 2, y - 4);
}

function drawMeleeSlash(ctx, p, wDef, bodyY, bodyH) {
  const startX = p.x + (p.facing === 1 ? C.PLAYER_WIDTH : 0);
  const endX = startX + p.facing * wDef.range;

  // Attack height indicator
  const isHigh = p.attackStance === 'standing';
  const slashY = isHigh ? bodyY + 10 : bodyY + bodyH - 10;

  ctx.strokeStyle = COLORS.attackSlash;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(startX, slashY);
  ctx.lineTo(endX, slashY);
  ctx.stroke();

  // Wider slash effect
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

  // Small elongated triangle
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

  // Rotate over time for spin effect
  const angle = frame * 0.3;
  ctx.rotate(angle);

  // Diamond shape
  ctx.fillStyle = COLORS.boomerang;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(6, 0);
  ctx.lineTo(0, 6);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#AA6600';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Underground/overhead indicator
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

    // Label
    ctx.fillStyle = i === 0 ? COLORS.p1Light : COLORS.p2Light;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillText(`Player ${i + 1}`, i === 0 ? x : x + barW, y);

    // HP bar background
    const barY = y + 6;
    ctx.fillStyle = COLORS.hpEmpty;
    ctx.fillRect(x, barY, barW, barH);

    // HP bar fill
    const hpRatio = p.hp / C.MAX_HP;
    ctx.fillStyle = hpRatio > 0.4 ? COLORS.hpFull : '#CC4444';
    ctx.fillRect(x, barY, barW * hpRatio, barH);

    // HP bar border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, barY, barW, barH);

    // HP text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.hp}/${C.MAX_HP}`, x + barW / 2, barY + 12);

    // Weapon indicators
    drawWeaponIndicators(ctx, p, i, x, barY + barH + 6);
  }

  // Frame counter
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`F:${state.frame}`, C.CANVAS_WIDTH / 2, 16);

  // Victory overlay
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
