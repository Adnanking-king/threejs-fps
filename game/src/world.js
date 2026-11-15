// The map: EMBERLINE Foundry, a 52 x 38 m industrial hall with two surge sites.
// Ember spawns south, Frost spawns north. Site A sits west, Site B east, and three
// lanes (west, mid, east) join them. Every box is a collider for walkers and a
// surface a bullet stops on. Plain geometry only: no models, no textures, no files.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITE_RADIUS = 3.6;

function letterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(16,16,20,0.55)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 2.4, 1);
  return sprite;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3d46'), roughness: 0.95, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ color: new THREE.Color('#33363f'), roughness: 0.9, metalness: 0.08 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d5468'), roughness: 0.85, metalness: 0.15 }),
    container: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a38'), roughness: 0.7, metalness: 0.35 }),
    containerCold: new THREE.MeshStandardMaterial({ color: new THREE.Color('#33505e'), roughness: 0.7, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6e7688'), roughness: 0.45, metalness: 0.65 }),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#33363f'), roughness: 0.9, metalness: 0.1 }),
    amberGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }),
    cyanGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.frost) }),
    emberGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) }),
  };

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function strip(width, depth, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), materials[material]);
    mesh.position.set(x, 0.03, z);
    group.add(mesh);
    return mesh;
  }

  function ring(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(SITE_RADIUS - 0.18, SITE_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    group.add(mesh);
    return mesh;
  }

  function pylon(x, z, glowMaterial, color) {
    const base = box(1.6, 0.5, 1.6, x, 0.25, z, 'metal');
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), materials[glowMaterial]);
    core.position.set(x, 1.8, z);
    group.add(core);
    const cap = box(1.1, 0.25, 1.1, x, 3.2, z, 'dark');
    const sprite = letterSprite(color === PALETTE.amber ? 'A' : 'B', color);
    sprite.position.set(x, 4.6, z);
    group.add(sprite);
    const light = new THREE.PointLight(new THREE.Color(color), 22, 14);
    light.position.set(x, 3.4, z);
    scene.add(light);
    return { base, core, cap, sprite, light };
  }

  // Emissive light strips hung over the lanes explain where the light comes from.
  const stripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa2b2'), emissive: new THREE.Color('#dde4f0'), emissiveIntensity: 1.4 });
  for (const [x, z] of [[-10, 8], [0, 0], [10, -8], [-16, -8], [16, 8]]) {
    const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.35), stripMat);
    stripMesh.position.set(x, 5.8, z);
    group.add(stripMesh);
  }

  // Floor and outer walls, 5 m high, open to a dark sky.
  box(52.4, 0.4, 38.4, 0, -0.2, 0, 'floor');
  box(0.4, 5, 38.4, -26.2, 2.5, 0, 'wall');
  box(0.4, 5, 38.4, 26.2, 2.5, 0, 'wall');
  box(52.4, 5, 0.4, 0, 2.5, -19.2, 'wall');
  box(52.4, 5, 0.4, 0, 2.5, 19.2, 'wall');

  // Floor lane strips: amber toward A, cyan toward B, so the map reads at a glance.
  strip(0.5, 26, -20, -2, 'amberGlow');
  strip(0.5, 26, 20, -2, 'cyanGlow');
  strip(40, 0.5, 0, 10, 'emberGlow');

  // Central reactor: the mid landmark, a glowing core on a metal base.
  box(2.6, 0.6, 2.6, 0, 0.3, -2, 'metal');
  const reactor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.2, 12), materials.emberGlow);
  reactor.position.set(0, 2.2, -2);
  group.add(reactor);
  shootables.push(reactor);
  const reactorCollider = new THREE.Box3();
  reactorCollider.min.set(-1.3, 0, -3.3);
  reactorCollider.max.set(1.3, 3.8, -0.7);
  colliders.push(reactorCollider);
  const reactorLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 30, 18);
  reactorLight.position.set(0, 3.6, -2);
  scene.add(reactorLight);

  // Mid cover: containers and crates splitting the middle lane.
  box(3.2, 2.4, 1.4, -7, 1.2, 4, 'container');
  box(3.2, 2.4, 1.4, 7, 1.2, 4, 'containerCold');
  box(1.2, 1.1, 1.2, -4, 0.55, 8, 'crate');
  box(1.2, 1.1, 1.2, 4, 0.55, 8, 'crate');
  box(1.2, 2.2, 1.2, -11, 1.1, -6, 'crate');
  box(1.2, 2.2, 1.2, 11, 1.1, -6, 'crate');
  box(4.4, 0.5, 2.2, 0, 0.25, 12, 'metal');

  // West lane to Site A: staggered crates and a tall container wall.
  box(1.4, 1.1, 1.4, -14, 0.55, 10, 'crate');
  box(1.4, 1.1, 1.4, -17, 0.55, 2, 'crate');
  box(1.4, 2.4, 1.4, -14, 1.2, -4, 'crate');
  box(4.6, 2.6, 1.2, -22, 1.3, -6, 'container');
  box(1.2, 1.1, 3.4, -17, 0.55, -9, 'crate');
  box(2.2, 0.9, 2.2, -23, 0.45, -16, 'crate');

  // East lane to Site B: mirrored cover, cold steel.
  box(1.4, 1.1, 1.4, 14, 0.55, 10, 'crate');
  box(1.4, 1.1, 1.4, 17, 0.55, 2, 'crate');
  box(1.4, 2.4, 1.4, 14, 1.2, -4, 'crate');
  box(4.6, 2.6, 1.2, 22, 1.3, -6, 'containerCold');
  box(1.2, 1.1, 3.4, 17, 0.55, -9, 'crate');
  box(2.2, 0.9, 2.2, 23, 0.45, -16, 'crate');

  // Site A (west) and Site B (east): pylon, plant ring, cover.
  ring(-20, -12, PALETTE.amber);
  pylon(-20, -13.5, 'amberGlow', PALETTE.amber);
  box(3.4, 1.2, 1.2, -23.5, 0.6, -10, 'crate');
  box(1.2, 1.2, 3.2, -16.5, 0.6, -14.5, 'crate');
  ring(20, -12, PALETTE.frost);
  pylon(20, -13.5, 'cyanGlow', PALETTE.frost);
  box(3.4, 1.2, 1.2, 23.5, 0.6, -10, 'crate');
  box(1.2, 1.2, 3.2, 16.5, 0.6, -14.5, 'crate');

  // Spawn cover: low walls behind each spawn so nobody is shot from across the hall.
  box(6, 1.4, 0.8, -6, 0.7, 12.5, 'dark');
  box(6, 1.4, 0.8, 6, 0.7, 12.5, 'dark');
  box(6, 1.4, 0.8, -6, 0.7, -12.5, 'dark');
  box(6, 1.4, 0.8, 6, 0.7, -12.5, 'dark');

  // Barrels: visual cylinders with box colliders.
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
  const barrelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a6740'), roughness: 0.6, metalness: 0.4 });
  for (const [x, z] of [[-9, 12], [9, 12], [-9, -14], [9, -14], [-24, 4], [24, 4]]) {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    shootables.push(barrel);
    const c = new THREE.Box3();
    c.min.set(x - 0.45, 0, z - 0.45);
    c.max.set(x + 0.45, 1.1, z + 0.45);
    colliders.push(c);
  }

  // Light: warm key from the south-east, cool fill from the north, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#4a5468'), new THREE.Color('#2a241c'), 1.25);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffe6b8'), 2.4);
  key.position.set(14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fb8d8'), 0.5);
  fill.position.set(-12, 12, -14);
  scene.add(fill);

  // Waypoints for the bots: nodes and the edges between them.
  const nodes = [
    { x: -3, z: 15 }, { x: 3, z: 15 },
    { x: -3, z: -15 }, { x: 3, z: -15 },
    { x: -8, z: 6 }, { x: 0, z: 6 }, { x: 8, z: 6 },
    { x: -8, z: -2 }, { x: 0, z: -6 }, { x: 8, z: -2 },
    { x: -16, z: 6 }, { x: -20, z: -2 }, { x: -20, z: -12 },
    { x: 16, z: 6 }, { x: 20, z: -2 }, { x: 20, z: -12 },
    { x: -12, z: -8 }, { x: 12, z: -8 },
    { x: -20, z: 2 }, { x: 20, z: 2 },
    { x: 0, z: 12 }, { x: 0, z: -12 },
  ];
  const edges = [
    [0, 4], [0, 20], [1, 5], [1, 20], [20, 4], [20, 5], [20, 6],
    [4, 5], [5, 6], [4, 7], [5, 8], [6, 9],
    [7, 8], [8, 9], [7, 16], [9, 17], [8, 21],
    [4, 10], [10, 18], [18, 11], [11, 12], [16, 11], [16, 7],
    [6, 13], [13, 19], [19, 14], [14, 15], [17, 14], [17, 9],
    [2, 21], [3, 21], [2, 16], [3, 17], [21, 7], [21, 9], [21, 8],
    [12, 11], [15, 14],
  ];
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const dx = nodes[i].x - x;
      const dz = nodes[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Breadth-first path between node indices.
  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of adjacency[current]) {
        if (prev[next] !== -1) continue;
        prev[next] = current;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) {
            node = prev[node];
            path.push(node);
          }
          path.reverse();
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  const sites = {
    A: { id: 'A', x: -20, z: -12, radius: SITE_RADIUS },
    B: { id: 'B', x: 20, z: -12, radius: SITE_RADIUS },
  };

  const spawns = {
    ember: [
      { x: -6, z: 16, yaw: 0 }, { x: -2, z: 16.5, yaw: 0 }, { x: 2, z: 16.5, yaw: 0 },
      { x: 6, z: 16, yaw: 0 }, { x: 0, z: 17.5, yaw: 0 },
    ],
    frost: [
      { x: -6, z: -16, yaw: Math.PI }, { x: -2, z: -16.5, yaw: Math.PI }, { x: 2, z: -16.5, yaw: Math.PI },
      { x: 6, z: -16, yaw: Math.PI }, { x: 0, z: -17.5, yaw: Math.PI },
    ],
  };

  return { colliders, shootables, nodes, adjacency, nearestNode, findPath, sites, spawns, group };
}
