import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import useMaraVoice from './useMaraVoice.js';
import WorldLoadingPanel from './WorldLoadingPanel.jsx';

const FIXED_STEP = 1 / 60;
const PLAYER_RADIUS = 0.31;
const PLAYER_HALF_HEIGHT = 0.58;
const PLAYER_EYE_OFFSET = 0.43;
const MAX_COLLIDER_TRIANGLES = 600_000;
const MAX_PINS = 30;
const MAX_CUSTOM_MODEL_BYTES = 100 * 1024 * 1024;
const CUSTOM_MODEL_MAX_SIZE_METERS = 1.5;
const AIM_RANGE_METERS = 10;
const HOTSPOT_USE_RANGE_METERS = 6;
const HOTSPOT_COUNT = 5;
const COLLECTIBLE_COUNT = 8;
const COLLECT_ANIMATION_MS = 320;
const UP = new THREE.Vector3(0, 1, 0);
const NORMAL_SPLAT_BUDGET = 300_000;
const LOW_FRAME_SPLAT_BUDGET = 150_000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const KEY_ALIASES = {
  w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD',
  arrowup: 'ArrowUp', arrowleft: 'ArrowLeft', arrowdown: 'ArrowDown', arrowright: 'ArrowRight',
  ' ': 'Space', shift: 'ShiftLeft', control: 'ControlLeft',
};
const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const AUXILIARY_CODES = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);

function getControlCode(event) {
  if (MOVEMENT_CODES.has(event.code) || AUXILIARY_CODES.has(event.code)) return event.code;
  return KEY_ALIASES[event.key?.toLowerCase()] || null;
}

function getMovementInput(keys) {
  return {
    forward: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
    right: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    vertical: Number(keys.has('Space')) - Number(keys.has('ControlLeft') || keys.has('ControlRight')),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}

let rapierImportPromise;

function loadRapier() {
  if (!rapierImportPromise) {
    rapierImportPromise = import('@dimforge/rapier3d-compat').then(async (module) => {
      const rapier = module.default || module;
      await rapier.init();
      return rapier;
    });
  }
  return rapierImportPromise;
}

function disposeObjectTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
    material.dispose();
  });
}

function createMaraCharacter() {
  const character = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: '#526d55', roughness: 0.88, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: '#d6ad83', roughness: 0.92 });
  const hat = new THREE.MeshStandardMaterial({ color: '#b38c5a', roughness: 0.9, flatShading: true });
  const pack = new THREE.MeshStandardMaterial({ color: '#594636', roughness: 0.95, flatShading: true });
  const scarf = new THREE.MeshStandardMaterial({ color: '#d6c27b', roughness: 0.8 });
  const eyes = new THREE.MeshBasicMaterial({ color: '#28352b' });
  const marker = new THREE.MeshBasicMaterial({ color: '#d7f08d', toneMapped: false });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.62, 4, 8), coat);
  body.position.y = 0.91;
  character.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin);
  head.position.set(0, 1.58, -0.015);
  character.add(head);
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#54342c' }),
  );
  mouth.position.set(0, 1.51, -0.204);
  mouth.scale.set(1, 0.12, 0.3);
  character.add(mouth);
  character.userData.mouth = mouth;
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.055, 12), hat);
  hatBrim.position.y = 1.77;
  character.add(hatBrim);
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.23, 10), hat);
  hatCrown.position.y = 1.89;
  character.add(hatCrown);
  const scarfLoop = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.055, 7, 16), scarf);
  scarfLoop.rotation.x = Math.PI / 2;
  scarfLoop.position.y = 1.39;
  character.add(scarfLoop);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.2), pack);
  backpack.position.set(0, 0.99, 0.31);
  character.add(backpack);

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.58, 8), coat);
    arm.position.set(side * 0.34, 0.96, 0);
    arm.rotation.z = side * -0.12;
    character.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.43, 8), pack);
    leg.position.set(side * 0.13, 0.29, 0);
    character.add(leg);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), eyes);
    eye.position.set(side * 0.075, 1.6, -0.202);
    character.add(eye);
  });

  const markerRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 18), marker);
  markerRing.rotation.x = Math.PI / 2;
  markerRing.position.y = 2.13;
  character.add(markerRing);
  const markerOrb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), marker);
  markerOrb.position.y = 2.13;
  character.add(markerOrb);
  character.scale.setScalar(1);
  character.userData.marker = markerOrb;
  character.userData.markerRing = markerRing;
  return character;
}

function buildColliderBuffers(meshes) {
  const entries = meshes.map((mesh) => {
    const position = mesh.geometry.attributes.position;
    const triangleCount = position ? Math.floor((mesh.geometry.index?.count ?? position.count) / 3) : 0;
    return { mesh, triangleCount };
  }).filter((entry) => entry.triangleCount > 0);
  const totalTriangles = entries.reduce((total, entry) => total + entry.triangleCount, 0);
  const triangleStride = Math.max(1, Math.ceil(totalTriangles / MAX_COLLIDER_TRIANGLES));
  const selectedTriangleCount = entries.reduce((total, entry) => total + Math.ceil(entry.triangleCount / triangleStride), 0);
  const vertices = new Float32Array(selectedTriangleCount * 9);
  const indices = new Uint32Array(selectedTriangleCount * 3);
  let outputVertex = 0;
  let outputIndex = 0;

  for (const { mesh, triangleCount } of entries) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const matrix = mesh.matrixWorld.elements;
    const sourceIndex = geometry.index;
    for (let triangle = 0; triangle < triangleCount; triangle += triangleStride) {
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceVertex = sourceIndex ? sourceIndex.getX(triangle * 3 + corner) : triangle * 3 + corner;
        const x = position.getX(sourceVertex);
        const y = position.getY(sourceVertex);
        const z = position.getZ(sourceVertex);
        const output = outputVertex * 3;
        vertices[output] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        vertices[output + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        vertices[output + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        indices[outputIndex++] = outputVertex++;
      }
    }
  }

  return { vertices, indices };
}

export default function MarbleWorldCanvas({ url, colliderMeshUrl, metricScale = 1, worldTitle = 'your world', onLoadStateChange }) {
  const mountRef = useRef(null);
  const characterInputRef = useRef(null);
  const sceneRef = useRef(null);
  const maraCharacterRef = useRef(null);
  const customCharacterRootRef = useRef(null);
  const actionsRef = useRef({});
  const [loadState, setLoadState] = useState('loading');
  const [loadProgress, setLoadProgress] = useState(null);
  const [customCharacterFile, setCustomCharacterFile] = useState(null);
  const [customCharacterState, setCustomCharacterState] = useState('idle');
  const [customCharacterError, setCustomCharacterError] = useState('');
  const [maraAvailable, setMaraAvailable] = useState(false);
  const [colliderState, setColliderState] = useState(colliderMeshUrl ? 'loading' : 'unavailable');
  const [performanceMode, setPerformanceMode] = useState(false);
  const [colliderDebug, setColliderDebug] = useState(false);
  const [pinCount, setPinCount] = useState(0);
  const [aimPrompt, setAimPrompt] = useState(null);
  const [openHotspot, setOpenHotspot] = useState(null);
  const [collected, setCollected] = useState(0);
  const [collectTotal, setCollectTotal] = useState(0);
  const [notes, setNotes] = useState({});
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hello, I’m Mara. It’s lovely to have you here. What would you like to talk about?' },
  ]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);
  const noteOpenRef = useRef(false);
  const notesKey = `wyntrr:hotspot-notes:${colliderMeshUrl || url}`;
  useEffect(() => {
    onLoadStateChange?.(loadState);
  }, [loadState, onLoadStateChange]);
  const voice = useMaraVoice({
    active: openHotspot?.kind === 'character',
    onTranscript: (text) => setChatDraft((current) => `${current.trim()} ${text}`.trim().slice(0, 1200)),
  });
  const speakingRef = useRef(false);
  speakingRef.current = voice.speaking && openHotspot?.kind === 'character';

  useEffect(() => {
    noteOpenRef.current = Boolean(openHotspot);
  }, [openHotspot]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages, chatBusy, openHotspot]);

  async function sendMaraMessage(event) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    voice.stopListening();
    voice.stopSpeaking();

    const nextMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(nextMessages);
    setChatDraft('');
    setChatBusy(true);
    setChatError('');

    try {
      const response = await fetch('/api/mara/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldTitle, messages: nextMessages.slice(-12) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Mara could not reply (HTTP ${response.status}).`);
      }
      if (typeof payload?.reply !== 'string' || !payload.reply.trim()) {
        throw new Error('Mara sent an empty reply. Please try again.');
      }
      setChatMessages((current) => [...current, { role: 'assistant', content: payload.reply.trim() }]);
      voice.speak(payload.reply.trim());
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Mara could not reply. Please try again.');
    } finally {
      setChatBusy(false);
    }
  }

  useEffect(() => {
    try {
      setNotes(JSON.parse(window.localStorage.getItem(notesKey) || '{}'));
    } catch {
      setNotes({});
    }
  }, [notesKey]);

  function updateNote(id, text) {
    setNotes((current) => {
      const next = { ...current, [id]: text };
      try {
        window.localStorage.setItem(notesKey, JSON.stringify(next));
      } catch {
        // Notes still work for this session if storage is unavailable.
      }
      return next;
    });
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !url) return undefined;

    let renderer;
    let spark;
    let splats;
    let colliderRoot;
    let physicsWorld;
    let rapier;
    let playerBody;
    let playerCollider;
    let characterController;
    let maraCharacter = null;
    let disposed = false;
    let collisionReady = false;
    let colliderSettled = !colliderMeshUrl;
    let splatsReady = false;
    let worldReady = false;
    let lastFrameTime = performance.now();
    let performanceSampleStart = lastFrameTime;
    let performanceSampleCount = 0;
    let performanceSampleDuration = 0;
    let performanceModeEnabled = false;
    let physicsAccumulator = 0;
    let verticalVelocity = 0;
    let grounded = false;
    let jumpQueued = false;
    let yaw = 0;
    let pitch = 0;
    let pointerPosition = null;
    let pointerDown = null;
    let spawnPoint = null;
    let debugMesh = null;
    let aimHit = null;
    let aimHotspot = -1;
    let lastAimPrompt = null;
    const pins = [];
    const hotspots = [];
    const collectibles = [];
    let audioContext = null;
    const aimDirection = new THREE.Vector3();
    const toHotspot = new THREE.Vector3();
    const keys = new Set();
    const colliderMeshes = [];
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const movement = new THREE.Vector3();
    const scene = new THREE.Scene();
    // Marble worlds are not in metres (metric_scale_factor converts world units to metres),
    // so the player and movement are scaled down or the capsule gets wedged in the collider.
    const unit = metricScale > 0 ? 1 / metricScale : 1;
    const playerRadius = PLAYER_RADIUS * unit;
    const playerHalfHeight = PLAYER_HALF_HEIGHT * unit;
    const eyeOffset = PLAYER_EYE_OFFSET * unit;
    const walkSpeed = 3.8 * unit;
    const sprintSpeed = 6.3 * unit;
    const metersPerUnit = metricScale > 0 ? metricScale : 1;
    const pinStemGeometry = new THREE.CylinderGeometry(0.012 * unit, 0.012 * unit, 0.22 * unit, 8).translate(0, 0.11 * unit, 0);
    const pinHeadGeometry = new THREE.SphereGeometry(0.05 * unit, 16, 12).translate(0, 0.24 * unit, 0);
    const pinMaterial = new THREE.MeshBasicMaterial({ color: '#ffd24a' });
    const hotspotCoreGeometry = new THREE.SphereGeometry(0.07 * unit, 16, 12);
    const hotspotHaloGeometry = new THREE.SphereGeometry(0.14 * unit, 16, 12);
    const hotspotCoreMaterial = new THREE.MeshBasicMaterial({ color: '#7dffb2' });
    const hotspotHaloMaterial = new THREE.MeshBasicMaterial({ color: '#7dffb2', transparent: true, opacity: 0.28, depthWrite: false });
    const reticleGeometry = new THREE.RingGeometry(0.06 * unit, 0.08 * unit, 32);
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    const gemGeometry = new THREE.OctahedronGeometry(0.09 * unit).scale(1, 1.35, 1);
    const gemHaloGeometry = new THREE.SphereGeometry(0.17 * unit, 16, 12);
    const gemMaterial = new THREE.MeshBasicMaterial({ color: '#ff7ad9' });
    const gemHaloMaterial = new THREE.MeshBasicMaterial({ color: '#ff7ad9', transparent: true, opacity: 0.22, depthWrite: false });
    reticle.visible = false;
    reticle.renderOrder = 999;
    scene.background = new THREE.Color('#17231f');
    scene.add(reticle);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 1000);
    camera.position.set(0, 1.55, 0);
    camera.rotation.order = 'YXZ';
    sceneRef.current = scene;

    setLoadState('loading');
    setLoadProgress(null);
    setColliderState(colliderMeshUrl ? 'loading' : 'unavailable');
    setPerformanceMode(false);
    setColliderDebug(false);
    setPinCount(0);
    setAimPrompt(null);
    setOpenHotspot(null);
    setCollected(0);
    setCollectTotal(0);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch {
      setLoadState('error');
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.domElement.className = 'world-canvas';
    renderer.domElement.setAttribute('aria-label', 'Marble 3D world preview. Drag to look, use WASD to move, and Space to jump. Find Mara and press E to talk.');
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    spark = new SparkRenderer({
      renderer,
      view: { sort32: true },
      lodSplatScale: 1,
      lodSplatCount: NORMAL_SPLAT_BUDGET,
      minSortIntervalMs: 100,
      lodRaycastIntervalMs: 750,
    });
    scene.add(spark);
    splats = new SplatMesh({
      url,
      lod: true,
      onProgress: (event) => {
        if (disposed || !event.lengthComputable || !event.total) return;
        setLoadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    });
    splats.quaternion.set(1, 0, 0, 0);
    scene.add(splats);

    function resize() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function onPointerDown(event) {
      if (!worldReady) return;
      if (event.button !== 0 || event.target !== renderer.domElement) return;
      pointerPosition = { x: event.clientX, y: event.clientY };
      pointerDown = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      renderer.domElement.focus({ preventScroll: true });
      renderer.domElement.classList.add('is-dragging');
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }
    function onPointerEnter() {
      if (!worldReady) return;
      renderer.domElement.focus({ preventScroll: true });
    }
    function onPointerMove(event) {
      if (!pointerPosition) return;
      const deltaX = event.clientX - pointerPosition.x;
      const deltaY = event.clientY - pointerPosition.y;
      pointerPosition = { x: event.clientX, y: event.clientY };
      yaw -= deltaX * 0.0032;
      pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.0032, -1.35, 1.35);
    }
    function onPointerUp(event) {
      // A short press without dragging is a click; dragging only looks around.
      if (event?.type === 'pointerup' && pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 6 && event.timeStamp - pointerDown.time < 350) {
        interact();
      }
      pointerDown = null;
      pointerPosition = null;
      renderer.domElement.classList.remove('is-dragging');
    }
    function onKeyDown(event) {
      if (!worldReady) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.code === 'KeyE') { event.preventDefault(); interact(); return; }
        if (event.code === 'KeyX') { event.preventDefault(); clearPins(); return; }
        if (event.code === 'Escape') { setOpenHotspot(null); return; }
        if (event.code === 'KeyR') { event.preventDefault(); resetPlayer(); return; }
        if (event.code === 'KeyC') { event.preventDefault(); toggleColliderDebug(); return; }
      }
      const code = getControlCode(event);
      if (!code) return;
      event.preventDefault();
      if (code === 'Space' && !event.repeat) jumpQueued = true;
      keys.add(code);
    }
    function onKeyUp(event) {
      const code = getControlCode(event);
      if (code) keys.delete(code);
    }
    function onBlur() {
      keys.clear();
      jumpQueued = false;
      onPointerUp();
    }

    // Rapier rays are BVH-accelerated, so casting one per frame against the full collider is cheap.
    function castFromCamera(maxDistance) {
      const hit = physicsWorld.castRayAndGetNormal(new rapier.Ray(camera.position, aimDirection), maxDistance, true, undefined, undefined, undefined, playerBody);
      if (!hit) return null;
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      if (normal.dot(aimDirection) > 0) normal.negate();
      return {
        distance: hit.timeOfImpact,
        point: new THREE.Vector3().copy(camera.position).addScaledVector(aimDirection, hit.timeOfImpact),
        normal,
      };
    }

    function updateAim() {
      aimDirection.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      aimHit = castFromCamera(AIM_RANGE_METERS * unit);
      aimHotspot = -1;
      const useRange = HOTSPOT_USE_RANGE_METERS * unit;
      let bestOffset = Infinity;
      hotspots.forEach((hotspot, index) => {
        toHotspot.copy(hotspot.position).sub(camera.position);
        const distance = toHotspot.length();
        const along = toHotspot.dot(aimDirection);
        if (distance > useRange || along <= 0) return;
        const offset = Math.sqrt(Math.max(0, distance * distance - along * along));
        if (offset > 0.2 * unit + along * 0.03 || offset >= bestOffset) return;
        if (aimHit && aimHit.distance < along - 0.3 * unit) return;
        bestOffset = offset;
        aimHotspot = index;
      });

      if (aimHit) {
        reticle.position.copy(aimHit.point).addScaledVector(aimHit.normal, 0.01 * unit);
        reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aimHit.normal);
        reticleMaterial.color.set(aimHotspot >= 0 ? '#7dffb2' : '#ffffff');
        reticle.visible = !noteOpenRef.current;
      } else {
        reticle.visible = false;
      }
      const prompt = aimHotspot >= 0 && !noteOpenRef.current ? hotspots[aimHotspot].info.title : null;
      if (prompt !== lastAimPrompt) {
        lastAimPrompt = prompt;
        setAimPrompt(prompt);
      }
    }

    function placePin() {
      if (!aimHit) return;
      const pin = new THREE.Group();
      pin.add(new THREE.Mesh(pinStemGeometry, pinMaterial), new THREE.Mesh(pinHeadGeometry, pinMaterial));
      pin.position.copy(aimHit.point);
      pin.quaternion.setFromUnitVectors(UP, aimHit.normal);
      scene.add(pin);
      pins.push(pin);
      while (pins.length > MAX_PINS) scene.remove(pins.shift());
      setPinCount(pins.length);
    }

    function clearPins() {
      pins.splice(0).forEach((pin) => scene.remove(pin));
      setPinCount(0);
    }

    // Click or E: inspect the glowing point being aimed at, otherwise drop a pin on the surface.
    function interact() {
      if (!collisionReady) return;
      if (noteOpenRef.current) {
        setOpenHotspot(null);
        return;
      }
      if (aimHotspot >= 0) {
        keys.clear();
        jumpQueued = false;
        setOpenHotspot(hotspots[aimHotspot].info);
        return;
      }
      placePin();
    }

    // Picks well-spread points of interest on walls and furniture visible from the spawn point.
    function generateHotspots(origin, floorY) {
      const candidates = [];
      const samples = 420;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let index = 0; index < samples; index += 1) {
        const azimuth = index * goldenAngle;
        const elevation = ((index + 0.5) / samples) * 0.75 - 0.3;
        const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
        const hit = physicsWorld.castRayAndGetNormal(new rapier.Ray(origin, direction), 10 * unit, true, undefined, undefined, undefined, playerBody);
        if (!hit) continue;
        const point = new THREE.Vector3().copy(origin).addScaledVector(direction, hit.timeOfImpact);
        const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
        if (normal.dot(direction) > 0) normal.negate();
        const distanceM = hit.timeOfImpact * metersPerUnit;
        const heightM = (point.y - floorY) * metersPerUnit;
        if (distanceM < 1.2 || heightM < 0.35 || heightM > 2.3 || Math.abs(normal.y) > 0.92) continue;
        candidates.push({ point, normal, distanceM, heightM, azimuth: Math.atan2(direction.x, -direction.z) });
      }
      if (!candidates.length) return;

      const chosen = [candidates.reduce((best, candidate) => (Math.abs(candidate.azimuth) < Math.abs(best.azimuth) ? candidate : best))];
      while (chosen.length < HOTSPOT_COUNT) {
        let next = null;
        let nextSpread = 0;
        for (const candidate of candidates) {
          const spread = Math.min(...chosen.map((picked) => picked.point.distanceTo(candidate.point))) * metersPerUnit;
          if (spread > nextSpread) { next = candidate; nextSpread = spread; }
        }
        if (!next || nextSpread < 1) break;
        chosen.push(next);
      }

      chosen.forEach((spot, index) => {
        const group = new THREE.Group();
        const halo = new THREE.Mesh(hotspotHaloGeometry, hotspotHaloMaterial);
        group.add(new THREE.Mesh(hotspotCoreGeometry, hotspotCoreMaterial), halo);
        const position = spot.point.clone().addScaledVector(spot.normal, 0.12 * unit);
        group.position.copy(position);
        scene.add(group);
        const surface = spot.normal.y > 0.6 ? 'Horizontal surface (shelf, table or ledge)' : Math.abs(spot.normal.y) < 0.35 ? 'Wall or vertical surface' : 'Sloped surface';
        hotspots.push({
          position,
          group,
          halo,
          info: { id: `spot-${index + 1}`, title: `Point of interest ${index + 1}`, surface, heightM: spot.heightM, distanceM: spot.distanceM },
        });
      });
    }

    function animateHotspots(time) {
      hotspots.forEach((hotspot, index) => {
        hotspot.halo.scale.setScalar(1 + Math.sin(time * 0.004 + index * 1.7) * 0.25);
      });
    }

    function playChime(step) {
      try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const start = audioContext.currentTime;
        const gain = audioContext.createGain();
        const oscillator = audioContext.createOscillator();
        const pitch = 660 * 2 ** (step / 12);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(pitch, start);
        oscillator.frequency.exponentialRampToValueAtTime(pitch * 1.5, start + 0.12);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      } catch {
        // Audio is optional; collecting still works without it.
      }
    }

    // Scatters gems on open floor spots in line of sight from the spawn point.
    function generateCollectibles(origin, floorY) {
      const candidates = [];
      const samples = 900;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const blocked = (point, direction, distance) => Boolean(
        physicsWorld.castRayAndGetNormal(new rapier.Ray(point, direction), distance, true, undefined, undefined, undefined, playerBody),
      );
      for (let index = 0; index < samples; index += 1) {
        const azimuth = index * goldenAngle;
        const elevation = -0.08 - ((index + 0.5) / samples) * 1.1;
        const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
        const hit = physicsWorld.castRayAndGetNormal(new rapier.Ray(origin, direction), 10 * unit, true, undefined, undefined, undefined, playerBody);
        if (!hit) continue;
        const point = new THREE.Vector3().copy(origin).addScaledVector(direction, hit.timeOfImpact);
        const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
        if (normal.dot(direction) > 0) normal.negate();
        const heightM = (point.y - floorY) * metersPerUnit;
        const horizontalM = Math.hypot(point.x - origin.x, point.z - origin.z) * metersPerUnit;
        if (horizontalM < 1.5 || normal.y < 0.55 || heightM < -0.25 || heightM > 0.4) continue;
        if (hotspots.some((hotspot) => hotspot.position.distanceTo(point) * metersPerUnit < 0.8)) continue;
        // Skip spots under furniture or hard against walls, which the player could not reach.
        const lifted = point.clone().addScaledVector(UP, 0.08 * unit);
        if (blocked(lifted, UP, 1.2 * unit)) continue;
        const probe = lifted.clone().addScaledVector(UP, 0.4 * unit);
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => blocked(probe, new THREE.Vector3(x, 0, z), 0.35 * unit))) continue;
        candidates.push(point);
      }
      if (!candidates.length) return;

      const chosen = [candidates.reduce((nearest, point) => (point.distanceTo(origin) < nearest.distanceTo(origin) ? point : nearest))];
      while (chosen.length < COLLECTIBLE_COUNT) {
        let next = null;
        let nextSpread = 0;
        for (const point of candidates) {
          const spread = Math.min(...chosen.map((picked) => picked.distanceTo(point))) * metersPerUnit;
          if (spread > nextSpread) { next = point; nextSpread = spread; }
        }
        if (!next || nextSpread < 0.8) break;
        chosen.push(next);
      }

      chosen.forEach((point, index) => {
        const group = new THREE.Group();
        const halo = new THREE.Mesh(gemHaloGeometry, gemHaloMaterial);
        group.add(new THREE.Mesh(gemGeometry, gemMaterial), halo);
        group.position.copy(point).addScaledVector(UP, 0.5 * unit);
        scene.add(group);
        collectibles.push({ group, halo, baseY: group.position.y, phase: index * 1.3, collectedAt: null });
      });
      setCollectTotal(collectibles.length);
    }

    function collectGem(gem, now) {
      gem.collectedAt = now;
      const found = collectibles.filter((item) => item.collectedAt !== null).length;
      setCollected(found);
      playChime(found - 1);
    }

    function updateCollectibles(now) {
      if (!collectibles.length || !playerBody) return;
      const body = playerBody.translation();
      const reach = playerRadius + 0.09 * unit + 0.2 * unit;
      collectibles.forEach((gem) => {
        if (!gem.group.visible) return;
        if (gem.collectedAt !== null) {
          const progress = (now - gem.collectedAt) / COLLECT_ANIMATION_MS;
          if (progress >= 1) {
            gem.group.visible = false;
            return;
          }
          gem.group.scale.setScalar(1 - progress);
          gem.halo.scale.setScalar(1 + progress * 3);
          gem.group.rotation.y += 0.25;
          return;
        }
        gem.group.rotation.y = now * 0.002 + gem.phase;
        gem.group.position.y = gem.baseY + Math.sin(now * 0.003 + gem.phase) * 0.04 * unit;
        gem.halo.scale.setScalar(1 + Math.sin(now * 0.004 + gem.phase) * 0.18);
        // Distance from the gem to the player's capsule axis, so walking into one collects it.
        const verticalOffset = gem.group.position.y - body.y;
        const beyondAxis = verticalOffset - clamp(verticalOffset, -playerHalfHeight, playerHalfHeight);
        if (Math.hypot(gem.group.position.x - body.x, gem.group.position.z - body.z, beyondAxis) < reach) collectGem(gem, now);
      });
    }

    function respawnCollectibles() {
      collectibles.forEach((gem) => {
        gem.collectedAt = null;
        gem.group.visible = true;
        gem.group.scale.setScalar(1);
      });
      setCollected(0);
      // Back to the start so a gem under the player is not instantly re-collected.
      resetPlayer();
    }

    function resetPlayer() {
      if (!collisionReady || !playerBody || !spawnPoint) return;
      playerBody.setTranslation(spawnPoint, true);
      verticalVelocity = 0;
      grounded = false;
      yaw = 0;
      pitch = 0;
      camera.position.set(spawnPoint.x, spawnPoint.y + eyeOffset, spawnPoint.z);
    }

    function toggleColliderDebug() {
      if (!debugMesh) return;
      debugMesh.visible = !debugMesh.visible;
      setColliderDebug(debugMesh.visible);
    }

    actionsRef.current = { reset: resetPlayer, toggleCollider: toggleColliderDebug, clearPins, respawnCollectibles };

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerenter', onPointerEnter);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);

    function findSpawnTranslation(colliderRayMesh) {
      const bounds = colliderRayMesh.geometry.boundingBox;
      const center = bounds.getCenter(new THREE.Vector3());
      const spanX = Math.max(1, bounds.max.x - bounds.min.x);
      const spanZ = Math.max(1, bounds.max.z - bounds.min.z);
      const marginX = Math.min(0.5, spanX * 0.05);
      const marginZ = Math.min(0.5, spanZ * 0.05);
      const origin = { x: clamp(0, bounds.min.x + marginX, bounds.max.x - marginX), z: clamp(0, bounds.min.z + marginZ, bounds.max.z - marginZ) };
      const candidates = [origin, { x: center.x, z: center.z }];
      for (const [xScale, zScale] of [[-0.18, 0], [0.18, 0], [0, -0.18], [0, 0.18], [-0.12, -0.12], [0.12, 0.12]]) {
        candidates.push({ x: center.x + spanX * xScale, z: center.z + spanZ * zScale });
      }
      candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
      const raycaster = new THREE.Raycaster();
      const normalMatrix = new THREE.Matrix3();
      for (const candidate of candidates) {
        raycaster.set(new THREE.Vector3(candidate.x, bounds.max.y + 5, candidate.z), new THREE.Vector3(0, -1, 0));
        raycaster.near = 0;
        raycaster.far = Math.max(10, bounds.max.y - bounds.min.y + 12);
        const floors = raycaster.intersectObject(colliderRayMesh, false).filter((hit) => {
          if (!hit.face) return false;
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          return hit.face.normal.clone().applyMatrix3(normalMatrix).y > 0.48;
        });
        const floor = floors.reduce((lowest, hit) => (!lowest || hit.point.y < lowest.point.y ? hit : lowest), null);
        if (floor) {
          return { x: floor.point.x, y: floor.point.y + playerHalfHeight + playerRadius + 0.08 * unit, z: floor.point.z };
        }
      }
      return { x: center.x, y: bounds.min.y + playerHalfHeight + playerRadius + 0.08 * unit, z: center.z };
    }

    function findMaraPlacement(spawn) {
      const spawnFloorY = spawn.y - (playerHalfHeight + playerRadius + 0.08 * unit);
      const angles = [0, 0.5, -0.5, 0.95, -0.95, 1.45, -1.45, Math.PI];
      for (const distance of [2.5, 3.2, 4, 4.8]) {
        for (const angle of angles) {
          const x = spawn.x + Math.sin(angle) * distance * unit;
          const z = spawn.z - Math.cos(angle) * distance * unit;
          const origin = new THREE.Vector3(x, spawn.y + 2.2 * unit, z);
          const floor = physicsWorld.castRayAndGetNormal(
            new rapier.Ray(origin, { x: 0, y: -1, z: 0 }),
            4.5 * unit,
            true,
            undefined,
            undefined,
            undefined,
            playerBody,
          );
          if (!floor || floor.normal.y < 0.7) continue;
          const floorY = origin.y - floor.timeOfImpact;
          if (Math.abs(floorY - spawnFloorY) > 0.35 * unit) continue;

          const overhead = physicsWorld.castRay(
            new rapier.Ray({ x, y: floorY + 0.08 * unit, z }, { x: 0, y: 1, z: 0 }),
            1.95 * unit,
            true,
            undefined,
            undefined,
            undefined,
            playerBody,
          );
          if (overhead && overhead.timeOfImpact < 1.8 * unit) continue;

          let blocked = false;
          for (let index = 0; index < 8; index += 1) {
            const angleAround = (index / 8) * Math.PI * 2;
            const direction = { x: Math.cos(angleAround), y: 0, z: Math.sin(angleAround) };
            const obstacle = physicsWorld.castRay(
              new rapier.Ray({ x, y: floorY + 0.85 * unit, z }, direction),
              0.38 * unit,
              true,
              undefined,
              undefined,
              undefined,
              playerBody,
            );
            if (obstacle && obstacle.timeOfImpact < 0.32 * unit) {
              blocked = true;
              break;
            }
          }
          if (!blocked) return { x, y: floorY, z };
        }
      }

      return {
        x: spawn.x,
        y: spawnFloorY,
        z: spawn.z - 2.5 * unit,
      };
    }

    function addMara(spawn) {
      const position = findMaraPlacement(spawn);
      const characterScale = 0.75 * unit;
      maraCharacter = createMaraCharacter();
      maraCharacter.scale.setScalar(characterScale);
      maraCharacter.position.set(position.x, position.y, position.z);
      maraCharacter.rotation.y = Math.atan2(position.x - spawn.x, position.z - spawn.z);
      maraCharacterRef.current = maraCharacter;
      setMaraAvailable(true);
      scene.add(maraCharacter);
      scene.add(new THREE.HemisphereLight('#f0eadb', '#574b3e', 1.6));
      const characterLight = new THREE.DirectionalLight('#ffe3b5', 2);
      characterLight.position.set(position.x - 2 * unit, position.y + 3 * unit, position.z + 3 * unit);
      scene.add(characterLight);
      hotspots.push({
        position: new THREE.Vector3(position.x, position.y + 1.45 * characterScale, position.z),
        group: maraCharacter,
        halo: maraCharacter.userData.marker,
        info: {
          id: 'mara',
          kind: 'character',
          title: 'Talk to Mara',
        },
      });
    }

    async function loadCollider() {
      if (!colliderMeshUrl) return;
      try {
        const gltf = await new GLTFLoader().loadAsync(colliderMeshUrl);
        if (disposed) {
          disposeObjectTree(gltf.scene);
          return;
        }
        colliderRoot = gltf.scene;
        colliderRoot.quaternion.set(1, 0, 0, 0);
        colliderRoot.updateMatrixWorld(true);
        colliderRoot.traverse((child) => {
          if (child.isMesh && child.geometry.attributes.position) colliderMeshes.push(child);
        });
        if (!colliderMeshes.length) throw new Error('The collider mesh has no usable triangles.');

        const { vertices, indices } = buildColliderBuffers(colliderMeshes);
        const spawnGeometry = new THREE.BufferGeometry();
        spawnGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        spawnGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        spawnGeometry.computeBoundingBox();
        spawnGeometry.computeBoundingSphere();
        const spawnMesh = new THREE.Mesh(spawnGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const spawn = findSpawnTranslation(spawnMesh);
        spawnGeometry.dispose();
        spawnMesh.material.dispose();
        rapier = await loadRapier();
        if (disposed) return;

        physicsWorld = new rapier.World({ x: 0, y: -9.81 * unit, z: 0 });
        physicsWorld.timestep = FIXED_STEP;
        const staticBody = physicsWorld.createRigidBody(rapier.RigidBodyDesc.fixed());
        physicsWorld.createCollider(rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.86), staticBody);
        playerBody = physicsWorld.createRigidBody(
          rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
        );
        playerCollider = physicsWorld.createCollider(
          rapier.ColliderDesc.capsule(playerHalfHeight, playerRadius).setFriction(0.78),
          playerBody,
        );
        characterController = physicsWorld.createCharacterController(0.035 * unit);
        characterController.setUp({ x: 0, y: 1, z: 0 });
        characterController.setSlideEnabled(true);
        characterController.enableAutostep(0.32 * unit, 0.18 * unit, false);
        characterController.setMaxSlopeClimbAngle(Math.PI / 4);
        characterController.setMinSlopeSlideAngle(Math.PI / 3);
        characterController.enableSnapToGround(0.22 * unit);
        physicsWorld.step();
        spawnPoint = { x: spawn.x, y: spawn.y, z: spawn.z };
        addMara(spawnPoint);
        generateHotspots(
          new THREE.Vector3(spawn.x, spawn.y + eyeOffset, spawn.z),
          spawn.y - (playerHalfHeight + playerRadius + 0.08 * unit),
        );
        generateCollectibles(
          new THREE.Vector3(spawn.x, spawn.y + eyeOffset, spawn.z),
          spawn.y - (playerHalfHeight + playerRadius + 0.08 * unit),
        );
        // The debug view reuses the collision buffers, so it shows exactly what the physics sees.
        const debugGeometry = new THREE.BufferGeometry();
        debugGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        debugGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        debugMesh = new THREE.Mesh(debugGeometry, new THREE.MeshBasicMaterial({ color: '#7dffb2', wireframe: true, transparent: true, opacity: 0.4, depthWrite: false }));
        debugMesh.visible = false;
        debugMesh.frustumCulled = false;
        scene.add(debugMesh);
        disposeObjectTree(colliderRoot);
        colliderRoot = null;
        colliderMeshes.length = 0;
        const translation = playerBody.translation();
        camera.position.set(translation.x, translation.y + eyeOffset, translation.z);
        collisionReady = true;
        colliderSettled = true;
        setColliderState('ready');
      } catch {
        if (physicsWorld) {
          physicsWorld.free();
          physicsWorld = null;
        }
        playerBody = null;
        playerCollider = null;
        characterController = null;
        collisionReady = false;
        colliderSettled = true;
        if (!disposed) setColliderState('error');
      }
    }

    function updateFreeMovement(deltaTime) {
      const { forward: forwardInput, right: rightInput, vertical: verticalInput, sprint } = getMovementInput(keys);
      movement.set(0, 0, 0);
      if (forwardInput || rightInput) {
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        movement.addScaledVector(forward, forwardInput).addScaledVector(right, rightInput);
      }
      movement.y = verticalInput;
      if (movement.lengthSq() > 0) {
        movement.normalize();
        const speed = sprint ? sprintSpeed : walkSpeed;
        camera.position.addScaledVector(movement, speed * deltaTime);
      }
    }

    function updatePhysics(step) {
      const { forward: forwardInput, right: rightInput, sprint } = getMovementInput(keys);
      if (!jumpQueued && grounded && !forwardInput && !rightInput) {
        const translation = playerBody.translation();
        camera.position.set(translation.x, translation.y + eyeOffset, translation.z);
        return;
      }
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      movement.set(0, 0, 0).addScaledVector(forward, forwardInput).addScaledVector(right, rightInput);
      if (movement.lengthSq() > 1) movement.normalize();

      if (jumpQueued && grounded) {
        verticalVelocity = 5.8 * unit;
        grounded = false;
      }
      jumpQueued = false;
      verticalVelocity = Math.max(-24 * unit, verticalVelocity - 9.81 * unit * step);
      const speed = sprint ? sprintSpeed : walkSpeed;
      const desired = {
        x: movement.x * speed * step,
        y: verticalVelocity * step,
        z: movement.z * speed * step,
      };
      characterController.computeColliderMovement(playerCollider, desired);
      const computedMovement = characterController.computedMovement();
      const current = playerBody.translation();
      playerBody.setNextKinematicTranslation({
        x: current.x + computedMovement.x,
        y: current.y + computedMovement.y,
        z: current.z + computedMovement.z,
      });
      physicsWorld.step();
      grounded = characterController.computedGrounded();
      if (grounded && verticalVelocity < 0) verticalVelocity = 0;
      const translation = playerBody.translation();
      camera.position.set(translation.x, translation.y + eyeOffset, translation.z);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const frameDuration = Math.max(0, now - lastFrameTime);
      const deltaTime = Math.min(0.05, frameDuration / 1000);
      lastFrameTime = now;
      performanceSampleCount += 1;
      performanceSampleDuration += frameDuration;
      if (!performanceModeEnabled && now - performanceSampleStart >= 1800) {
        const averageFrameDuration = performanceSampleDuration / Math.max(1, performanceSampleCount);
        performanceSampleStart = now;
        performanceSampleCount = 0;
        performanceSampleDuration = 0;
        if (averageFrameDuration > 22) {
          performanceModeEnabled = true;
          spark.lodSplatCount = LOW_FRAME_SPLAT_BUDGET;
          spark.setDirty();
          renderer.setPixelRatio(0.8);
          renderer.setSize(mount.clientWidth, mount.clientHeight, false);
          setPerformanceMode(true);
        }
      }
      if (worldReady && collisionReady && physicsWorld) {
        physicsAccumulator = Math.min(physicsAccumulator + deltaTime, FIXED_STEP * 4);
        while (physicsAccumulator >= FIXED_STEP) {
          updatePhysics(FIXED_STEP);
          physicsAccumulator -= FIXED_STEP;
        }
      } else if (worldReady) {
        updateFreeMovement(deltaTime);
      }
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      if (collisionReady && physicsWorld) {
        updateAim();
        animateHotspots(now);
        updateCollectibles(now);
      }
      if (maraCharacter) {
        const mouth = maraCharacter.userData.mouth;
        const opening = speakingRef.current
          ? Math.abs(Math.sin(now * 0.018)) * (0.45 + 0.3 * Math.sin(now * 0.007) ** 2)
          : 0;
        mouth.scale.y = 0.12 + opening;
        mouth.scale.x = 1 - opening * 0.18;
      }
      renderer.render(scene, camera);
      if (!worldReady && splatsReady && colliderSettled && spark.activeSplats > 0 && spark.lastSortTime > 0) {
        worldReady = true;
        setLoadState('ready');
      }
    });

    splats.initialized.then(() => {
      if (disposed) return;
      splatsReady = true;
    }).catch(() => {
      if (!disposed) setLoadState('error');
    });
    loadCollider();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerenter', onPointerEnter);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      renderer.setAnimationLoop(null);
      actionsRef.current = {};
      pins.length = 0;
      hotspots.length = 0;
      collectibles.length = 0;
      audioContext?.close?.().catch(() => {});
      [pinStemGeometry, pinHeadGeometry, hotspotCoreGeometry, hotspotHaloGeometry, reticleGeometry, gemGeometry, gemHaloGeometry].forEach((geometry) => geometry.dispose());
      [pinMaterial, hotspotCoreMaterial, hotspotHaloMaterial, reticleMaterial, gemMaterial, gemHaloMaterial].forEach((material) => material.dispose());
      physicsWorld?.free();
      sceneRef.current = null;
      maraCharacterRef.current = null;
      setMaraAvailable(false);
      if (colliderRoot) disposeObjectTree(colliderRoot);
      if (maraCharacter) {
        scene.remove(maraCharacter);
        disposeObjectTree(maraCharacter);
      }
      if (debugMesh) {
        scene.remove(debugMesh);
        debugMesh.geometry.dispose();
        debugMesh.material.dispose();
      }
      scene.remove(splats);
      splats.dispose();
      scene.remove(spark);
      spark.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, colliderMeshUrl, metricScale]);

  useEffect(() => {
    if (!customCharacterFile || !maraCharacterRef.current) return undefined;

    let cancelled = false;
    let loadedCharacter = null;
    let hiddenMeshes = [];
    const objectUrl = URL.createObjectURL(customCharacterFile);
    setCustomCharacterState('loading');
    setCustomCharacterError('');

    new GLTFLoader().loadAsync(objectUrl).then((gltf) => {
      if (cancelled) {
        disposeObjectTree(gltf.scene);
        return;
      }

      const character = maraCharacterRef.current;
      if (!character) {
        disposeObjectTree(gltf.scene);
        throw new Error('Mara is not available in this world.');
      }

      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const height = size.y > 0 ? size.y : Math.max(size.x, size.z);
      if (!Number.isFinite(height) || height <= 0) {
        disposeObjectTree(gltf.scene);
        throw new Error('This GLB does not contain a visible 3D character.');
      }

      const scale = (1.6 * (metricScale > 0 ? 1 / metricScale : 1)) / (height * character.scale.y);
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      const markerParts = new Set([character.userData.marker, character.userData.markerRing]);
      hiddenMeshes = [];
      character.traverse((child) => {
        if (child.isMesh && !markerParts.has(child)) {
          hiddenMeshes.push([child, child.visible]);
          child.visible = false;
        }
      });
      character.add(gltf.scene);
      loadedCharacter = gltf.scene;
      customCharacterRootRef.current = loadedCharacter;
      setCustomCharacterState('ready');
    }).catch((error) => {
      if (!cancelled) {
        setCustomCharacterError(error instanceof Error ? error.message : 'The GLB character could not be loaded.');
        setCustomCharacterState('error');
      }
    }).finally(() => {
      URL.revokeObjectURL(objectUrl);
    });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
      if (loadedCharacter) {
        loadedCharacter.parent?.remove(loadedCharacter);
        disposeObjectTree(loadedCharacter);
        if (customCharacterRootRef.current === loadedCharacter) customCharacterRootRef.current = null;
      }
      hiddenMeshes.forEach(([mesh, visible]) => { mesh.visible = visible; });
    };
  }, [customCharacterFile, maraAvailable, metricScale, url]);

  function handleCharacterChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setCustomCharacterError('Choose a single .glb character file.');
      setCustomCharacterState('error');
      return;
    }
    if (file.size > MAX_CUSTOM_MODEL_BYTES) {
      setCustomCharacterError('The GLB file must be 100 MB or smaller.');
      setCustomCharacterState('error');
      return;
    }
    setCustomCharacterFile(file);
    setCustomCharacterState('loading');
    setCustomCharacterError('');
  }

  function restoreMara() {
    setCustomCharacterFile(null);
    setCustomCharacterState('idle');
    setCustomCharacterError('');
  }

  return (
    <div className="world-canvas-wrap marble-world-canvas-wrap" ref={mountRef}>
      {loadState === 'loading' && <WorldLoadingPanel title={worldTitle} progress={loadProgress} stage={loadProgress === 100 ? colliderState === 'loading' ? 'Preparing walkable surfaces' : 'Rendering your first view' : 'Downloading your world'} />}
      {loadState === 'error' && <div className="world-fallback" role="alert">The generated world could not be loaded. Check the asset URL or try another quality level.</div>}
      {loadState === 'ready' && <div className="marble-collider-status" role="status">{colliderState === 'loading' ? 'PREPARING COLLISIONS' : colliderState === 'ready' ? 'COLLISIONS READY' : 'NO COLLIDER · FREE MOVE'}{performanceMode ? ' · PERFORMANCE MODE' : ''}</div>}
      {loadState === 'ready' && (
        <>
          <div className="marble-play-hud" role="toolbar" aria-label="World interactions">
            {colliderState === 'ready' && <>
              <button type="button" className={colliderDebug ? 'active' : ''} aria-pressed={colliderDebug} onClick={() => actionsRef.current.toggleCollider?.()}>Collider <kbd>C</kbd></button>
              <button type="button" disabled={!pinCount} onClick={() => actionsRef.current.clearPins?.()}>Clear pins ({pinCount}) <kbd>X</kbd></button>
              <button type="button" onClick={() => actionsRef.current.reset?.()}>Reset <kbd>R</kbd></button>
            </>}
            {maraAvailable && <>
              <input ref={characterInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={handleCharacterChange} />
              <button type="button" disabled={customCharacterState === 'loading'} onClick={() => characterInputRef.current?.click()}>Replace 3D model</button>
              {customCharacterFile && <button type="button" onClick={restoreMara}>Restore Mara</button>}
              {customCharacterState === 'loading' && <span className="custom-model-status" role="status">Loading {customCharacterFile?.name}…</span>}
              {customCharacterState === 'ready' && <span className="custom-model-status" role="status">Mara is using {customCharacterFile?.name}</span>}
              {customCharacterState === 'error' && <span className="custom-model-status error" role="alert">{customCharacterError}</span>}
            </>}
          </div>
          {colliderState === 'ready' && <div className="marble-crosshair" aria-hidden="true" />}
          {collectTotal > 0 && (
            <div className={`marble-collect-chip ${collected === collectTotal ? 'complete' : ''}`} role="status">
              <span>✦ {collected === collectTotal ? `All ${collectTotal} gems collected!` : `${collected} / ${collectTotal} gems`}</span>
              {collected > 0 && <button type="button" onClick={() => actionsRef.current.respawnCollectibles?.()}>{collected === collectTotal ? 'Play again' : 'Respawn'}</button>}
            </div>
          )}
          {aimPrompt && !openHotspot && <div className="marble-aim-prompt" role="status"><kbd>E</kbd> {aimPrompt}</div>}
          <div className="marble-controls-hint" aria-hidden="true">Drag to look · WASD move · Find your character to talk</div>
          {openHotspot && (
            <div className={`marble-note-card${openHotspot.kind === 'character' ? ' marble-chat-card' : ''}`} role="dialog" aria-label={openHotspot.title} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpenHotspot(null); } }}>
              <div className="marble-note-head">
                {openHotspot.kind === 'character' ? <div className="marble-chat-heading"><span className="marble-chat-avatar">M</span><div><strong>Mara</strong><small>Your world companion</small></div></div> : <strong>{openHotspot.title}</strong>}
                <button type="button" aria-label="Close note" onClick={() => setOpenHotspot(null)}>×</button>
              </div>
              {openHotspot.kind === 'character' ? (
                <>
                  <div className="marble-chat-messages" role="log" aria-label="Conversation with Mara" aria-live="polite">
                    {chatMessages.map((message, index) => (
                      <p className={`marble-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                        <strong>{message.role === 'assistant' ? 'Mara' : 'You'}</strong>
                        <span>{message.content}</span>
                      </p>
                    ))}
                    {chatBusy && <p className="marble-chat-message assistant pending"><strong>Mara</strong><span>Thinking…</span></p>}
                    <div ref={chatEndRef} />
                  </div>
                  {voice.listening && <span className="marble-note-hint" role="status">Listening... Finish speaking, then review the text and press Send.</span>}
                  {!voice.canListen && <span className="marble-note-hint">Microphone input needs a supported browser (such as Chrome or Edge) on HTTPS or localhost. You can still type.</span>}
                  {!voice.canSpeak && <span className="marble-note-hint">Spoken replies are not supported in this browser.</span>}
                  <form className="marble-chat-form" onSubmit={sendMaraMessage}>
                    <textarea
                      aria-label="Message Mara"
                      maxLength={1200}
                      rows={2}
                      value={chatDraft}
                      placeholder="Say something to Mara…"
                      onChange={(event) => setChatDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          if (!voice.listening) event.currentTarget.form.requestSubmit();
                        }
                      }}
                    />
                    <div className="marble-chat-composer-actions">
                      <div className="marble-voice-controls" role="group" aria-label="Voice controls">
                        <button type="button" disabled={!voice.canListen || chatBusy} aria-label={voice.listening ? 'Stop microphone' : 'Use microphone'} title={voice.listening ? 'Stop microphone' : 'Use microphone'} aria-pressed={voice.listening} onClick={voice.listening ? voice.stopListening : voice.startListening}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>
                        </button>
                        {voice.speaking && <button type="button" className="marble-stop-speaking" onClick={voice.stopSpeaking} aria-label="Stop speaking" title="Stop speaking"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg><span>Stop voice</span></button>}
                      </div>
                      <button className="marble-chat-send" type="submit" disabled={chatBusy || voice.listening || !chatDraft.trim()} aria-label="Send message to Mara" title="Send message">
                        {chatBusy ? <span className="button-spinner" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
                      </button>
                    </div>
                  </form>
                  {chatError && <p className="marble-chat-error" role="alert">{chatError}</p>}
                  {voice.voiceError && <p className="marble-chat-error" role="alert">{voice.voiceError}</p>}
                  <span className="marble-note-hint marble-chat-disclaimer">Mara is AI and can make mistakes. Esc to return to your world.</span>
                </>
              ) : (
                <>
                  <p className="marble-note-meta">{openHotspot.surface} · about {openHotspot.heightM.toFixed(1)} m high · {openHotspot.distanceM.toFixed(1)} m from the start point</p>
                  <label className="marble-note-label">Your note
                    <textarea
                      autoFocus
                      maxLength={400}
                      value={notes[openHotspot.id] || ''}
                      placeholder="What is interesting about this spot?"
                      onChange={(event) => updateNote(openHotspot.id, event.target.value)}
                    />
                  </label>
                  <span className="marble-note-hint">Saved in this browser · Esc or E to close</span>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
