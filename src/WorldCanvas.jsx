import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothStep = (edge0, edge1, value) => {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

function terrainHeight(x, z) {
  const edgeLift = smoothStep(12, 35, Math.abs(x));
  const farLift = smoothStep(-10, -47, z);
  const rolling = Math.sin(x * 0.15 + z * 0.035) * 0.33 + Math.cos(z * 0.18 - x * 0.06) * 0.25;
  const distantRidge = Math.max(0, Math.sin(x * 0.115 + z * 0.04) * 0.62 + Math.cos(x * 0.07 - 0.8) * 0.38) * 3.2 * farLift;
  return rolling + edgeLift * farLift * 1.9 + distantRidge;
}

function makeRidge(scene, color, z, height, phase, geometries, materials) {
  const shape = new THREE.Shape();
  shape.moveTo(-58, -2);
  for (let step = 0; step <= 100; step += 1) {
    const x = -58 + step * 1.16;
    const broad = (Math.sin(x * 0.12 + phase) + 1) * 0.5;
    const detail = (Math.sin(x * 0.37 + phase * 2.3) + 1) * 0.5;
    const y = 4.2 + broad * height + detail * height * 0.32;
    shape.lineTo(x, y);
  }
  shape.lineTo(58, -2);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  geometries.push(geometry);
  materials.push(material);
  const ridge = new THREE.Mesh(geometry, material);
  ridge.position.set(0, -0.5, z);
  scene.add(ridge);
}

function makeTerrain(scene, geometries, materials) {
  const segmentsX = 105;
  const segmentsZ = 85;
  const width = 84;
  const depth = 68;
  const positions = [];
  const colors = [];
  const indices = [];
  const lowColor = new THREE.Color('#213c32');
  const midColor = new THREE.Color('#344f3e');
  const highColor = new THREE.Color('#697b69');

  for (let row = 0; row <= segmentsZ; row += 1) {
    const z = 18 - (row / segmentsZ) * depth;
    for (let col = 0; col <= segmentsX; col += 1) {
      const x = -width / 2 + (col / segmentsX) * width;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      const elevation = clamp((y + 0.8) / 4.2, 0, 1);
      const edgeShade = Math.sin((col / segmentsX) * Math.PI) * 0.09;
      const color = new THREE.Color().lerpColors(lowColor, midColor, clamp(elevation * 1.3 + edgeShade, 0, 1));
      if (elevation > 0.58) color.lerp(highColor, (elevation - 0.58) * 0.75);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < segmentsZ; row += 1) {
    for (let col = 0; col < segmentsX; col += 1) {
      const a = row * (segmentsX + 1) + col;
      const b = a + segmentsX + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometries.push(geometry);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  materials.push(material);
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function makeTrail(scene, geometries, materials) {
  const positions = [];
  const indices = [];
  const rows = 48;
  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const z = 9 - t * 20;
    const centerX = Math.sin((z + 13) * 0.11) * 0.55;
    const halfWidth = 1.75 - t * 0.5;
    for (const side of [-1, 1]) {
      const x = centerX + side * halfWidth;
      positions.push(x, terrainHeight(x, z) + 0.045, z);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    const current = row * 2;
    const next = current + 2;
    indices.push(current, current + 1, next, current + 1, next + 1, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometries.push(geometry);
  const material = new THREE.MeshStandardMaterial({ color: '#77715e', roughness: 1, side: THREE.DoubleSide });
  materials.push(material);
  const trail = new THREE.Mesh(geometry, material);
  trail.receiveShadow = true;
  scene.add(trail);
}

function makeForest(scene, variant, geometries, materials) {
  let seed = variant === 'green' ? 3291 : variant === 'violet' ? 1047 : 7201;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const trees = [];
  for (let attempt = 0; attempt < 260 && trees.length < 164; attempt += 1) {
    const x = (random() * 2 - 1) * 39;
    const z = -43 + random() * 57;
    const trailX = Math.sin((z + 13) * 0.11) * 0.55;
    const inLake = z < -8 && z > -29 && Math.abs(x) < 20;
    const onTrail = z > -12 && Math.abs(x - trailX) < 3.1;
    const openStart = z > 0 && Math.abs(x) < 4.8;
    const guideClearing = Math.hypot(x - 8.8, z - 4.6) < 2.8;
    if (inLake || onTrail || openStart || guideClearing) continue;
    trees.push({ x, z, size: 0.67 + random() * 0.65, yaw: random() * Math.PI * 2 });
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.19, 2.2, 6);
  const foliageGeometry = new THREE.ConeGeometry(1, 2, 7, 1);
  geometries.push(trunkGeometry, foliageGeometry);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#493e32', roughness: 1 });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: variant === 'green' ? '#345e45' : variant === 'violet' ? '#385545' : '#2e5847', roughness: 0.92, flatShading: true });
  const foliageMidMaterial = new THREE.MeshStandardMaterial({ color: variant === 'green' ? '#436d4b' : variant === 'violet' ? '#425b50' : '#3a684f', roughness: 0.9, flatShading: true });
  const foliageTopMaterial = new THREE.MeshStandardMaterial({ color: variant === 'violet' ? '#536b5a' : '#4a7657', roughness: 0.88, flatShading: true });
  materials.push(trunkMaterial, foliageMaterial, foliageMidMaterial, foliageTopMaterial);

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const lowerCanopy = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, trees.length);
  const middleCanopy = new THREE.InstancedMesh(foliageGeometry, foliageMidMaterial, trees.length);
  const upperCanopy = new THREE.InstancedMesh(foliageGeometry, foliageTopMaterial, trees.length);
  const temp = new THREE.Object3D();
  const groundAt = (tree) => terrainHeight(tree.x, tree.z);

  trees.forEach((tree, index) => {
    const ground = groundAt(tree);
    const size = tree.size;
    temp.position.set(tree.x, ground + 0.96 * size, tree.z);
    temp.rotation.set(0, tree.yaw, 0);
    temp.scale.set(0.7 * size, 0.9 * size, 0.7 * size);
    temp.updateMatrix();
    trunks.setMatrixAt(index, temp.matrix);

    const layers = [
      { mesh: lowerCanopy, y: 2.15, scale: 1.08 },
      { mesh: middleCanopy, y: 2.88, scale: 0.82 },
      { mesh: upperCanopy, y: 3.55, scale: 0.58 },
    ];
    layers.forEach(({ mesh, y, scale }, layerIndex) => {
      temp.position.set(tree.x, ground + y * size, tree.z);
      temp.rotation.set(0, tree.yaw + layerIndex * 0.28, 0);
      temp.scale.set(scale * size, (1.3 - layerIndex * 0.12) * size, scale * size);
      temp.updateMatrix();
      mesh.setMatrixAt(index, temp.matrix);
    });
  });

  [trunks, lowerCanopy, middleCanopy, upperCanopy].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
  return trees;
}

function makeWater(scene, variant, geometries, materials) {
  const geometry = new THREE.PlaneGeometry(40, 18, 72, 28);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const originalY = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i += 1) originalY[i] = positions.getY(i);
  geometries.push(geometry);
  const material = new THREE.MeshPhysicalMaterial({
    color: variant === 'violet' ? '#506f82' : '#3d687a',
    metalness: 0.22,
    roughness: 0.24,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
  });
  materials.push(material);
  const lake = new THREE.Mesh(geometry, material);
  lake.position.set(0, -0.24, -19.2);
  lake.receiveShadow = true;
  scene.add(lake);
  return { geometry, originalY };
}

const MAP_LANDMARKS = [
  { id: 'trailhead', title: 'Trailhead', kind: 'Start', x: 0, z: 13, detail: 'Your starting point.' },
  { id: 'guide', title: 'Mara, trail guide', kind: 'Character', x: 8.8, z: 4.6, detail: 'Ask Mara about the lake and the fireflies.' },
  { id: 'campfire', title: 'Campfire', kind: 'Interaction', x: 6.2, z: 3.3, detail: 'Warm up beside the fire.' },
  { id: 'trail-sign', title: 'Trail sign', kind: 'Field note', x: -4.2, z: 5.5, detail: 'A hand-painted sign points out paths around the lake.' },
  { id: 'lantern', title: 'Trail lantern', kind: 'Interaction', x: 4.5, z: -6.4, detail: 'A lantern marks the bend in the path.' },
  { id: 'shore', title: 'The quiet shore', kind: 'Field note', x: -9, z: -9, detail: 'A calm view across the water.' },
  { id: 'trail', title: 'Pine trail', kind: 'Field note', x: 2.6, z: -2.6, detail: 'A narrow route beneath the pines.' },
  { id: 'overlook', title: 'Moon overlook', kind: 'Field note', x: 15.8, z: -7.7, detail: 'A rise above the lake.' },
];

function mapPoint(x, z) {
  return { x: 14 + ((x + 40) / 80) * 292, y: 13 + ((18 - z) / 68) * 234 };
}

function makeWorld(scene, variant, geometries, materials) {
  const sky = variant === 'violet' ? '#8796b2' : variant === 'green' ? '#8ea6a1' : '#99a8b5';
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.FogExp2(sky, 0.012);

  const hemisphere = new THREE.HemisphereLight('#d9e6e1', '#263a30', 2.1);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffe0b2', 2.15);
  sun.position.set(-24, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  makeRidge(scene, '#586a78', -57, 11, 1.7, geometries, materials);
  makeRidge(scene, '#667a7d', -51, 8.3, 4.2, geometries, materials);
  makeRidge(scene, '#708477', -45, 5.6, 2.6, geometries, materials);
  makeTerrain(scene, geometries, materials);
  makeTrail(scene, geometries, materials);
  const trees = makeForest(scene, variant, geometries, materials);
  const water = makeWater(scene, variant, geometries, materials);

  const moonGeometry = new THREE.SphereGeometry(0.82, 20, 20);
  const moonMaterial = new THREE.MeshBasicMaterial({ color: '#f4e7c7' });
  geometries.push(moonGeometry);
  materials.push(moonMaterial);
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(17, 15, -47);
  scene.add(moon);

  return { trees, water, hemisphere, sun, skyColor: new THREE.Color(sky) };
}

function makeSampleInteractions(scene, geometries, materials) {
  const targets = [];
  const fireflies = [];
  const hotspots = [];
  const pickMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, colorWrite: false, depthWrite: false });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#f0d995', transparent: true, opacity: 0.86 });
  const markerGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffe7a6' });
  const markerRingGeometry = new THREE.TorusGeometry(0.28, 0.025, 6, 20);
  const markerStemGeometry = new THREE.CylinderGeometry(0.018, 0.045, 0.5, 7);
  const markerOrbGeometry = new THREE.SphereGeometry(0.1, 10, 8);
  geometries.push(markerRingGeometry, markerStemGeometry, markerOrbGeometry);
  materials.push(pickMaterial, markerMaterial, markerGlowMaterial);

  function addTarget(interaction, x, y, z, radius = 0.72) {
    const target = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), pickMaterial);
    geometries.push(target.geometry);
    target.position.set(x, y, z);
    target.userData.interaction = interaction;
    scene.add(target);
    targets.push(target);
    return target;
  }

  function addHotspot({ id, title, body, x, z }) {
    const ground = terrainHeight(x, z);
    const marker = new THREE.Group();
    marker.position.set(x, ground + 0.08, z);
    const ring = new THREE.Mesh(markerRingGeometry, markerMaterial);
    ring.rotation.x = -Math.PI / 2;
    const stem = new THREE.Mesh(markerStemGeometry, markerMaterial);
    stem.position.y = 0.35;
    const orb = new THREE.Mesh(markerOrbGeometry, markerGlowMaterial);
    orb.position.y = 0.72;
    marker.add(ring, stem, orb);
    scene.add(marker);
    const target = addTarget({ type: 'story', id, title, body, marker, orb }, x, ground + 0.85, z, 0.72);
    hotspots.push({ id, marker, orb, target });
  }

  addHotspot({ id: 'shore', title: 'The quiet shore', body: 'At dusk, the lake holds the last light of the mountains. The old footpath follows this edge toward a hidden overlook.', x: -9, z: -9 });
  addHotspot({ id: 'trail', title: 'Pine trail', body: 'A narrow trail winds between the pines. Look for a lantern where the path bends toward the water.', x: 2.6, z: -2.6 });
  addHotspot({ id: 'overlook', title: 'Moon overlook', body: 'From this small rise, the lake mirrors the sky. The fireflies gather here as the evening grows quiet.', x: 15.8, z: -7.7 });

  const stoneGeometry = new THREE.SphereGeometry(0.18, 8, 6);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#77796f', roughness: 0.95 });
  const logGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.95, 7);
  const logMaterial = new THREE.MeshStandardMaterial({ color: '#49392d', roughness: 1 });
  const flameGeometry = new THREE.ConeGeometry(0.22, 0.72, 7);
  const flameOuterMaterial = new THREE.MeshBasicMaterial({ color: '#e96d36', transparent: true, opacity: 0.9 });
  const flameInnerMaterial = new THREE.MeshBasicMaterial({ color: '#ffd26b', transparent: true, opacity: 0.94 });
  const postGeometry = new THREE.CylinderGeometry(0.075, 0.11, 1.65, 7);
  const woodMaterial = new THREE.MeshStandardMaterial({ color: '#514235', roughness: 0.98 });
  const signGeometry = new THREE.BoxGeometry(1.1, 0.66, 0.12);
  const signMaterial = new THREE.MeshStandardMaterial({ color: '#7b6549', roughness: 0.92 });
  const lanternGeometry = new THREE.BoxGeometry(0.33, 0.42, 0.3);
  const lanternFrameMaterial = new THREE.MeshStandardMaterial({ color: '#34443a', metalness: 0.48, roughness: 0.45 });
  const lanternGlassMaterial = new THREE.MeshStandardMaterial({ color: '#f2bd66', emissive: '#f2bd66', emissiveIntensity: 0, roughness: 0.28, transparent: true, opacity: 0.9 });
  geometries.push(stoneGeometry, logGeometry, flameGeometry, postGeometry, signGeometry, lanternGeometry);
  materials.push(stoneMaterial, logMaterial, flameOuterMaterial, flameInnerMaterial, woodMaterial, signMaterial, lanternFrameMaterial, lanternGlassMaterial);

  const firePosition = { x: 6.2, z: 3.3 };
  const fireGround = terrainHeight(firePosition.x, firePosition.z);
  const fireGroup = new THREE.Group();
  fireGroup.position.set(firePosition.x, fireGround, firePosition.z);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(Math.cos(angle) * 0.55, 0.12, Math.sin(angle) * 0.42);
    stone.scale.set(1.35, 0.72, 0.95);
    fireGroup.add(stone);
  }
  const logOne = new THREE.Mesh(logGeometry, logMaterial);
  logOne.position.set(0, 0.18, 0);
  logOne.rotation.z = Math.PI / 2;
  const logTwo = new THREE.Mesh(logGeometry, logMaterial);
  logTwo.position.set(0, 0.2, 0);
  logTwo.rotation.set(0.24, 0.34, Math.PI / 2);
  const flameOuter = new THREE.Mesh(flameGeometry, flameOuterMaterial);
  flameOuter.position.y = 0.56;
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.46, 7), flameInnerMaterial);
  geometries.push(flameInner.geometry);
  flameInner.position.y = 0.42;
  flameOuter.visible = false;
  flameInner.visible = false;
  fireGroup.add(logOne, logTwo, flameOuter, flameInner);
  scene.add(fireGroup);
  const fireLight = new THREE.PointLight('#ff9b57', 0, 9, 2);
  fireLight.position.set(firePosition.x, fireGround + 0.86, firePosition.z);
  scene.add(fireLight);
  addTarget({ type: 'fire', title: 'Campfire', group: fireGroup, light: fireLight, flames: [flameOuter, flameInner] }, firePosition.x, fireGround + 0.7, firePosition.z, 1.05);

  const guidePosition = { x: 8.8, z: 4.6 };
  const guideGround = terrainHeight(guidePosition.x, guidePosition.z);
  const guideGroup = new THREE.Group();
  guideGroup.position.set(guidePosition.x, guideGround, guidePosition.z);
  guideGroup.rotation.y = Math.PI;
  const guideCoatGeometry = new THREE.CapsuleGeometry(0.34, 0.72, 4, 8);
  const guideHeadGeometry = new THREE.SphereGeometry(0.25, 12, 10);
  const guideArmGeometry = new THREE.CylinderGeometry(0.09, 0.11, 0.68, 8);
  const guideLegGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.48, 7);
  const guideHatGeometry = new THREE.ConeGeometry(0.3, 0.25, 8);
  const guidePackGeometry = new THREE.BoxGeometry(0.42, 0.5, 0.24);
  const guideCoatMaterial = new THREE.MeshStandardMaterial({ color: '#526d55', roughness: 0.92, flatShading: true });
  const guideSkinMaterial = new THREE.MeshStandardMaterial({ color: '#d6ad83', roughness: 0.95 });
  const guideHatMaterial = new THREE.MeshStandardMaterial({ color: '#b38c5a', roughness: 1, flatShading: true });
  const guidePackMaterial = new THREE.MeshStandardMaterial({ color: '#594636', roughness: 1, flatShading: true });
  const guideScarfMaterial = new THREE.MeshStandardMaterial({ color: '#d6c27b', roughness: 0.8 });
  const guideEyeMaterial = new THREE.MeshBasicMaterial({ color: '#28352b' });
  const scarfGeometry = new THREE.TorusGeometry(0.23, 0.065, 6, 14);
  const eyeGeometry = new THREE.SphereGeometry(0.025, 6, 6);
  const guideMouthGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const guideMouthMaterial = new THREE.MeshBasicMaterial({ color: '#68463a' });
  geometries.push(guideCoatGeometry, guideHeadGeometry, guideArmGeometry, guideLegGeometry, guideHatGeometry, guidePackGeometry, guideMouthGeometry, scarfGeometry, eyeGeometry);
  materials.push(guideCoatMaterial, guideSkinMaterial, guideHatMaterial, guidePackMaterial, guideScarfMaterial, guideEyeMaterial, guideMouthMaterial);
  const guideCoat = new THREE.Mesh(guideCoatGeometry, guideCoatMaterial);
  guideCoat.position.y = 1.08;
  guideGroup.add(guideCoat);
  const guideHead = new THREE.Mesh(guideHeadGeometry, guideSkinMaterial);
  guideHead.position.y = 1.91;
  guideGroup.add(guideHead);
  const guideHat = new THREE.Mesh(guideHatGeometry, guideHatMaterial);
  guideHat.position.y = 2.17;
  guideGroup.add(guideHat);
  const guideScarf = new THREE.Mesh(scarfGeometry, guideScarfMaterial);
  guideScarf.rotation.x = Math.PI / 2;
  guideScarf.position.y = 1.58;
  guideGroup.add(guideScarf);
  const guideMouth = new THREE.Mesh(guideMouthGeometry, guideMouthMaterial);
  guideMouth.position.set(0, 1.82, -0.244);
  guideMouth.scale.set(0.8, 0.2, 0.3);
  guideGroup.add(guideMouth);
  const guidePack = new THREE.Mesh(guidePackGeometry, guidePackMaterial);
  guidePack.position.set(0, 1.18, 0.31);
  guideGroup.add(guidePack);
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(guideArmGeometry, guideCoatMaterial);
    arm.position.set(side * 0.39, 1.14, 0);
    arm.rotation.z = side * -0.16;
    guideGroup.add(arm);
    const leg = new THREE.Mesh(guideLegGeometry, guidePackMaterial);
    leg.position.set(side * 0.15, 0.31, 0);
    guideGroup.add(leg);
    const eye = new THREE.Mesh(eyeGeometry, guideEyeMaterial);
    eye.position.set(side * 0.085, 1.94, -0.235);
    guideGroup.add(eye);
  });
  scene.add(guideGroup);
  addTarget({
    type: 'character',
    title: 'Talk to Mara',
    character: 'Mara, trail guide',
    body: 'Evening, traveler. This trail is quieter than it looks, but there are a few things worth finding.',
    choices: [
      { label: 'Ask about the lake', response: 'The lake reflects the last light long after the sun slips behind the ridge. Follow the shore trail for the best view.' },
      { label: 'Ask about the fireflies', response: 'They gather near the overlook after dusk. Look for their glow between the pines, and take your time.' },
    ],
  }, guidePosition.x, guideGround + 1.2, guidePosition.z, 0.85);

  const signPosition = { x: -4.2, z: 5.5 };
  const signGround = terrainHeight(signPosition.x, signPosition.z);
  const signGroup = new THREE.Group();
  signGroup.position.set(signPosition.x, signGround, signPosition.z);
  const signPost = new THREE.Mesh(postGeometry, woodMaterial);
  signPost.position.y = 0.84;
  const signBoard = new THREE.Mesh(signGeometry, signMaterial);
  signBoard.position.set(0, 1.35, 0);
  signBoard.rotation.y = -0.12;
  signGroup.add(signPost, signBoard);
  scene.add(signGroup);
  addTarget({ type: 'story', id: 'trail-sign', title: 'Trail sign', body: 'The hand-painted sign points to the shoreline, the pine trail, and a quiet overlook above the lake.', marker: signGroup }, signPosition.x, signGround + 1.25, signPosition.z, 0.82);

  const lanternPosition = { x: 4.5, z: -6.4 };
  const lanternGround = terrainHeight(lanternPosition.x, lanternPosition.z);
  const lanternGroup = new THREE.Group();
  lanternGroup.position.set(lanternPosition.x, lanternGround, lanternPosition.z);
  const lanternPost = new THREE.Mesh(postGeometry, woodMaterial);
  lanternPost.position.y = 0.84;
  const lanternFrame = new THREE.Mesh(lanternGeometry, lanternFrameMaterial);
  lanternFrame.position.y = 1.74;
  const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.29, 0.2), lanternGlassMaterial);
  geometries.push(lanternGlass.geometry);
  lanternGlass.position.y = 1.74;
  lanternGroup.add(lanternPost, lanternFrame, lanternGlass);
  scene.add(lanternGroup);
  const lanternLight = new THREE.PointLight('#ffc978', 0, 5, 2);
  lanternLight.position.set(lanternPosition.x, lanternGround + 1.75, lanternPosition.z);
  scene.add(lanternLight);
  addTarget({ type: 'lantern', title: 'Trail lantern', light: lanternLight, glass: lanternGlass, group: lanternGroup }, lanternPosition.x, lanternGround + 1.7, lanternPosition.z, 0.7);

  const fireflyMaterial = new THREE.MeshBasicMaterial({ color: '#d8ff9c' });
  const fireflyHaloMaterial = new THREE.MeshBasicMaterial({ color: '#baff71', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const fireflyGeometry = new THREE.SphereGeometry(0.085, 10, 8);
  const haloGeometry = new THREE.SphereGeometry(0.24, 10, 8);
  geometries.push(fireflyGeometry, haloGeometry);
  materials.push(fireflyMaterial, fireflyHaloMaterial);
  [
    { x: -1.2, z: 5.3, phase: 0.2 },
    { x: 2.8, z: -6.2, phase: 2.1 },
    { x: -2.5, z: -10, phase: 4.3 },
  ].forEach((position, index) => {
    const baseY = terrainHeight(position.x, position.z) + 1.25;
    const group = new THREE.Group();
    group.position.set(position.x, baseY, position.z);
    const halo = new THREE.Mesh(haloGeometry, fireflyHaloMaterial);
    const orb = new THREE.Mesh(fireflyGeometry, fireflyMaterial);
    group.add(halo, orb);
    scene.add(group);
    const target = addTarget({ type: 'firefly', id: `firefly-${index + 1}`, title: 'Firefly', group }, position.x, baseY, position.z, 0.6);
    fireflies.push({ group, target, baseY, phase: position.phase, collected: false });
  });

  return { targets, fireflies, hotspots, fire: { light: fireLight, flames: [flameOuter, flameInner] }, lantern: { light: lanternLight, glass: lanternGlass, material: lanternGlassMaterial }, fireflyCount: fireflies.length };
}

export default function WorldCanvas({ variant = 'blue', title = 'Stillwater at dusk' }) {
  const mountRef = useRef(null);
  const sceneActionsRef = useRef({});
  const sceneOptionsRef = useRef({ goldenHour: false, mistEnabled: false });
  const soundEnabledRef = useRef(true);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [collectedCount, setCollectedCount] = useState(0);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [discoveredStoryIds, setDiscoveredStoryIds] = useState([]);
  const [interactionPrompt, setInteractionPrompt] = useState('');
  const [activeStory, setActiveStory] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapFocusId, setMapFocusId] = useState(null);
  const [mapPlayerPosition, setMapPlayerPosition] = useState({ x: 0, z: 13, yaw: 0 });
  const [toast, setToast] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [goldenHour, setGoldenHour] = useState(false);
  const [mistEnabled, setMistEnabled] = useState(false);
  const activeStoryRef = useRef(null);
  const mapOpenRef = useRef(false);
  const toggleWorldMapRef = useRef(() => {});

  sceneOptionsRef.current = { goldenHour, mistEnabled };
  soundEnabledRef.current = soundEnabled;
  activeStoryRef.current = activeStory;
  mapOpenRef.current = mapOpen;

  function openWorldMap(focusId = null) {
    setMapFocusId(focusId);
    setMapPlayerPosition(sceneActionsRef.current.getPlayerPosition?.() || { x: 0, z: 13, yaw: 0 });
    setMapOpen(true);
    setActiveStory(null);
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  function resumeWorldControls() {
    if (exploring) sceneActionsRef.current.enterWorld?.();
  }

  function closeFieldNote() {
    setActiveStory(null);
    resumeWorldControls();
  }

  function closeWorldMap() {
    setMapOpen(false);
    setMapFocusId(null);
    resumeWorldControls();
  }

  function toggleWorldMap() {
    if (mapOpenRef.current) {
      closeWorldMap();
      return;
    }
    openWorldMap();
  }

  toggleWorldMapRef.current = toggleWorldMap;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    let animationFrame = 0;
    let locked = false;
    let exploringWorld = false;
    let dragLooking = false;
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let ignoreClickUntil = 0;
    let yaw = 0;
    let pitch = -0.015;
    let previousTime = performance.now();
    let focusedTarget = null;
    let fireOn = false;
    let lanternOn = false;
    let collectedFireflyCount = 0;
    let birdTimer = 8;
    let footstepTimer = 0;
    let mapPositionTimer = 0;
    let verticalVelocity = 0;
    let grounded = true;
    let jumpQueued = false;
    let audioContext = null;
    let audioMaster = null;
    let toastTimer = null;
    const keys = new Set();
    const geometries = [];
    const materials = [];
    const stones = [];
    const ripples = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(63, 1, 0.1, 180);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, terrainHeight(0, 13) + 1.68, 13);
    camera.rotation.set(pitch, yaw, 0);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      mount.innerHTML = '<div class="world-fallback">WebGL is unavailable in this browser.</div>';
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'world-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D alpine forest world. Click to enter, then use WASD and mouse to explore.');
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    setCollectedCount(0);
    setDiscoveredCount(0);
    setDiscoveredStoryIds([]);
    setPointerLocked(false);
    setExploring(false);
    setInteractionPrompt('');
    setActiveStory(null);
    setMapOpen(false);
    setMapFocusId(null);
    setMapPlayerPosition({ x: 0, z: 13, yaw: 0 });
    setToast('');

    const world = makeWorld(scene, variant, geometries, materials);
    const { trees, water } = world;
    const interactions = makeSampleInteractions(scene, geometries, materials);
    const lakeShape = (x, z) => z < -10.7 && z > -27.7 && Math.abs(x) < 18.6;
    const centerRaycaster = new THREE.Raycaster();
    centerRaycaster.far = 5.2;
    const clickRaycaster = new THREE.Raycaster();
    const hitTree = (x, z) => trees.some((tree) => {
      const dx = x - tree.x;
      const dz = z - tree.z;
      return dx * dx + dz * dz < (0.42 * tree.size + 0.38) ** 2;
    });

    function applyVisualSettings(isGoldenHour, hasMist) {
      const sky = isGoldenHour ? new THREE.Color('#c29473') : world.skyColor;
      scene.background.copy(sky);
      scene.fog.color.copy(hasMist ? new THREE.Color('#8c9b97') : sky);
      scene.fog.density = hasMist ? 0.027 : 0.012;
      world.sun.color.set(isGoldenHour ? '#ffd08c' : '#ffe0b2');
      world.sun.intensity = isGoldenHour ? 2.8 : 2.15;
      world.hemisphere.color.set(isGoldenHour ? '#f1c79f' : '#d9e6e1');
      world.hemisphere.groundColor.set(isGoldenHour ? '#433b32' : '#263a30');
      world.hemisphere.intensity = isGoldenHour ? 1.8 : 2.1;
    }

    function ensureAudio() {
      if (!soundEnabledRef.current) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) {
        audioContext = new AudioContextClass();
        audioMaster = audioContext.createGain();
        audioMaster.gain.value = 0.54;
        audioMaster.connect(audioContext.destination);
        const sampleCount = audioContext.sampleRate * 2;
        const noiseBuffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let index = 0; index < sampleCount; index += 1) channel[index] = (Math.random() * 2 - 1) * 0.32;
        const wind = audioContext.createBufferSource();
        wind.buffer = noiseBuffer;
        wind.loop = true;
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 430;
        const windGain = audioContext.createGain();
        windGain.gain.value = 0.065;
        wind.connect(filter).connect(windGain).connect(audioMaster);
        wind.start();
      }
      if (audioContext.state === 'suspended') audioContext.resume();
    }

    function setAudioEnabled(enabled) {
      soundEnabledRef.current = enabled;
      if (audioContext && audioMaster) {
        if (enabled && audioContext.state === 'suspended') audioContext.resume();
        audioMaster.gain.setTargetAtTime(enabled ? 0.54 : 0, audioContext.currentTime, 0.08);
      }
    }

    function playTone(frequency, duration = 0.13, type = 'sine', volume = 0.045, delay = 0) {
      if (!soundEnabledRef.current) return;
      ensureAudio();
      if (!audioContext || !audioMaster) return;
      const now = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * 0.72), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(audioMaster);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    }

    function showToast(message) {
      setToast(message);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(''), 2600);
    }

    function createRipple(x, z) {
      const geometry = new THREE.RingGeometry(0.12, 0.2, 28);
      const material = new THREE.MeshBasicMaterial({ color: '#d9f5e8', transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, -0.105, z);
      scene.add(mesh);
      ripples.push({ mesh, age: 0, duration: 1.35 });
      playTone(560, 0.18, 'sine', 0.05);
    }

    function removeStone(index) {
      const [stone] = stones.splice(index, 1);
      if (!stone) return;
      scene.remove(stone.mesh);
      stone.mesh.geometry.dispose();
      stone.mesh.material.dispose();
    }

    function throwStone() {
      const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const position = camera.position.clone().addScaledVector(direction, 0.55);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 8),
        new THREE.MeshStandardMaterial({ color: '#b9b3a0', roughness: 0.88 }),
      );
      mesh.position.copy(position);
      scene.add(mesh);
      stones.push({ mesh, velocity: direction.multiplyScalar(10).add(new THREE.Vector3(0, 2.2, 0)), age: 0 });
      playTone(190, 0.08, 'triangle', 0.022);
    }

    const discoveredStories = new Set();
    function activateTarget(target) {
      const item = target?.userData?.interaction;
      if (!item || !target.visible) return;
      if (item.type === 'firefly') {
        const firefly = interactions.fireflies.find((entry) => entry.target === target);
        if (!firefly || firefly.collected) return;
        firefly.collected = true;
        firefly.group.visible = false;
        target.visible = false;
        collectedFireflyCount += 1;
        setCollectedCount(collectedFireflyCount);
        playTone(880, 0.22, 'sine', 0.05);
        playTone(1320, 0.28, 'sine', 0.035, 0.1);
        showToast(collectedFireflyCount === interactions.fireflyCount ? 'All three fireflies found' : `Firefly found · ${collectedFireflyCount} of ${interactions.fireflyCount}`);
        return;
      }
      if (item.type === 'story') {
        if (!discoveredStories.has(item.id)) {
          discoveredStories.add(item.id);
          setDiscoveredCount(discoveredStories.size);
          setDiscoveredStoryIds([...discoveredStories]);
        }
        setActiveStory({ title: item.title, body: item.body });
        if (document.pointerLockElement) document.exitPointerLock?.();
        playTone(660, 0.12, 'sine', 0.03);
        return;
      }
      if (item.type === 'character') {
        setActiveStory({ title: item.character, body: item.body, kind: 'conversation', choices: item.choices });
        if (document.pointerLockElement) document.exitPointerLock?.();
        playTone(660, 0.12, 'sine', 0.03);
        return;
      }
      if (item.type === 'fire') {
        fireOn = !fireOn;
        item.flames.forEach((flame) => { flame.visible = fireOn; });
        item.light.intensity = fireOn ? 2.2 : 0;
        showToast(fireOn ? 'Campfire lit' : 'Campfire resting');
        playTone(fireOn ? 340 : 260, 0.18, 'triangle', 0.035);
        return;
      }
      if (item.type === 'lantern') {
        lanternOn = !lanternOn;
        item.light.intensity = lanternOn ? 1.3 : 0;
        item.glass.material.emissiveIntensity = lanternOn ? 1.4 : 0;
        showToast(lanternOn ? 'Lantern switched on' : 'Lantern switched off');
        playTone(lanternOn ? 520 : 300, 0.12, 'sine', 0.03);
      }
    }

    function enterWorld() {
      if (!exploringWorld) {
        exploringWorld = true;
        setExploring(true);
      }
      ensureAudio();
      renderer.domElement.focus({ preventScroll: true });
      try {
        const lockRequest = renderer.domElement.requestPointerLock?.();
        lockRequest?.catch(() => setPointerLocked(false));
      } catch {
        setPointerLocked(false);
      }
    }

    sceneActionsRef.current = {
      setVisuals: applyVisualSettings,
      setSound: setAudioEnabled,
      resumeAudio: ensureAudio,
      enterWorld,
      getPlayerPosition: () => ({ x: camera.position.x, z: camera.position.z, yaw }),
    };
    applyVisualSettings(sceneOptionsRef.current.goldenHour, sceneOptionsRef.current.mistEnabled);

    function resize() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    function onPointerLockChange() {
      locked = document.pointerLockElement === renderer.domElement;
      if (!locked) {
        keys.clear();
        dragLooking = false;
        focusedTarget = null;
        setInteractionPrompt('');
      }
      setPointerLocked(locked);
    }

    function onMouseMove(event) {
      if (locked) {
        yaw -= event.movementX * 0.0022;
        pitch = clamp(pitch - event.movementY * 0.002, -1.23, 1.23);
      } else if (exploringWorld && dragLooking) {
        const deltaX = event.clientX - lastPointerX;
        const deltaY = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        if (Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY) > 4) dragMoved = true;
        yaw -= deltaX * 0.004;
        pitch = clamp(pitch - deltaY * 0.0035, -1.23, 1.23);
      } else {
        return;
      }
      camera.rotation.set(pitch, yaw, 0);
    }

    function onPointerDown(event) {
      if (!exploringWorld || locked || event.button !== 0) return;
      dragLooking = true;
      dragMoved = false;
      dragStartX = lastPointerX = event.clientX;
      dragStartY = lastPointerY = event.clientY;
      renderer.domElement.focus({ preventScroll: true });
    }

    function onPointerUp() {
      if (!dragLooking) return;
      dragLooking = false;
      if (dragMoved) ignoreClickUntil = performance.now() + 300;
    }

    function onPointerLockError() {
      locked = false;
      setPointerLocked(false);
    }

    const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
    function onKeyDown(event) {
      const eventTarget = event.target;
      const isTyping = eventTarget instanceof HTMLElement
        && (eventTarget.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(eventTarget.tagName));
      if (!isTyping && event.code === 'KeyM' && (exploringWorld || mapOpenRef.current)) {
        event.preventDefault();
        toggleWorldMapRef.current();
        return;
      }
      if (event.code === 'Escape') {
        if (activeStoryRef.current) closeFieldNote();
        else if (mapOpenRef.current) closeWorldMap();
        return;
      }
      if (event.code === 'KeyE' && focusedTarget) {
        event.preventDefault();
        activateTarget(focusedTarget);
        return;
      }
      if (!exploringWorld || mapOpenRef.current || activeStoryRef.current || !movementKeys.has(event.code)) return;
      event.preventDefault();
      if (event.code === 'Space' && !keys.has('Space')) jumpQueued = true;
      keys.add(event.code);
    }
    function onKeyUp(event) {
      keys.delete(event.code);
    }
    function onCanvasClick(event) {
      if (performance.now() < ignoreClickUntil) return;
      if (locked) {
        centerRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const aimedHit = centerRaycaster.intersectObjects(interactions.targets, false)[0];
        if (aimedHit && aimedHit.distance <= centerRaycaster.far && aimedHit.object.visible) {
          ensureAudio();
          activateTarget(aimedHit.object);
          return;
        }
        throwStone();
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      clickRaycaster.setFromCamera(pointer, camera);
      const hit = clickRaycaster.intersectObjects(interactions.targets, false)[0];
      if (hit && hit.distance <= 5.2) {
        ensureAudio();
        activateTarget(hit.object);
        return;
      }
      enterWorld();
    }
    function onContextMenu(event) {
      if (event.target === renderer.domElement) event.preventDefault();
    }

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    document.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const movement = new THREE.Vector3();
    const waterPositions = water.geometry.attributes.position;

    function animate(time) {
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min((time - previousTime) / 1000, 0.045);
      previousTime = time;

      if (exploringWorld && !mapOpenRef.current && !activeStoryRef.current) {
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        movement.set(0, 0, 0);
        if (keys.has('KeyW') || keys.has('ArrowUp')) movement.add(forward);
        if (keys.has('KeyS') || keys.has('ArrowDown')) movement.sub(forward);
        if (keys.has('KeyD') || keys.has('ArrowRight')) movement.add(right);
        if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.sub(right);
        if (movement.lengthSq() > 0) {
          movement.normalize().multiplyScalar(delta * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.5 : 4.2));
          const nextX = clamp(camera.position.x + movement.x, -39, 39);
          const nextZ = clamp(camera.position.z + movement.z, -49, 19);
          if (!lakeShape(nextX, nextZ) && !hitTree(nextX, nextZ)) {
            camera.position.x = nextX;
            camera.position.z = nextZ;
          }
          footstepTimer += delta;
          if (footstepTimer > (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 0.34 : 0.48)) {
            playTone(keys.has('ShiftLeft') || keys.has('ShiftRight') ? 115 : 92, 0.055, 'triangle', 0.022);
            footstepTimer = 0;
          }
        } else {
          footstepTimer = 0;
        }
        const floorY = terrainHeight(camera.position.x, camera.position.z) + 1.68;
        if (jumpQueued && grounded) {
          verticalVelocity = 5.3;
          grounded = false;
        }
        jumpQueued = false;
        verticalVelocity = Math.max(-20, verticalVelocity - 9.81 * delta);
        camera.position.y += verticalVelocity * delta;
        if (camera.position.y <= floorY) {
          camera.position.y = floorY;
          verticalVelocity = 0;
          grounded = true;
        }
        centerRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const focusedHit = centerRaycaster.intersectObjects(interactions.targets, false)[0];
        const nextTarget = focusedHit?.distance <= centerRaycaster.far ? focusedHit.object : null;
        if (nextTarget !== focusedTarget) {
          focusedTarget = nextTarget;
          const item = focusedTarget?.userData.interaction;
          setInteractionPrompt(item ? `Click / E · ${item.title}` : '');
        }
      } else {
        focusedTarget = null;
        setInteractionPrompt('');
      }

      if (mapOpenRef.current && time - mapPositionTimer > 150) {
        mapPositionTimer = time;
        setMapPlayerPosition({ x: camera.position.x, z: camera.position.z, yaw });
      }

      birdTimer -= delta;
      if (soundEnabledRef.current && audioContext && birdTimer <= 0) {
        const pitch = 1450 + Math.random() * 650;
        playTone(pitch, 0.1, 'sine', 0.018);
        playTone(pitch * 1.28, 0.09, 'sine', 0.015, 0.12);
        birdTimer = 7 + Math.random() * 8;
      }

      interactions.fireflies.forEach((firefly) => {
        if (!firefly.collected) {
          firefly.group.position.y = firefly.baseY + Math.sin(time * 0.002 + firefly.phase) * 0.22;
          firefly.target.position.y = firefly.group.position.y;
          firefly.group.rotation.y += delta * 0.7;
        }
      });
      interactions.hotspots.forEach(({ marker, orb }, index) => {
        orb.scale.setScalar(0.88 + Math.sin(time * 0.0022 + index) * 0.12);
        marker.rotation.y = Math.sin(time * 0.0006 + index) * 0.1;
      });
      if (fireOn) {
        interactions.fire.flames[0].scale.y = 0.86 + Math.sin(time * 0.013) * 0.12;
        interactions.fire.flames[1].scale.y = 0.92 + Math.cos(time * 0.016) * 0.13;
        interactions.fire.light.intensity = 2 + Math.sin(time * 0.018) * 0.3;
      }

      for (let index = stones.length - 1; index >= 0; index -= 1) {
        const stone = stones[index];
        stone.age += delta;
        stone.velocity.y -= 9.81 * delta;
        stone.mesh.position.addScaledVector(stone.velocity, delta);
        stone.mesh.rotation.x += delta * 8;
        stone.mesh.rotation.z += delta * 5;
        const { x, y, z } = stone.mesh.position;
        if (lakeShape(x, z) && y <= -0.13) {
          createRipple(x, z);
          removeStone(index);
        } else if (y < terrainHeight(x, z) + 0.1 || stone.age > 4) {
          removeStone(index);
        }
      }
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index];
        ripple.age += delta;
        const progress = ripple.age / ripple.duration;
        ripple.mesh.scale.setScalar(0.2 + progress * 3.2);
        ripple.mesh.material.opacity = Math.max(0, 0.72 * (1 - progress));
        if (progress >= 1) {
          scene.remove(ripple.mesh);
          ripple.mesh.geometry.dispose();
          ripple.mesh.material.dispose();
          ripples.splice(index, 1);
        }
      }

      const array = waterPositions.array;
      for (let i = 0; i < waterPositions.count; i += 1) {
        const x = waterPositions.getX(i);
        const z = waterPositions.getZ(i);
        array[i * 3 + 1] = Math.sin(x * 0.25 + time * 0.00065) * 0.035 + Math.cos(z * 0.31 - time * 0.00042) * 0.024;
      }
      waterPositions.needsUpdate = true;
      renderer.render(scene, camera);
    }
    animate(previousTime);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      document.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      window.clearTimeout(toastTimer);
      if (sceneActionsRef.current.setVisuals === applyVisualSettings) sceneActionsRef.current = {};
      stones.forEach((stone) => {
        stone.mesh.geometry.dispose();
        stone.mesh.material.dispose();
      });
      ripples.forEach((ripple) => {
        ripple.mesh.geometry.dispose();
        ripple.mesh.material.dispose();
      });
      audioContext?.close();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  useEffect(() => {
    sceneActionsRef.current.setVisuals?.(goldenHour, mistEnabled);
  }, [goldenHour, mistEnabled]);

  useEffect(() => {
    sceneActionsRef.current.setSound?.(soundEnabled);
  }, [soundEnabled]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sceneActionsRef.current.setSound?.(next);
    if (next) sceneActionsRef.current.resumeAudio?.();
  }

  const playerMapPoint = mapPoint(mapPlayerPosition.x, mapPlayerPosition.z);
  const focusedLandmark = MAP_LANDMARKS.find((landmark) => landmark.id === mapFocusId);
  const focusedLandmarkDistance = focusedLandmark
    ? Math.round(Math.hypot(focusedLandmark.x - mapPlayerPosition.x, focusedLandmark.z - mapPlayerPosition.z))
    : null;

  return (
    <div className="world-canvas-wrap" ref={mountRef}>
      {!exploring && <div
        className="scene-entry-hint"
        role="button"
        tabIndex={0}
        aria-label="Click to explore the world"
        onClick={() => sceneActionsRef.current.enterWorld?.()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            sceneActionsRef.current.enterWorld?.();
          }
        }}
      >
        <span className="entry-play"><span /></span><span>CLICK TO EXPLORE</span>
      </div>}
      {exploring && <div className="scene-entry-hint is-locked" aria-hidden="true"><span className="entry-crosshair" /></div>}
      {exploring && !pointerLocked && !mapOpen && !activeStory && <div className="sample-free-look-hint">WASD to move · drag to look · aim + E / click</div>}
      <div className="sample-world-hud" role="region" aria-label={`${title} sample world interactions`}>
        <section className="sample-world-panel">
          <div className="sample-world-panel-heading"><span className="sample-world-live-dot" /><span className="sample-world-panel-title">{title.toUpperCase()} FIELD GUIDE</span><button type="button" className="sample-world-map-button" onClick={toggleWorldMap} aria-pressed={mapOpen} aria-label="Open world map"><span>Map</span><kbd>M</kbd></button></div>
          <div className="sample-world-progress">
            <span>Fireflies</span><strong>{collectedCount} / 3</strong>
            <span>Field notes</span><strong>{discoveredCount} / 4</strong>
          </div>
          <div className="sample-world-toggle-row">
            <button type="button" className={goldenHour ? 'active' : ''} onClick={() => setGoldenHour((value) => !value)} aria-pressed={goldenHour}>{goldenHour ? 'Cool dusk' : 'Golden hour'}</button>
            <button type="button" className={mistEnabled ? 'active' : ''} onClick={() => setMistEnabled((value) => !value)} aria-pressed={mistEnabled}>{mistEnabled ? 'Clear mist' : 'Mist'}</button>
            <button type="button" className={soundEnabled ? 'active' : ''} onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? 'Sound on' : 'Sound off'}</button>
          </div>
          <p className="sample-world-hint">WASD to move, Space to jump. Aim at a marker and click or press E to interact. Find fireflies and field notes; press M for the map.</p>
        </section>
      </div>
      {exploring && interactionPrompt && <div className="sample-interaction-prompt" role="status">{interactionPrompt}</div>}
      {toast && <div className="sample-world-toast" role="status">{toast}</div>}
      {mapOpen && (
        <div className="sample-world-map-backdrop">
          <section className="sample-world-map" role="dialog" aria-modal="true" aria-labelledby="sample-world-map-title">
            <header className="sample-world-map-header">
              <div><span className="sample-map-kicker">{title.toUpperCase()} FIELD MAP</span><h3 id="sample-world-map-title">Find your way</h3></div>
              <button type="button" className="sample-map-close" onClick={closeWorldMap} aria-label="Close map">Close</button>
            </header>
            <div className="sample-world-map-body">
              <div className="sample-map-visual">
                <svg viewBox="0 0 320 260" role="img" aria-label="Map of the lake, pine trail and landmarks">
                  <defs>
                    <pattern id="sample-map-grain" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".7" fill="#dce6c9" opacity=".56" /><circle cx="13" cy="12" r=".55" fill="#486b52" opacity=".3" /></pattern>
                  </defs>
                  <rect x="0" y="0" width="320" height="260" rx="13" fill="#7e9a76" />
                  <rect x="0" y="0" width="320" height="260" rx="13" fill="url(#sample-map-grain)" />
                  <path d="M-8 83 C34 60 70 72 96 57 S153 48 182 57 S246 42 329 61 M-7 98 C35 77 69 88 101 73 S155 64 185 73 S255 57 328 78 M-5 203 C36 184 71 196 105 180 S171 177 205 187 S272 170 328 190" fill="none" stroke="#d5e0c1" strokeOpacity=".36" strokeWidth="1.2" />
                  <path d="M64 126 C78 113 98 109 124 112 C148 115 161 108 181 113 C207 119 225 117 245 130 C259 140 255 157 240 168 C220 183 197 180 177 183 C151 185 136 178 115 180 C92 182 72 170 63 155 C57 145 57 134 64 126Z" fill="#47727c" stroke="#d9e0cb" strokeWidth="2" />
                  <path d="M64 126 C78 113 98 109 124 112 C148 115 161 108 181 113 C207 119 225 117 245 130" fill="none" stroke="#adc49c" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M160 28 C157 45 158 57 161 72 C165 88 165 97 160 108 C157 116 164 122 173 125" fill="none" stroke="#e5ce98" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 4" />
                  {[['42','57'],['73','70'],['93','53'],['260','76'],['277','91'],['278','197'],['253','212'],['48','200'],['31','181']].map(([x, y]) => <path key={`${x}-${y}`} d={`M${x} ${y + 5} l4 -9 4 9Z`} fill="#365b43" opacity=".9" />)}
                  <text x="160" y="151" textAnchor="middle" className="sample-map-water-label">STILLWATER LAKE</text>
                  <text x="280" y="25" textAnchor="middle" className="sample-map-north">N</text>
                  <path d="M280 31 276 40h8Z" fill="#f4f1df" />
                  {MAP_LANDMARKS.map((landmark) => {
                    const point = mapPoint(landmark.x, landmark.z);
                    const isFocused = mapFocusId === landmark.id;
                    const isFound = discoveredStoryIds.includes(landmark.id);
                    return (
                      <g
                        key={landmark.id}
                        className={`sample-map-marker ${isFocused ? 'focused' : ''}`}
                        transform={`translate(${point.x} ${point.y})`}
                        role="button"
                        tabIndex="0"
                        aria-label={`${landmark.title}${landmark.kind === 'Field note' && isFound ? ', discovered' : ''}`}
                        onClick={() => setMapFocusId(landmark.id)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setMapFocusId(landmark.id); }}
                      >
                        <circle className="sample-map-marker-halo" r={isFocused ? 10 : 7} />
                        <circle className="sample-map-marker-core" r={landmark.id === 'guide' ? 5.5 : 4.3} />
                        <title>{landmark.title}</title>
                      </g>
                    );
                  })}
                  <g className="sample-map-player" transform={`translate(${playerMapPoint.x} ${playerMapPoint.y})`}>
                    <circle r="8" />
                    <path d="M0 -6 4 4 0 2 -4 4Z" transform={`rotate(${-mapPlayerPosition.yaw * 180 / Math.PI})`} />
                  </g>
                </svg>
                <div className="sample-map-legend"><span><i className="sample-map-legend-player" />You are here</span><span><i className="sample-map-legend-place" />Landmark</span><span><i className="sample-map-legend-note" />Field note</span></div>
              </div>
              <aside className="sample-map-places" aria-label="Map locations">
                <div className="sample-map-places-heading"><strong>Places</strong><span>{MAP_LANDMARKS.length} marked</span></div>
                <div className="sample-map-place-list">
                  {MAP_LANDMARKS.map((landmark) => {
                    const distance = Math.round(Math.hypot(landmark.x - mapPlayerPosition.x, landmark.z - mapPlayerPosition.z));
                    const isFound = discoveredStoryIds.includes(landmark.id);
                    return (
                      <button type="button" key={landmark.id} className={`sample-map-place ${mapFocusId === landmark.id ? 'selected' : ''}`} onClick={() => setMapFocusId(landmark.id)}>
                        <span className={`sample-map-place-icon kind-${landmark.kind.toLowerCase().replace(' ', '-')}`}>{landmark.id === 'guide' ? 'M' : landmark.kind === 'Field note' ? '?' : landmark.id === 'trailhead' ? 'S' : '•'}</span>
                        <span className="sample-map-place-copy"><strong>{landmark.title}</strong><small>{landmark.kind}{landmark.kind === 'Field note' ? (isFound ? ' · Found' : ' · Undiscovered') : ''}</small></span>
                        <span className="sample-map-distance">{distance} m</span>
                      </button>
                    );
                  })}
                </div>
                {focusedLandmark && <div className="sample-map-selected-place"><strong>{focusedLandmark.title}</strong><span>{focusedLandmark.detail}</span><small>{focusedLandmarkDistance} m from your position</small></div>}
              </aside>
            </div>
            <footer className="sample-world-map-footer"><span>Move with WASD; the player marker updates as you explore.</span><kbd>M</kbd><span>or</span><kbd>Esc</kbd><span>to close</span></footer>
          </section>
        </div>
      )}
      {activeStory && (
        <section className="sample-story-card" role="dialog" aria-modal="false" aria-labelledby="sample-story-title">
          <button type="button" className="sample-story-close" onClick={closeFieldNote} aria-label="Close field note">×</button>
          <span className="sample-story-kicker">{activeStory.kind === 'conversation' ? 'CONVERSATION' : 'FIELD NOTE'}</span>
          <h3 id="sample-story-title">{activeStory.title}</h3>
          <p>{activeStory.body}</p>
          {activeStory.choices && (
            <div className="sample-dialogue-choices" aria-label="Conversation choices">
              {activeStory.choices.map((choice) => (
                <button type="button" key={choice.label} onClick={() => setActiveStory((current) => current && ({ ...current, body: choice.response }))}>
                  {choice.label}
                </button>
              ))}
            </div>
          )}
          <span className="sample-story-footnote">{activeStory.kind === 'conversation' ? 'Press Esc or close to continue exploring.' : 'Press Esc to close and release the mouse.'}</span>
        </section>
      )}
    </div>
  );
}
