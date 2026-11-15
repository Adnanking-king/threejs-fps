// The bots: nine of them, four on Ember with the player and five on Frost. Each
// bot is a mover with a body mesh, a weapon, a wallet, a skill level and a small
// state machine: follow waypoints to its site, hold angles, engage on sight,
// react to sound, plant the Surge Core or defuse it. No per-frame allocation in
// the hot loop: temp vectors live at module scope.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { WEAPONS } from './weapons.js';
import { TEAM } from './palette.js';

const NAMES = {
  ember: ['Vex', 'Ash', 'Koda', 'Rook'],
  frost: ['Glacier', 'Nyx', 'Sable', 'Onyx', 'Wren'],
};

const SKILLS = [
  { reaction: 0.55, aim: 0.03, burst: [3, 5], pause: [0.5, 0.9], speed: 4.3 },
  { reaction: 0.42, aim: 0.024, burst: [3, 6], pause: [0.4, 0.8], speed: 4.6 },
  { reaction: 0.32, aim: 0.018, burst: [4, 6], pause: [0.3, 0.6], speed: 4.9 },
  { reaction: 0.25, aim: 0.013, burst: [4, 7], pause: [0.25, 0.5], speed: 5.1 },
  { reaction: 0.38, aim: 0.021, burst: [3, 5], pause: [0.4, 0.7], speed: 4.7 },
];

const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _to = new THREE.Vector3();
const _chest = new THREE.Vector3();

const torsoGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.78, 10);
const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
const visorGeo = new THREE.BoxGeometry(0.3, 0.07, 0.06);
const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
const legGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);

export function createBots(scene, world, hooks) {
  const mats = {
    emberTorso: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.ember.color), roughness: 0.6, metalness: 0.25 }),
    frostTorso: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.frost.color), roughness: 0.6, metalness: 0.25 }),
    head: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2d36'), roughness: 0.7, metalness: 0.3 }),
    leg: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1f26'), roughness: 0.9, metalness: 0.1 }),
    emberVisor: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.ember.color), emissive: new THREE.Color(TEAM.ember.color), emissiveIntensity: 1.4 }),
    frostVisor: new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.frost.color), emissive: new THREE.Color(TEAM.frost.color), emissiveIntensity: 1.4 }),
    gun: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9c4b8'), roughness: 0.5, metalness: 0.35 }),
  };

  const list = [];
  const hitMeshes = [];

  function buildMesh(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, team === 'ember' ? mats.emberTorso : mats.frostTorso);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, mats.head);
    head.position.y = 1.62;
    head.castShadow = true;
    const visor = new THREE.Mesh(visorGeo, team === 'ember' ? mats.emberVisor : mats.frostVisor);
    visor.position.set(0, 1.63, 0.19);
    const gun = new THREE.Mesh(gunGeo, mats.gun);
    gun.position.set(0.22, 1.15, -0.3);
    const legL = new THREE.Mesh(legGeo, mats.leg);
    legL.position.set(-0.12, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, mats.leg);
    legR.position.set(0.12, 0.25, 0);
    group.add(torso, head, visor, gun, legL, legR);
    return { group, torso, head, gun };
  }

  function makeBot(team, index, spawn) {
    const skill = SKILLS[index % SKILLS.length];
    const name = NAMES[team][index % NAMES[team].length];
    const parts = buildMesh(team);
    scene.add(parts.group);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      skill,
      spawnIndex: index,
      mover: createMover(world.colliders, spawn),
      mesh: parts.group,
      torsoMesh: parts.torso,
      headMesh: parts.head,
      health: 100,
      armor: 0,
      money: 800,
      alive: true,
      weaponId: 'p9',
      weapon: WEAPONS.p9,
      mag: WEAPONS.p9.mag,
      reserve: WEAPONS.p9.reserve,
      cooldown: 0,
      reloadLeft: 0,
      role: 'defend',
      site: team === 'ember' ? 'A' : 'B',
      carrier: false,
      path: [],
      pathIndex: 0,
      holdNode: -1,
      target: null,
      lastSeen: null,
      lastSeenAt: -10,
      reactionLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      thinkAt: 0,
      stuckAt: 0,
      lastProgress: null,
      investigate: null,
      investigateUntil: 0,
      plantProgress: 0,
      defuseProgress: 0,
      strafeDir: 1,
      strafeAt: 0,
      yawSmooth: 0,
      kills: 0,
      deaths: 0,
    };
    bot.lastSeen = new THREE.Vector3();
    bot.lastProgress = new THREE.Vector3();
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'body';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    hitMeshes.push(parts.torso, parts.head);
    list.push(bot);
    return bot;
  }

  // Spawn the two squads. Ember index 0 is the player's slot, so bots take 1..4.
  for (let i = 1; i <= 4; i += 1) makeBot('ember', i - 1, world.spawns.ember[i]);
  for (let i = 0; i < 5; i += 1) makeBot('frost', i, world.spawns.frost[i]);

  function aliveOf(team) {
    let count = 0;
    for (const bot of list) if (bot.team === team && bot.alive) count += 1;
    return count;
  }

  function eyeOf(bot) {
    const p = bot.mover.state.position;
    _eye.set(p.x, p.y + bot.mover.state.eye, p.z);
    return _eye;
  }

  function visibleEnemy(bot, ctx) {
    // Nearest living enemy in front, with a clear line of sight.
    let best = null;
    let bestDist = 48;
    const eye = eyeOf(bot);
    const candidates = [];
    if (ctx.player.alive && ctx.player.team !== bot.team) candidates.push(ctx.player);
    for (const other of list) {
      if (other.alive && other.team !== bot.team) candidates.push(other);
    }
    for (const enemy of candidates) {
      const pos = enemy.mover ? enemy.mover.state.position : enemy.position;
      const eyeY = enemy.mover ? enemy.mover.state.eye : 1.5;
      _target.set(pos.x, pos.y + eyeY - 0.25, pos.z);
      _dir.subVectors(_target, eye);
      const dist = _dir.length();
      if (dist > bestDist || dist < 0.5) continue;
      _dir.normalize();
      // Must be roughly in front of the bot's facing.
      const fx = -Math.sin(bot.mover.state.yaw);
      const fz = -Math.cos(bot.mover.state.yaw);
      if (_dir.x * fx + _dir.z * fz < 0.1 && dist > 3) continue;
      ctx.raycaster.set(eye, _dir);
      ctx.raycaster.far = dist;
      const hit = ctx.raycaster.intersectObjects(world.shootables, false)[0];
      if (hit && hit.distance < dist - 0.6) continue;
      best = enemy;
      bestDist = dist;
    }
    return best;
  }

  function setPath(bot, goalNode) {
    const from = world.nearestNode(bot.mover.state.position.x, bot.mover.state.position.z);
    bot.path = world.findPath(from, goalNode);
    bot.pathIndex = 0;
  }

  function goalNodeFor(bot, ctx) {
    const bomb = ctx.bomb;
    if (bot.role === 'attack') {
      if (bomb.planted) return world.nearestNode(bomb.site.x + 2, bomb.site.z + 2);
      if (bot.carrier) return world.nearestNode(world.sites[bot.site].x, world.sites[bot.site].z);
      return world.nearestNode(world.sites[bot.site].x, world.sites[bot.site].z);
    }
    if (bomb.planted) return world.nearestNode(bomb.site.x, bomb.site.z);
    if (bot.holdNode >= 0) return bot.holdNode;
    return world.nearestNode(world.sites[bot.site].x, world.sites[bot.site].z);
  }

  function buyFor(bot) {
    const defs = ['rifle', 'smg', 'p9'];
    let pick = 'p9';
    if (bot.money >= 4750 && bot.id === 'frost-4') pick = 'sniper';
    else if (bot.money >= 2700) pick = 'rifle';
    else if (bot.money >= 1500) pick = 'smg';
    bot.weaponId = pick;
    bot.weapon = WEAPONS[pick];
    bot.mag = bot.weapon.mag;
    bot.reserve = bot.weapon.reserve;
    if (bot.money >= 650 + bot.weapon.price) {
      bot.money -= bot.weapon.price;
      if (bot.money >= 650) {
        bot.money -= 650;
        bot.armor = 100;
      }
    } else {
      bot.money -= Math.min(bot.money, bot.weapon.price);
      bot.armor = 0;
    }
    bot.armor = bot.armor || 0;
  }

  function damage(bot, amount, isHead, killer) {
    if (!bot.alive) return;
    let dealt = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dealt * 0.5);
      bot.armor -= absorbed;
      dealt -= absorbed * 0.6;
    }
    bot.health -= dealt;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.deaths += 1;
      bot.mesh.rotation.x = -Math.PI / 2;
      bot.mesh.position.y = 0.25;
      if (bot.carrier) {
        bot.carrier = false;
        hooks.onCarrierDown(bot);
      }
      hooks.onKill(bot, killer, isHead);
    }
  }

  function healAll() {
    for (const bot of list) {
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.mesh.rotation.x = 0;
      bot.mesh.position.y = 0;
      bot.carrier = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.target = null;
      bot.path = [];
      bot.pathIndex = 0;
      bot.investigate = null;
    }
  }

  function resetRound(round, ctx) {
    const emberAttacks = round % 2 === 1;
    healAll();
    for (const bot of list) {
      const spawnList = bot.team === 'ember' ? world.spawns.ember : world.spawns.frost;
      const spawn = bot.team === 'ember'
        ? spawnList[Math.min(bot.spawnIndex + 1, spawnList.length - 1)]
        : spawnList[Math.min(bot.spawnIndex, spawnList.length - 1)];
      bot.mover.reset(spawn);
      bot.mesh.position.copy(bot.mover.state.position);
      bot.mesh.rotation.set(0, bot.mover.state.yaw, 0);
      buyFor(bot);
      bot.role = (bot.team === 'ember') === emberAttacks ? 'attack' : 'defend';
      const attackSite = round % 4 < 2 ? 'A' : 'B';
      bot.site = bot.role === 'attack' ? attackSite : (bot.spawnIndex % 2 === 0 ? 'A' : 'B');
      if (bot.role === 'defend') {
        const siteNodes = bot.site === 'A' ? [11, 16, 18] : [14, 17, 19];
        bot.holdNode = siteNodes[(bot.id.charCodeAt(bot.id.length - 1) + round) % siteNodes.length];
      } else {
        bot.holdNode = -1;
      }
      bot.path = [];
      bot.pathIndex = 0;
    }
    // Frost carrier when Frost attacks; the player carries when Ember attacks.
    if (!emberAttacks) {
      const carrier = list.find((b) => b.team === 'frost' && b.alive);
      if (carrier) carrier.carrier = true;
    }
    return emberAttacks;
  }

  function hearShot(position, shooterTeam) {
    for (const bot of list) {
      if (!bot.alive || bot.team === shooterTeam) continue;
      const p = bot.mover.state.position;
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      if (dx * dx + dz * dz < 625) {
        bot.investigate = { x: position.x, z: position.z };
        bot.investigateUntil = hooks.now() + 3;
      }
    }
  }

  function stepBot(bot, dt, ctx) {
    const mover = bot.mover;
    const body = mover.state;
    if (!bot.alive) return;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const need = bot.weapon.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }

    // Perception, staggered by bot index so the raycasts spread across steps.
    const now = ctx.time;
    if (now >= bot.thinkAt) {
      bot.thinkAt = now + 0.15 + (bot.id.charCodeAt(bot.id.length - 1) % 5) * 0.02;
      const seen = visibleEnemy(bot, ctx);
      if (seen) {
        if (bot.target !== seen) {
          bot.target = seen;
          bot.reactionLeft = bot.skill.reaction;
          bot.burstLeft = 0;
        }
        const pos = seen.mover ? seen.mover.state.position : seen.position;
        bot.lastSeen.set(pos.x, pos.y, pos.z);
        bot.lastSeenAt = now;
      } else if (bot.target && now - bot.lastSeenAt > 2) {
        bot.target = null;
      }
    }

    // Planting and defusing channel in place.
    const bomb = ctx.bomb;
    if (bot.role === 'attack' && bot.carrier && !bomb.planted && !bot.target) {
      const site = world.sites[bot.site];
      const dx = body.position.x - site.x;
      const dz = body.position.z - site.z;
      if (dx * dx + dz * dz < site.radius * site.radius) {
        bot.plantProgress += dt / 3;
        hooks.onPlantTick(bot.plantProgress, bot.site);
        if (bot.plantProgress >= 1) {
          bot.plantProgress = 0;
          hooks.onPlant(bot.site, bot);
        }
        return;
      }
      bot.plantProgress = 0;
    }
    if (bot.role === 'defend' && bomb.planted && !bot.target) {
      const dx = body.position.x - bomb.site.x;
      const dz = body.position.z - bomb.site.z;
      if (dx * dx + dz * dz < bomb.site.radius * bomb.site.radius) {
        bot.defuseProgress += dt / 5;
        hooks.onDefuseTick(bot.defuseProgress);
        if (bot.defuseProgress >= 1) {
          bot.defuseProgress = 0;
          hooks.onDefuse(bot);
        }
        return;
      }
      bot.defuseProgress = 0;
    }

    // Combat: face the target, strafe, fire in bursts with aim error.
    let wishX = 0;
    let wishZ = 0;
    let speed = bot.skill.speed;
    let wantCrouch = false;
    if (bot.target) {
      const tpos = bot.target.mover ? bot.target.mover.state.position : bot.target.position;
      const tEye = bot.target.mover ? bot.target.mover.state.eye : 1.5;
      _target.set(tpos.x, tpos.y + tEye - 0.2, tpos.z);
      const eye = eyeOf(bot);
      const dx = _target.x - eye.x;
      const dy = _target.y - eye.y;
      const dz = _target.z - eye.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - body.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      body.yaw += dyaw * Math.min(1, dt * 10);
      body.pitch += (Math.asin(Math.max(-1, Math.min(1, dy / dist))) - body.pitch) * Math.min(1, dt * 10);
      if (now > bot.strafeAt) {
        bot.strafeAt = now + 0.7 + ctx.rng() * 0.8;
        bot.strafeDir = ctx.rng() < 0.5 ? -1 : 1;
      }
      const strafe = dist < 14 ? bot.strafeDir : 0;
      const fx = -Math.sin(body.yaw);
      const fz = -Math.cos(body.yaw);
      wishX = -fz * strafe;
      wishZ = fx * strafe;
      speed = bot.skill.speed * 0.55;
      if (dist > 26) {
        wishX = fx;
        wishZ = fz;
        speed = bot.skill.speed;
      }
      bot.reactionLeft -= dt;
      if (bot.reactionLeft <= 0 && bot.cooldown === 0 && bot.reloadLeft === 0) {
        if (bot.burstLeft <= 0) {
          if (bot.burstPause > 0) {
            bot.burstPause -= dt;
          } else {
            bot.burstLeft = bot.skill.burst[0] + Math.floor(ctx.rng() * (bot.skill.burst[1] - bot.skill.burst[0] + 1));
          }
        }
        if (bot.burstLeft > 0) {
          if (bot.mag <= 0) {
            bot.reloadLeft = bot.weapon.reload;
          } else {
            bot.mag -= 1;
            bot.burstLeft -= 1;
            bot.cooldown = bot.weapon.gap;
            if (bot.burstLeft === 0) bot.burstPause = bot.skill.pause[0] + ctx.rng() * (bot.skill.pause[1] - bot.skill.pause[0]);
            _dir.set(-Math.sin(body.yaw), 0, -Math.cos(body.yaw));
            const spread = bot.weapon.spreadStill + Math.min(1, mover.groundSpeed() / 5.2) * bot.weapon.spreadMove + bot.skill.aim;
            _dir.x += (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) * spread * 1.2;
            _dir.y += Math.tan(body.pitch) + (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) * spread * 1.2;
            _dir.z += (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) * spread * 1.2;
            _dir.normalize();
            const origin = eyeOf(bot);
            hooks.onBotShot(bot, origin, _dir);
          }
        }
      }
    } else {
      // Travel: follow the waypoint path, or investigate a sound.
      let goal = null;
      if (bot.investigate && now < bot.investigateUntil) {
        goal = bot.investigate;
      } else {
        bot.investigate = null;
        if (bot.path.length === 0) setPath(bot, goalNodeFor(bot, ctx));
        const node = world.nodes[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
        if (node) {
          const dx = node.x - body.position.x;
          const dz = node.z - body.position.z;
          if (dx * dx + dz * dz < 0.7) {
            bot.pathIndex += 1;
            if (bot.pathIndex >= bot.path.length) {
              bot.path = [];
              wantCrouch = bot.role === 'defend' && ctx.rng() < 0.5;
            }
          } else {
            goal = node;
          }
        }
      }
      if (goal) {
        _to.set(goal.x - body.position.x, 0, goal.z - body.position.z);
        const len = Math.hypot(_to.x, _to.z) || 1;
        wishX = _to.x / len;
        wishZ = _to.z / len;
        const wantYaw = Math.atan2(-wishX, -wishZ);
        let dyaw = wantYaw - body.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        body.yaw += dyaw * Math.min(1, dt * 8);
        // Stuck? Repath after 1.5 s without progress.
        if (body.position.distanceToSquared(bot.lastProgress) > 0.04) {
          bot.lastProgress.copy(body.position);
          bot.stuckAt = now;
        } else if (now - bot.stuckAt > 1.5) {
          bot.path = [];
          bot.stuckAt = now;
        }
      } else {
        wantCrouch = bot.role === 'defend';
        // Idle scan: sweep the view slowly.
        body.yaw += Math.sin(now * 0.5 + bot.id.length) * dt * 0.25;
      }
    }

    mover.step(dt, wishX, wishZ, speed, false, wantCrouch);
    bot.mesh.position.copy(body.position);
    bot.mesh.rotation.y = body.yaw;
    // Walk bob for the legs (children 4 and 5 are legL and legR).
    const moving = mover.groundSpeed() > 0.5;
    bot.mesh.children[4].position.z = moving ? Math.sin(now * 10) * 0.08 : 0;
    bot.mesh.children[5].position.z = moving ? -Math.sin(now * 10) * 0.08 : 0;
  }

  function step(dt, ctx) {
    for (const bot of list) stepBot(bot, dt, ctx);
    // Cheap separation so bots do not stack on each other.
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!b.alive) continue;
        const pa = a.mover.state.position;
        const pb = b.mover.state.position;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          pa.x -= nx * push;
          pa.z -= nz * push;
          pb.x += nx * push;
          pb.z += nz * push;
        }
      }
    }
  }

  return {
    list,
    hitMeshes,
    step,
    damage,
    resetRound,
    hearShot,
    aliveOf,
    eyeOf,
  };
}
