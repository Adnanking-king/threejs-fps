// Weapons and their effects: hitscan definitions, the first-person view model,
// muzzle flash, tracers, impact sparks and the frag grenade. The simulation owns
// the ray and the damage; this module owns the numbers and the presentation.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3, mag: 12, reserve: 48, gap: 0.14, auto: false, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, kick: 0.006, range: 45, slot: 2 },
  smg: { id: 'smg', name: 'Vex-9 SMG', price: 1500, damage: 22, headMult: 3, mag: 28, reserve: 84, gap: 0.075, auto: true, reload: 2.0, spreadStill: 0.004, spreadMove: 0.026, kick: 0.005, range: 35, slot: 1 },
  rifle: { id: 'rifle', name: 'AR-77 Ember', price: 2700, damage: 33, headMult: 3, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 2.1, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 60, slot: 1 },
  sniper: { id: 'sniper', name: 'Longshot', price: 4750, damage: 95, headMult: 2, mag: 5, reserve: 15, gap: 1.1, auto: false, reload: 3.0, spreadStill: 0.0008, spreadMove: 0.05, kick: 0.03, range: 90, slot: 1 },
};
export const ARMOR_PRICE = 650;
export const GRENADE_PRICE = 300;

const MODEL_SPECS = {
  p9: { receiver: [0.05, 0.06, 0.18], barrel: [0.03, 0.03, 0.1], grip: [0.045, 0.09, 0.05], accent: PALETTE.frost },
  smg: { receiver: [0.055, 0.07, 0.26], barrel: [0.032, 0.032, 0.2], grip: [0.05, 0.08, 0.06], accent: PALETTE.amber },
  rifle: { receiver: [0.06, 0.07, 0.32], barrel: [0.032, 0.032, 0.28], grip: [0.055, 0.07, 0.06], accent: PALETTE.amber },
  sniper: { receiver: [0.06, 0.075, 0.4], barrel: [0.028, 0.028, 0.36], grip: [0.055, 0.09, 0.06], accent: PALETTE.frost },
};

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23262e'), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3f4a'), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.35 });

  const model = new THREE.Group();
  model.position.set(0.22, -0.22, -0.48);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.19, -0.9);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 5);
  flashLight.position.set(0.22, -0.17, -0.6);
  camera.add(flashLight);

  const state = {
    id: 'p9', def: WEAPONS.p9, mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
  };

  function buildModel(id) {
    while (model.children.length > 0) model.remove(model.children[0]);
    const spec = MODEL_SPECS[id];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), gripMat);
    barrel.position.set(0, 0.025, -(spec.receiver[2] / 2 + spec.barrel[2] / 2 - 0.04));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.grip), gripMat);
    stock.position.set(0, -0.02, spec.receiver[2] / 2 - 0.02);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, spec.receiver[2] * 0.6), accentMat);
    stripe.position.set(0, 0.042, 0);
    model.add(receiver, barrel, stock, stripe);
  }

  function equip(id, keepAmmo) {
    const def = WEAPONS[id];
    if (!def) return false;
    state.id = id;
    state.def = def;
    if (!keepAmmo) {
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    buildModel(id);
    return true;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.48 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    if (state.flash > 0) flash.rotation.z = state.flash * 6;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  buildModel('p9');

  return {
    state,
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = state.def.id === 'sniper' ? 0.11 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return;
      state.reloadLeft = state.def.reload;
    },
    spread(speed, aimed) {
      const base = state.def.spreadStill + Math.min(1, speed / 5.2) * state.def.spreadMove;
      return aimed ? base * 0.45 : base;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      out.set(0.22, -0.19, -0.9);
      return camera.localToWorld(out);
    },
  };
}

// A pool of short-lived tracer beams: no allocation while firing.
export function createTracers(scene) {
  const pool = [];
  const geo = new THREE.BoxGeometry(0.025, 0.025, 1);
  for (let i = 0; i < 16; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, mat, life: 0 });
  }
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let next = 0;

  return {
    fire(from, to, color) {
      const item = pool[next];
      next = (next + 1) % pool.length;
      dir.subVectors(to, from);
      const length = dir.length();
      if (length < 0.1) return;
      mid.addVectors(from, to).multiplyScalar(0.5);
      item.mesh.position.copy(mid);
      item.mesh.lookAt(to);
      item.mesh.scale.set(1, 1, length);
      item.mat.color.set(color);
      item.mat.opacity = 0.85;
      item.mesh.visible = true;
      item.life = 0.07;
    },
    step(dt) {
      for (const item of pool) {
        if (item.life <= 0) continue;
        item.life -= dt;
        if (item.life <= 0) {
          item.mesh.visible = false;
          item.mat.opacity = 0;
        } else {
          item.mat.opacity = (item.life / 0.07) * 0.85;
        }
      }
    },
  };
}

// A pool of impact sparks: small bright spheres that shrink away.
export function createImpacts(scene) {
  const pool = [];
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  for (let i = 0; i < 10; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27d'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, mat, life: 0 });
  }
  let next = 0;
  return {
    spawn(point) {
      const item = pool[next];
      next = (next + 1) % pool.length;
      item.mesh.position.copy(point);
      item.mesh.scale.setScalar(1);
      item.mat.opacity = 0.95;
      item.mesh.visible = true;
      item.life = 0.14;
    },
    step(dt) {
      for (const item of pool) {
        if (item.life <= 0) continue;
        item.life -= dt;
        if (item.life <= 0) {
          item.mesh.visible = false;
          item.mat.opacity = 0;
        } else {
          const t = item.life / 0.14;
          item.mat.opacity = t * 0.95;
          item.mesh.scale.setScalar(1 + (1 - t) * 1.6);
        }
      }
    },
  };
}

// Frag grenades: a small pool of bouncing projectiles with a timed explosion.
// onExplode(position, owner) is the simulation's damage callback.
export function createGrenades(scene, colliders, onExplode, onBounce) {
  const pool = [];
  const geo = new THREE.SphereGeometry(0.11, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e4d2e'), roughness: 0.5, metalness: 0.5 });
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, vel: new THREE.Vector3(), alive: false, timer: 0, owner: null });
  }
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const blast = new THREE.Mesh(blastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color('#ffb347'), 0, 14);
  scene.add(blastLight);
  let blastLife = 0;
  const probe = new THREE.Box3();
  const nextPos = new THREE.Vector3();

  function explode(item) {
    const pos = item.mesh.position;
    item.alive = false;
    item.mesh.visible = false;
    blast.position.copy(pos);
    blast.scale.setScalar(0.4);
    blast.visible = true;
    blastLife = 0.3;
    blastLight.position.copy(pos);
    blastLight.intensity = 60;
    onExplode(pos, item.owner);
  }

  return {
    throw(from, direction, owner) {
      const item = pool.find((g) => !g.alive) || pool[0];
      item.alive = true;
      item.owner = owner;
      item.timer = 1.6;
      item.mesh.position.copy(from);
      item.mesh.visible = true;
      item.vel.copy(direction).multiplyScalar(13);
      item.vel.y += 4.5;
    },
    step(dt) {
      for (const item of pool) {
        if (!item.alive) continue;
        item.timer -= dt;
        item.vel.y -= 14 * dt;
        const next = nextPos.copy(item.mesh.position).addScaledVector(item.vel, dt);
        probe.min.set(next.x - 0.11, next.y - 0.11, next.z - 0.11);
        probe.max.set(next.x + 0.11, next.y + 0.11, next.z + 0.11);
        let blocked = false;
        for (const c of colliders) {
          if (probe.intersectsBox(c)) { blocked = true; break; }
        }
        if (next.y < 0.11) {
          next.y = 0.11;
          if (Math.abs(item.vel.y) > 1.5) onBounce();
          item.vel.y = Math.abs(item.vel.y) * 0.42;
          item.vel.x *= 0.7;
          item.vel.z *= 0.7;
        } else if (blocked) {
          item.vel.multiplyScalar(-0.35);
          onBounce();
        }
        item.mesh.position.copy(next);
        if (item.timer <= 0) explode(item);
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const t = Math.max(0, blastLife / 0.3);
        blast.scale.setScalar(0.4 + (1 - t) * 5.2);
        blastMat.opacity = t * 0.85;
        blastLight.intensity = t * 60;
        if (blastLife <= 0) {
          blast.visible = false;
          blastLight.intensity = 0;
        }
      }
    },
    reset() {
      for (const item of pool) {
        item.alive = false;
        item.mesh.visible = false;
      }
      blastLife = 0;
      blast.visible = false;
      blastLight.intensity = 0;
    },
  };
}
