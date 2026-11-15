// EMBERLINE — Foundry Protocol. Boot and the one loop: a fixed 60 Hz simulation
// feeding a render at the display's rate, with the round state machine, the
// shared hitscan resolver, the economy and the plant/defuse objective on top.
// ?shot=start|play|buy|end&seed=N stages a deterministic frame for a capture and
// sets window.__shotReady; ?demo=1 runs a hands-off attract round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createMover } from './mover.js';
import { createWeapon, createTracers, createImpacts, createGrenades, WEAPONS, ARMOR_PRICE, GRENADE_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 20;
const BOMB_TIME = 30;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const demo = params.get('demo') === '1';
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shot ? mulberry32(seed) : Math.random;

window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error || 'error'));
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const tracers = createTracers(scene);
const impacts = createImpacts(scene);
const grenades = createGrenades(scene, world.colliders, onGrenadeExplode, () => audio.bounce());
const weapon = createWeapon(camera);

const player = {
  team: 'ember',
  alive: true,
  mover: createMover(world.colliders, world.spawns.ember[0]),
  health: 100,
  armor: 0,
  money: 800,
  primaryId: null,
  grenades: 0,
  kills: 0,
  deaths: 0,
  plantProgress: 0,
  defuseProgress: 0,
  lossStreak: 0,
};

const G = {
  phase: 'menu',
  round: 1,
  rounds: { ember: 0, frost: 0 },
  emberAttacks: true,
  timeLeft: ROUND_TIME,
  buyLeft: BUY_TIME,
  bomb: { planted: false, site: null, timer: 0, carrier: 'player' },
  elapsed: 0,
  shake: 0,
  aiming: false,
  prevFiring: false,
  roundEndAt: 0,
  frozen: false,
};

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const origin = new THREE.Vector3();
const _oc = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
let shootTargets = [];

const hooks = {
  now: () => G.elapsed,
  onKill,
  onCarrierDown,
  onPlant,
  onPlantTick: (progress, site) => {
    if (G.phase === 'live') hud.plant(true, `Planting Surge Core — Site ${site}`, progress);
  },
  onDefuseTick: (progress) => {
    if (G.phase === 'live') hud.plant(true, 'Defusing Surge Core', progress);
  },
  onDefuse,
  onBotShot,
};
const bots = createBots(scene, world, hooks);
shootTargets = world.shootables.concat(bots.hitMeshes);

function teamName(team) {
  return team === 'ember' ? 'Ember' : 'Frost';
}

function teamColor(team) {
  return team === 'ember' ? PALETTE.amber : PALETTE.frost;
}

function feedHtml(killer, victim, isHead) {
  const kClass = killer.team === 'ember' ? 'e' : 'f';
  const vClass = victim.team === 'ember' ? 'e' : 'f';
  const kName = killer === player ? 'You' : killer.name;
  const vName = victim === player ? 'You' : victim.name;
  return `<span class="${kClass}">${kName}</span> ${isHead ? '◉' : '✕'} <span class="${vClass}">${vName}</span>`;
}

function onKill(victim, killer, isHead) {
  hud.killFeed(feedHtml(killer, victim, isHead));
  if (killer === player) {
    player.money += 300;
    player.kills += 1;
    hud.setMoney(player.money);
  }
  if (victim === player) {
    player.deaths += 1;
    hud.damageFlash();
    audio.hurt();
    G.shake = Math.max(G.shake, 0.5);
  }
}

function onCarrierDown(bot) {
  if (!G.emberAttacks) {
    const next = bots.list.find((b) => b.team === 'frost' && b.alive);
    if (next) {
      next.carrier = true;
      hud.setObjective('Frost carries the Surge Core — hold the sites.');
    }
  }
}

function onPlant(site, planter) {
  G.bomb.planted = true;
  G.bomb.site = world.sites[site];
  G.bomb.timer = BOMB_TIME;
  hud.plant(false);
  hud.banner('SURGE CORE PLANTED', `Site ${site} — defend it until detonation`, PALETTE.amber, 3000);
  hud.setObjective('Surge Core planted — defend it, or defuse it at the site.');
  audio.plantBeep(true);
}

function onDefuse(bot) {
  endRound(bot.team, 'Surge Core defused');
}

function onBotShot(bot, shotOrigin, dir) {
  resolveShot(bot, shotOrigin, dir, bot.weapon, false);
  audio.shot(bot.weapon.id === 'sniper' ? 'sniper' : bot.weapon.id);
  bots.hearShot(shotOrigin, bot.team);
}

// Analytic ray vs sphere for the player (the player has no hit mesh).
function raySphere(o, d, cx, cy, cz, radius) {
  _oc.set(cx - o.x, cy - o.y, cz - o.z);
  const tca = _oc.dot(d);
  if (tca < 0) return Infinity;
  const d2 = _oc.dot(_oc) - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function resolveShot(shooter, shotOrigin, dir, def, isPlayer) {
  raycaster.set(shotOrigin, dir);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootTargets, false);
  let wallDist = def.range;
  let wallPoint = null;
  for (const hit of hits) {
    const obj = hit.object;
    const bot = obj.userData.bot;
    if (bot) {
      if (!bot.alive || bot === shooter || bot.team === shooter.team) continue;
      const isHead = obj.userData.part === 'head';
      let dmg = def.damage * (isHead ? def.headMult : 1);
      if (hit.distance > 25) dmg *= 0.75;
      _hitPoint.copy(hit.point);
      tracers.fire(shotOrigin, _hitPoint, teamColor(shooter.team));
      impacts.spawn(_hitPoint);
      const wasAlive = bot.alive;
      bots.damage(bot, dmg, isHead, shooter);
      if (isPlayer) {
        hud.hitMarker(!bot.alive, 120);
        audio.hit(!bot.alive);
      }
      return { hit: true, killed: wasAlive && !bot.alive, point: _hitPoint };
    }
    wallDist = hit.distance;
    wallPoint = hit.point;
    break;
  }
  // Bot shots can hit the player: test the player's two body spheres.
  if (!isPlayer && player.alive) {
    const p = player.mover.state.position;
    const headDist = raySphere(shotOrigin, dir, p.x, p.y + player.mover.state.eye - 0.12, p.z, 0.26);
    const bodyDist = raySphere(shotOrigin, dir, p.x, p.y + 0.95, p.z, 0.52);
    const best = Math.min(headDist, bodyDist);
    if (best < wallDist) {
      const isHead = headDist < bodyDist;
      let dmg = def.damage * (isHead ? def.headMult : 1);
      if (best > 25) dmg *= 0.75;
      _hitPoint.copy(shotOrigin).addScaledVector(dir, best);
      tracers.fire(shotOrigin, _hitPoint, teamColor(shooter.team));
      damagePlayer(dmg, shooter);
      return { hit: true, killed: !player.alive, point: _hitPoint };
    }
  }
  if (wallPoint) {
    tracers.fire(shotOrigin, wallPoint, teamColor(shooter.team));
    impacts.spawn(wallPoint);
    return { hit: true, killed: false, point: wallPoint };
  }
  _hitPoint.copy(shotOrigin).addScaledVector(dir, def.range);
  tracers.fire(shotOrigin, _hitPoint, teamColor(shooter.team));
  return { hit: false, killed: false, point: _hitPoint };
}

function damagePlayer(amount, shooter) {
  // Shot staging (screenshots) runs the live simulation but the staged player
  // must survive it: invulnerable while ?shot= is set.
  if (shot) return;
  let dealt = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, dealt * 0.5);
    player.armor -= absorbed;
    dealt -= absorbed * 0.6;
  }
  player.health -= dealt;
  hud.setHealth(player.health, player.armor);
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    player.deaths += 1;
    hud.damageFlash();
    audio.hurt();
    G.shake = 1;
    hud.killFeed(feedHtml(shooter, player, false));
    if (G.emberAttacks && G.bomb.carrier === 'player' && !G.bomb.planted) {
      G.bomb.carrier = 'bot';
      const next = bots.list.find((b) => b.team === 'ember' && b.alive);
      if (next) {
        next.carrier = true;
        hud.setObjective(`${next.name} carries the Surge Core — cover the plant.`);
      }
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onGrenadeExplode(pos, owner) {
  audio.explosion();
  const p = player.mover.state.position;
  const pd = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
  if (player.alive && pd < 7) {
    const dmg = Math.max(12, 95 * (1 - pd / 7));
    damagePlayer(dmg, owner);
    if (pd < 4) G.shake = Math.max(G.shake, 0.9);
  }
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const bp = bot.mover.state.position;
    const bd = Math.hypot(bp.x - pos.x, bp.y - pos.y, bp.z - pos.z);
    if (bd < 7) {
      const dmg = Math.max(12, 95 * (1 - bd / 7));
      bots.damage(bot, dmg, false, owner);
    }
  }
  bots.hearShot(pos, owner ? owner.team : 'ember');
}

function buy(item) {
  if (G.phase !== 'buy') return;
  if (item === 'armor') {
    if (player.armor >= 100 || player.money < ARMOR_PRICE) return;
    player.money -= ARMOR_PRICE;
    player.armor = 100;
  } else if (item === 'grenade') {
    if (player.grenades >= 2 || player.money < GRENADE_PRICE) return;
    player.money -= GRENADE_PRICE;
    player.grenades += 1;
  } else {
    const def = WEAPONS[item];
    if (!def || player.money < def.price) return;
    player.money -= def.price;
    player.primaryId = item;
    weapon.equip(item, false);
  }
  hud.setMoney(player.money);
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setGrenades(player.grenades);
  audio.plantBeep(false);
}

function startRound() {
  G.emberAttacks = bots.resetRound(G.round, { time: G.elapsed });
  G.bomb = { planted: false, site: null, timer: 0, carrier: G.emberAttacks ? 'player' : 'bot' };
  const spawn = world.spawns.ember[0];
  player.mover.reset(spawn);
  player.health = 100;
  player.alive = true;
  if (!player.primaryId) weapon.equip('p9', false);
  else weapon.equip(player.primaryId, false);
  player.plantProgress = 0;
  player.defuseProgress = 0;
  player.grenades = 0;
  G.timeLeft = ROUND_TIME;
  G.buyLeft = BUY_TIME;
  G.phase = 'buy';
  grenades.reset();
  hud.hideBanner();
  hud.plant(false);
  hud.bomb(false);
  hud.showBuy(true);
  hud.setScore(G.rounds.ember, G.rounds.frost);
  hud.setMoney(player.money);
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setGrenades(player.grenades);
  hud.setTimer(BUY_TIME, `Round ${G.round} — buy phase`);
  hud.setObjective(
    G.emberAttacks
      ? 'You carry the Surge Core — plant it at Site A or B (hold E).'
      : 'Defend Sites A and B — stop the Frost plant, or defuse it.',
  );
  audio.roundStart();
}

function startMatch() {
  G.rounds = { ember: 0, frost: 0 };
  G.round = 1;
  player.money = 800;
  player.primaryId = null;
  player.armor = 0;
  player.lossStreak = 0;
  player.kills = 0;
  player.deaths = 0;
  weapon.equip('p9', false);
  startRound();
}

function endRound(winner, reason) {
  if (G.phase !== 'live' && G.phase !== 'buy') return;
  G.phase = 'roundEnd';
  G.roundEndAt = G.elapsed;
  G.rounds[winner] += 1;
  const playerWon = winner === 'ember';
  if (playerWon) {
    player.money += 3250;
    player.lossStreak = 0;
  } else {
    player.money += 1900 + Math.min(1500, player.lossStreak * 500);
    player.lossStreak += 1;
  }
  for (const bot of bots.list) {
    if (bot.team === winner) bot.money += 3250;
    else bot.money += 1900;
  }
  hud.showBuy(false);
  hud.plant(false);
  hud.bomb(false);
  hud.setScore(G.rounds.ember, G.rounds.frost);
  hud.setMoney(player.money);
  hud.banner(
    playerWon ? 'ROUND WON' : 'ROUND LOST',
    `${teamName(winner)} takes round ${G.round} — ${reason}`,
    teamColor(winner),
    3400,
  );
  audio.horn(playerWon);
  if (document.pointerLockElement) document.exitPointerLock();
  const matchOver = G.rounds.ember >= WIN_ROUNDS || G.rounds.frost >= WIN_ROUNDS || G.round >= MAX_ROUNDS;
  if (matchOver) {
    G.phase = 'matchEnd';
    const winnerName = G.rounds.ember === G.rounds.frost ? 'Draw' : teamName(G.rounds.ember > G.rounds.frost ? 'ember' : 'frost');
    setTimeout(() => {
      hud.showOverlay('match', `${winnerName} wins the match ${G.rounds.ember}–${G.rounds.frost}. You: ${player.kills} kills, ${player.deaths} deaths.`);
    }, 3400);
  }
}

function checkRoundEnd() {
  // Shot staging runs the live simulation; the round must not end on its own
  // while a capture is being staged (the 'end' shot ends it explicitly).
  if (shot) return;
  if (G.phase !== 'live') return;
  const emberAlive = (player.alive ? 1 : 0) + bots.aliveOf('ember');
  const frostAlive = bots.aliveOf('frost');
  if (G.bomb.planted) {
    if (frostAlive === 0) endRound('ember', 'Frost squad eliminated after the plant');
    else if (emberAlive === 0) {
      // Bomb still ticks: defenders must defuse before it blows.
      if (G.bomb.timer <= 0) endRound('ember', 'Surge Core detonated');
    }
    return;
  }
  if (emberAlive === 0) endRound('frost', 'Ember squad eliminated');
  else if (frostAlive === 0) endRound('ember', 'Frost squad eliminated');
  else if (G.timeLeft <= 0) endRound('frost', 'Time expired — the sites held');
}

function playerShoot() {
  if (!weapon.ready()) {
    if (weapon.state.mag === 0 && weapon.state.cooldown === 0) audio.dryClick();
    return;
  }
  if (!weapon.takeRound()) return;
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.mover.groundSpeed(), G.aiming);
  direction.x += (rng() * 2 - 1) * spread;
  direction.y += (rng() * 2 - 1) * spread;
  direction.z += (rng() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  weapon.muzzleWorld(muzzle);
  origin.copy(camera.position);
  const result = resolveShot(player, origin, direction, weapon.state.def, true);
  weapon.pullTrigger();
  player.mover.recoil(weapon.state.def.kick + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  G.shake = Math.max(G.shake, weapon.state.def.id === 'sniper' ? 0.35 : 0.12);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  if (result.hit) bots.hearShot(origin, 'ember');
  audio.shot(weapon.state.def.id);
}

function stepPlayer(dt) {
  const keys = input.state.keys;
  const body = player.mover.state;
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  let wishX = 0;
  let wishZ = 0;
  if (forward || strafe) {
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    const len = Math.hypot(forward, strafe);
    wishX = (-sin * forward + cos * strafe) / len;
    wishZ = (-cos * forward - sin * strafe) / len;
  }
  const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  const jump = input.consume('Space');
  player.mover.step(dt, wishX, wishZ, player.mover.walkSpeed, jump, crouch);

  // Weapon switching.
  if (input.consume('Digit1') && player.primaryId) weapon.equip(player.primaryId, true);
  if (input.consume('Digit2')) weapon.equip('p9', true);
  if (input.consume('KeyR')) {
    weapon.reload();
    audio.reload();
  }
  if (input.consume('KeyG') && player.grenades > 0) {
    player.grenades -= 1;
    hud.setGrenades(player.grenades);
    camera.getWorldDirection(direction);
    weapon.muzzleWorld(muzzle);
    grenades.throw(muzzle, direction, player);
    audio.grenadeThrow();
  }
}

function stepObjective(dt) {
  const body = player.mover.state;
  const keys = input.state.keys;
  const holdingE = keys.has('KeyE');
  if (G.phase !== 'live' || !player.alive) {
    player.plantProgress = 0;
    player.defuseProgress = 0;
    return;
  }
  // Planting: attacker carrying the core, standing in a site, holding E.
  if (G.emberAttacks && G.bomb.carrier === 'player' && !G.bomb.planted) {
    let inSite = null;
    for (const site of Object.values(world.sites)) {
      const dx = body.position.x - site.x;
      const dz = body.position.z - site.z;
      if (dx * dx + dz * dz < site.radius * site.radius) inSite = site;
    }
    if (inSite && holdingE) {
      player.plantProgress += dt / 3;
      hud.plant(true, `Planting Surge Core — Site ${inSite.id}`, player.plantProgress);
      if (player.plantProgress >= 1) {
        player.plantProgress = 0;
        hud.plant(false);
        onPlant(inSite.id, player);
      }
    } else {
      player.plantProgress = 0;
      if (!inSite) hud.plant(false);
    }
    return;
  }
  // Defusing: defender at the planted site, holding E.
  if (G.bomb.planted && !G.emberAttacks) {
    const site = G.bomb.site;
    const dx = body.position.x - site.x;
    const dz = body.position.z - site.z;
    if (dx * dx + dz * dz < site.radius * site.radius && holdingE) {
      player.defuseProgress += dt / 5;
      hud.plant(true, 'Defusing Surge Core', player.defuseProgress);
      if (player.defuseProgress >= 1) {
        player.defuseProgress = 0;
        hud.plant(false);
        endRound('ember', 'Surge Core defused');
      }
    } else {
      player.defuseProgress = 0;
    }
  }
}

function syncCamera() {
  const body = player.mover.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  const shakeX = G.shake > 0 ? (rng() - 0.5) * 0.02 * G.shake : 0;
  const shakeY = G.shake > 0 ? (rng() - 0.5) * 0.02 * G.shake : 0;
  camera.rotation.set(body.pitch + shakeX, body.yaw + shakeY, 0, 'YXZ');
  const targetFov = G.aiming ? (weapon.state.def.id === 'sniper' ? 30 : 52) : 74;
  camera.fov += (targetFov - camera.fov) * 0.2;
  camera.updateProjectionMatrix();
}

function step(dt) {
  G.elapsed += dt;
  G.shake = Math.max(0, G.shake - dt * 2.2);

  if (G.phase === 'buy') {
    G.buyLeft -= dt;
    hud.setTimer(Math.max(0, G.buyLeft), `Round ${G.round} — buy phase`);
    if (G.buyLeft <= 0) {
      G.phase = 'live';
      G.timeLeft = ROUND_TIME;
      hud.showBuy(false);
      hud.setTimer(G.timeLeft, `Round ${G.round}`);
      audio.roundStart();
    }
  } else if (G.phase === 'live') {
    G.timeLeft -= dt;
    if (!G.bomb.planted) hud.setTimer(Math.max(0, G.timeLeft), `Round ${G.round}`);
    if (G.bomb.planted) {
      G.bomb.timer -= dt;
      hud.bomb(true, G.bomb.timer);
      hud.setTimer(G.bomb.timer, 'Core armed');
      if (G.bomb.timer <= 0) {
        audio.explosion();
        endRound('ember', 'Surge Core detonated');
      }
    }
  } else if (G.phase === 'roundEnd' && G.elapsed - G.roundEndAt > 4) {
    if (G.rounds.ember < WIN_ROUNDS && G.rounds.frost < WIN_ROUNDS && G.round < MAX_ROUNDS) {
      G.round += 1;
      startRound();
    }
  }

  // Buy phase: freeze movement, take buy input only.
  if (G.phase === 'buy') {
    if (input.consume('KeyB')) hud.showBuy(document.getElementById('buy-menu').hidden);
    if (input.consume('Digit1')) buy('rifle');
    if (input.consume('Digit2')) buy('smg');
    if (input.consume('Digit3')) buy('sniper');
    if (input.consume('Digit4')) buy('armor');
    if (input.consume('Digit5')) buy('grenade');
    weapon.step(dt);
  } else if (G.phase === 'live' && player.alive && !shot) {
    stepPlayer(dt);
    weapon.step(dt);
    const firing = input.state.firing;
    const semi = !weapon.state.def.auto;
    if (firing && weapon.ready() && (!semi || !G.prevFiring)) playerShoot();
    G.prevFiring = firing;
    stepObjective(dt);
  } else if (shot) {
    weapon.step(dt);
  }

  if (G.phase === 'live') {
    bots.step(dt, {
      time: G.elapsed,
      player,
      bomb: G.bomb,
      rng,
      raycaster,
    });
    grenades.step(dt);
    checkRoundEnd();
  }

  tracers.step(dt);
  impacts.step(dt);
  hud.setAlive((player.alive ? 1 : 0) + bots.aliveOf('ember'), bots.aliveOf('frost'));
  hud.setCrosshair(4 + player.mover.groundSpeed() * 1.6 + (G.aiming ? -1.5 : 0));
  syncCamera();
}

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = shot ? { x: 0, y: 0 } : input.takeLook();
    if (!shot) player.mover.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot || demo) return;
  if (locked) {
    audio.unlock();
    hud.hideOverlay();
  } else if (G.phase === 'live' || G.phase === 'buy') {
    hud.showOverlay('paused');
  } else if (G.phase === 'menu') {
    hud.showOverlay('start');
  }
}

hud.onPlay(() => {
  if (shot || demo) return;
  audio.unlock();
  if (G.phase === 'menu' || G.phase === 'matchEnd') {
    startMatch();
  }
  input.requestLock();
});

hud.onBuy((item) => buy(item));

window.addEventListener('mousedown', (event) => {
  if (event.button === 2 && input.state.locked) G.aiming = true;
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) G.aiming = false;
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Deterministic captures: stage a frame, render it twice, freeze, signal ready.
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.mover.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  G.phase = 'live';
  startMatchSilent();
  if (name === 'start') {
    const body = player.mover.state;
    body.position.set(-2, 0, 16);
    body.yaw = 0.12;
    body.pitch = 0.02;
    settle(30);
    syncCamera();
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'buy') {
    const body = player.mover.state;
    body.position.set(0, 0, 15);
    body.yaw = 0;
    settle(20);
    syncCamera();
    hud.showBuy(true);
    paintTwiceThenReady();
    return;
  }
  // play / end: run a live round, then stage a combat frame.
  const body = player.mover.state;
  body.position.set(-4, 0, 8);
  settle(60);
  const enemy = bots.list.find((b) => b.team === 'frost' && b.alive);
  if (enemy) {
    const ep = enemy.mover.state.position;
    enemy.mover.state.position.set(-6, 0, -2);
    enemy.mesh.position.copy(enemy.mover.state.position);
    aimAt(new THREE.Vector3(-6, 1.5, -2));
    weapon.equip('rifle', false);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
    settle(10);
    playerShoot();
    settle(2);
    if (name === 'end') {
      settle(30);
      endRound('ember', 'Frost squad eliminated');
      settle(10);
    }
  }
  syncCamera();
  paintTwiceThenReady();
}

function startMatchSilent() {
  G.rounds = { ember: 0, frost: 0 };
  G.round = 1;
  player.money = 800;
  player.primaryId = null;
  player.armor = 0;
  player.lossStreak = 0;
  player.kills = 0;
  player.deaths = 0;
  weapon.equip('p9', false);
  G.phase = 'live';
  G.emberAttacks = bots.resetRound(1, { time: 0 });
  G.bomb = { planted: false, site: null, timer: 0, carrier: 'player' };
  const spawn = world.spawns.ember[0];
  player.mover.reset(spawn);
  player.health = 100;
  player.alive = true;
  G.timeLeft = ROUND_TIME;
  G.buyLeft = 0;
  grenades.reset();
  hud.hideBanner();
  hud.plant(false);
  hud.bomb(false);
  hud.showBuy(false);
  hud.setScore(0, 0);
  hud.setMoney(800);
  hud.setHealth(100, 0);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setGrenades(0);
  hud.setTimer(ROUND_TIME, 'Round 1');
  hud.setObjective('You carry the Surge Core — plant it at Site A or B (hold E).');
  audio.setEnabled(false);
}

syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
if (shot) {
  audio.setEnabled(false);
  runShot(shot);
} else if (demo) {
  audio.setEnabled(false);
  hud.hideOverlay();
  startMatchSilent();
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
