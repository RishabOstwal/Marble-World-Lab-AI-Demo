import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorldCanvas from './WorldCanvas.jsx';
import WorldLoadingPanel from './WorldLoadingPanel.jsx';

const MarbleWorldCanvas = lazy(() => import('./MarbleWorldCanvas.jsx'));

const WORLD_IMAGE = '/images/alpine-world.png';
const MAX_REFERENCE_IMAGES = 8;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PINNED_MARBLE_WORLD_ID = 'd34de01c-bb93-4aac-bed8-234af788d18c';

const STARTING_WORLDS = [
  {
    id: 'stillwater',
    title: 'Stillwater at dusk',
    subtitle: 'Alpine lake · Text prompt',
    created: 'Today',
    image: WORLD_IMAGE,
    tint: 'blue',
  },
  {
    id: 'pine-hollow',
    title: 'Pine hollow',
    subtitle: 'Forest clearing · Text prompt',
    created: 'Yesterday',
    image: WORLD_IMAGE,
    tint: 'green',
  },
  {
    id: 'quiet-ridge',
    title: 'The quiet ridge',
    subtitle: 'Mountain valley · Reference image',
    created: 'Oct 12',
    image: WORLD_IMAGE,
    tint: 'violet',
  },
];

const PINNED_WORLD_PLACEHOLDER = {
  id: PINNED_MARBLE_WORLD_ID,
  title: 'Modern Living and Dining Room',
  subtitle: 'Loading from Marble',
  created: 'Today',
  image: WORLD_IMAGE,
  tint: 'blue',
  pinned: true,
  pending: true,
};

const EXAMPLE_PROMPTS = [
  'A cedar cabin beside a still lake at blue hour',
  'A sunlit forest trail with soft morning fog',
  'A quiet mountain meadow after the rain',
];

async function readApiJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function Icon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  const shapes = {
    studio: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.7 8.3-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z" /></>,
    worlds: <><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H3.7a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m7 10 5 5 5-5" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></>,
    keyboard: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15.5h8" /></>,
    mouse: <><rect x="6.5" y="2.5" width="11" height="19" rx="5.5" /><path d="M12 2.8v5" /></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    image: <><rect x="3" y="3.5" width="18" height="17" rx="2.5" /><circle cx="8.5" cy="9" r="1.4" /><path d="m4 17 5-5 3.2 3.2 2.2-2.2L20 18" /></>,
    text: <><path d="M4 6V4h16v2M12 4v16M8.5 20h7" /></>,
    sparkle: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
    check: <path d="m5 12 4.3 4.3L19 6.8" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    leaf: <><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z" /><path d="M4 21c2-5 6-8 11-11" /></>,
    play: <path d="m9 6 10 6-10 6V6Z" />,
  };

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name] || shapes.studio}
    </svg>
  );
}

function App() {
  const [worlds, setWorlds] = useState([PINNED_WORLD_PLACEHOLDER, ...STARTING_WORLDS]);
  const [activeWorldId, setActiveWorldId] = useState(PINNED_MARBLE_WORLD_ID);
  const [viewerLoad, setViewerLoad] = useState(null);
  const [activeNav, setActiveNav] = useState('studio');
  const [inputMode, setInputMode] = useState('text');
  const [quality, setQuality] = useState('draft');
  const [prompt, setPrompt] = useState('A quiet alpine lake at blue hour, framed by tall pines and distant snow-covered peaks. A small meadow opens onto the water.');
  const [imageDirection, setImageDirection] = useState('');
  const [uploadedImages, setUploadedImages] = useState([]);
  const [generationState, setGenerationState] = useState('idle');
  const [generationStage, setGenerationStage] = useState('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [apiHealthChecked, setApiHealthChecked] = useState(false);
  const [pinnedWorldState, setPinnedWorldState] = useState('loading');
  const [pinnedWorldError, setPinnedWorldError] = useState('');
  const [message, setMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [worldReference, setWorldReference] = useState('');
  const [importState, setImportState] = useState('idle');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);
  const uploadedImagesRef = useRef([]);
  const viewerRef = useRef(null);
  const generationAbortRef = useRef(null);

  const activeWorld = worlds.find((world) => world.id === activeWorldId) || worlds[0];
  const onViewerLoadStateChange = useCallback((state) => {
    setViewerLoad({ url: activeWorld.splatUrl, state });
  }, [activeWorld.splatUrl]);
  const viewerState = activeWorld.splatUrl
    ? viewerLoad?.url === activeWorld.splatUrl ? viewerLoad.state : 'loading'
    : activeWorld.pinned ? pinnedWorldState === 'loading' ? 'loading' : 'error' : 'ready';
  const pinnedWorldIsActive = activeWorld.id === PINNED_MARBLE_WORLD_ID && !activeWorld.splatUrl;
  const filteredWorlds = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return worlds;
    return worlds.filter((world) => `${world.title} ${world.subtitle}`.toLowerCase().includes(query));
  }, [worlds, searchText]);

  uploadedImagesRef.current = uploadedImages;

  useEffect(() => () => {
    uploadedImagesRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((response) => response.json())
      .then((health) => {
        if (!active) return;
        setApiConfigured(Boolean(health.apiConfigured));
        setApiHealthChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setApiConfigured(false);
        setApiHealthChecked(true);
      });
    return () => {
      active = false;
      generationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!apiHealthChecked) return undefined;
    setActiveWorldId(PINNED_MARBLE_WORLD_ID);
    setWorlds((current) => current.some((world) => world.id === PINNED_MARBLE_WORLD_ID)
      ? current
      : [PINNED_WORLD_PLACEHOLDER, ...current]);
    if (!apiConfigured) {
      setPinnedWorldState('error');
      setPinnedWorldError('Add a valid WLT_API_KEY to .env and restart the local server to load this private Marble world.');
      setWorlds((current) => current.map((world) => world.id === PINNED_MARBLE_WORLD_ID
        ? { ...world, subtitle: 'Marble connection required' }
        : world));
      return undefined;
    }
    let active = true;
    setPinnedWorldState('loading');
    setPinnedWorldError('');
    fetch('/api/worlds/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldReference: PINNED_MARBLE_WORLD_ID, quality: 'balanced' }),
    })
      .then(readApiJson)
      .then((result) => {
        if (!active) return;
        if (!result.world?.splatUrl || !result.world?.id) throw new Error('Marble did not return a loadable world asset.');
        if (result.world.id !== PINNED_MARBLE_WORLD_ID) throw new Error('Marble returned a different world ID than the pinned link.');
        const pinnedWorld = { ...result.world, pinned: true, pending: false };
        setWorlds((current) => [pinnedWorld, ...current.filter((world) => world.id !== pinnedWorld.id)]);
        setActiveWorldId(pinnedWorld.id);
        setPinnedWorldState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setPinnedWorldState('error');
        setPinnedWorldError(error.message || 'Could not load the pinned Marble world.');
        setWorlds((current) => current.map((world) => world.id === PINNED_MARBLE_WORLD_ID
          ? { ...world, subtitle: 'Could not load from Marble' }
          : world));
      });
    return () => { active = false; };
  }, [apiConfigured, apiHealthChecked]);

  function navigate(destination) {
    setActiveNav(destination);
    if (destination === 'settings') {
      setSettingsOpen(true);
      return;
    }
    const target = destination === 'worlds' ? 'library' : destination === 'explore' ? 'viewer' : 'top';
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pickExample(example) {
    setPrompt(example);
    setInputMode('text');
    setMessage('Prompt added. Make it yours, then generate a preview.');
    window.setTimeout(() => setMessage(''), 3200);
  }

  function addReferenceImages(files) {
    const existing = new Set(uploadedImages.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
    const validFiles = [];
    const problems = [];
    Array.from(files).forEach((file) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        problems.push(`${file.name}: choose a PNG, JPG, or WEBP image.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`${file.name}: images must be 12 MB or smaller.`);
      } else {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!existing.has(key)) {
          existing.add(key);
          validFiles.push(file);
        }
      }
    });

    const availableSlots = Math.max(0, MAX_REFERENCE_IMAGES - uploadedImages.length);
    if (validFiles.length > availableSlots) problems.push(`You can add up to ${MAX_REFERENCE_IMAGES} reference images.`);
    const newImages = validFiles.slice(0, availableSlots).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      id: `${file.name}:${file.size}:${file.lastModified}`,
    }));
    if (newImages.length) setUploadedImages((current) => [...current, ...newImages]);

    if (problems.length) setMessage(problems.join(' '));
    else if (newImages.length) setMessage(`${uploadedImages.length + newImages.length} reference image${uploadedImages.length + newImages.length === 1 ? '' : 's'} ready.`);
    else setMessage('These images are already selected.');
    window.setTimeout(() => setMessage(''), 2600);
  }

  function handleFileChange(event) {
    addReferenceImages(event.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeUploadedImage(image) {
    URL.revokeObjectURL(image.url);
    setUploadedImages((current) => current.filter(({ id }) => id !== image.id));
  }

  function clearUploadedImages() {
    uploadedImages.forEach(({ url }) => URL.revokeObjectURL(url));
    setUploadedImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadReferenceImage(file, signal) {
    const response = await fetch('/api/media-assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
      signal,
    });
    const payload = await readApiJson(response);
    return payload.mediaAssetId;
  }

  async function startGeneration() {
    if (inputMode === 'text' && !prompt.trim()) {
      setMessage('Add a text prompt to create a world.');
      return;
    }
    if (inputMode === 'image' && !uploadedImages.length) {
      setMessage('Choose at least one reference image to continue.');
      return;
    }

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerationState('generating');
    setGenerationStage(inputMode === 'image' ? 'Uploading reference images' : 'Submitting your prompt');
    setMessage('');

    try {
      const imageAssetIds = [];
      if (inputMode === 'image') {
        for (const [index, { file }] of uploadedImages.entries()) {
          setGenerationStage(`Uploading reference image ${index + 1} of ${uploadedImages.length}`);
          imageAssetIds.push(await uploadReferenceImage(file, controller.signal));
        }
      }
      const submission = await readApiJson(await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: inputMode,
          imageAssetIds: inputMode === 'image' ? imageAssetIds : undefined,
          prompt: inputMode === 'image' ? imageDirection.trim() : prompt.trim(),
          quality,
        }),
      }));
      setGenerationStage('Generating world with Marble');

      let generatedWorld;
      while (!generatedWorld) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        if (controller.signal.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
        const status = await readApiJson(await fetch(`/api/worlds/operations/${encodeURIComponent(submission.operationId)}?quality=${quality}`, { signal: controller.signal }));
        if (!status.done) continue;
        if (status.error) throw new Error(status.error);
        generatedWorld = status.world;
      }

      if (!generatedWorld?.splatUrl) throw new Error('Marble finished, but did not return a browser-loadable 3D world.');
      setGenerationStage('Loading the generated 3D world');
      setWorlds((current) => [generatedWorld, ...current]);
      setActiveWorldId(generatedWorld.id);
      setGenerationState('complete');
      setMessage('Your reference images have been turned into a 3D world and opened in the viewer.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setGenerationState('error');
        setMessage(error.message || 'World generation failed. Check the server and Marble API key.');
      }
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
    }
  }

  async function importMarbleWorld(event) {
    event.preventDefault();
    if (!worldReference.trim() || importState === 'loading') return;
    setImportState('loading');
    setImportError('');

    try {
      const result = await readApiJson(await fetch('/api/worlds/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldReference: worldReference.trim(), quality }),
      }));
      if (!result.world?.splatUrl || !result.world?.id) {
        throw new Error('Marble did not return a loadable world for that link or ID.');
      }
      const importedWorld = result.world;
      const isPinnedWorld = importedWorld.id === PINNED_MARBLE_WORLD_ID;
      const worldToOpen = { ...importedWorld, pinned: isPinnedWorld, pending: false };
      setWorlds((current) => [worldToOpen, ...current.filter((world) => world.id !== worldToOpen.id)]);
      setActiveWorldId(worldToOpen.id);
      if (isPinnedWorld) {
        setPinnedWorldState('ready');
        setPinnedWorldError('');
      }
      setImportOpen(false);
      setWorldReference('');
      navigate('explore');
      setMessage(`${importedWorld.title} opened in the viewer.`);
    } catch (error) {
      setImportError(error.message || 'Could not open that Marble world.');
    } finally {
      setImportState('idle');
    }
  }

  async function toggleFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (!document.fullscreenElement) await element.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setMessage('Fullscreen is unavailable in this browser.');
    }
  }

  function shareWorld() {
    const shareText = `${activeWorld.title} — Wyntrr World Studio`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareText).then(
        () => setMessage('World title copied to clipboard.'),
        () => setMessage('Share link is not connected in this prototype.'),
      );
    } else {
      setMessage('Share link is not connected in this prototype.');
    }
    window.setTimeout(() => setMessage(''), 3000);
  }

  return (
    <div className="app-shell" id="top">
      <aside className="sidebar">
        <a className="brand" href="#top" onClick={() => setActiveNav('studio')} aria-label="Wyntrr Studio home">
          <span className="brand-mark"><Icon name="leaf" size={19} strokeWidth={2.1} /></span>
          <span className="brand-name">wyntrr<span>.</span></span>
        </a>

        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-item ${activeNav === 'studio' ? 'selected' : ''}`} onClick={() => navigate('studio')}>
            <Icon name="studio" size={18} /><span>Studio</span>
          </button>
          <button className={`nav-item ${activeNav === 'explore' ? 'selected' : ''}`} onClick={() => navigate('explore')}>
            <Icon name="compass" size={18} /><span>Explore</span>
          </button>
          <button className={`nav-item ${activeNav === 'worlds' ? 'selected' : ''}`} onClick={() => navigate('worlds')}>
            <Icon name="worlds" size={18} /><span>My worlds</span><span className="nav-count">{worlds.length}</span>
          </button>
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-heading"><span>RECENT WORLDS</span><button aria-label="Browse worlds" onClick={() => navigate('worlds')}><Icon name="plus" size={15} /></button></div>
        <div className="recent-world-list">
          {worlds.slice(0, 4).map((world) => (
            <button key={world.id} className={`recent-world ${activeWorldId === world.id ? 'active' : ''}`} onClick={() => { setActiveWorldId(world.id); navigate('explore'); }}>
              <span className={`recent-thumb tint-${world.tint}`} style={{ backgroundImage: `url(${world.image})` }} />
              <span className="recent-world-title">{world.title}</span>
              {activeWorldId === world.id && <span className="recent-active-dot" />}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className="connection-icon"><span className="status-dot" /></span>
            <div><strong>{apiConfigured ? 'Marble API ready' : 'Demo workspace'}</strong><small>{apiConfigured ? 'World generation enabled' : 'Add a World Labs API key'}</small></div>
            <button className="connection-info" title="Connect the backend to generate real worlds"><Icon name="info" size={15} /></button>
          </div>
          <button className={`nav-item settings-link ${activeNav === 'settings' ? 'selected' : ''}`} onClick={() => navigate('settings')}>
            <Icon name="settings" size={18} /><span>Settings</span>
          </button>
          <div className="profile-row"><span className="profile-avatar">W</span><span className="profile-copy"><strong>Workspace</strong><small>Personal plan</small></span><button className="icon-button subtle" aria-label="Workspace options"><Icon name="dots" size={17} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /><strong>World studio</strong></div>
          <div className="topbar-actions">
            <span className="demo-pill"><span className="demo-pill-dot" />PROTOTYPE</span>
            <button className="topbar-help" onClick={() => setMessage('Your image is submitted to Marble by the local server. The API key stays server-side; the finished Gaussian splat opens in the viewer.')}><Icon name="info" size={16} /><span>How it works</span></button>
            <span className="top-avatar">W</span>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />WORLD STUDIO</div>
              <h1>Make a world.<br className="mobile-break" /> <span>Step inside.</span></h1>
              <p>Bring a place to life from a few words or up to eight images.</p>
            </div>
            <button className="library-link" onClick={() => navigate('worlds')}><Icon name="worlds" size={17} /> <span>World library</span><span className="library-link-count">{worlds.length.toString().padStart(2, '0')}</span><Icon name="arrow" size={14} /></button>
          </section>

          <section className="studio-grid" aria-label="World creation and preview">
            <div className="viewer-column">
              <div className="viewer-card" id="viewer" ref={viewerRef}>
                <div className="world-scene">
                  {activeWorld.splatUrl ? (
                    <Suspense fallback={<div className="world-canvas-wrap"><WorldLoadingPanel title={activeWorld.title} stage="Starting the 3D viewer" /></div>}>
                      <MarbleWorldCanvas key={activeWorld.splatUrl} url={activeWorld.splatUrl} colliderMeshUrl={activeWorld.colliderMeshUrl} metricScale={activeWorld.metricScale} worldTitle={activeWorld.title} onLoadStateChange={onViewerLoadStateChange} />
                    </Suspense>
                  ) : pinnedWorldIsActive && pinnedWorldState === 'loading' ? (
                    <div className="world-canvas-wrap">
                      <WorldLoadingPanel title={activeWorld.title} />
                    </div>
                  ) : pinnedWorldIsActive ? (
                    <div className="world-fallback marble-pinned-fallback" role="alert">
                      <div><strong>Could not load this Marble world</strong><p>{pinnedWorldError || 'Check the API key and try again.'}</p><button type="button" onClick={() => { setWorldReference(PINNED_MARBLE_WORLD_ID); setImportError(''); setImportOpen(true); }}>Retry loading world</button></div>
                    </div>
                  ) : <WorldCanvas variant={activeWorld.tint} title={activeWorld.title} />}
                  <div className="scene-topline">
                    <div className="scene-state"><span className="scene-state-dot" /><span>WORLD PREVIEW</span><span className="state-separator">/</span><span className="state-muted">{viewerState === 'loading' ? 'LOADING' : viewerState === 'error' ? 'CHECK WORLD' : 'READY'}</span></div>
                    <div className="scene-actions">
                      <button className="scene-icon-button" title="Share world" onClick={shareWorld}><Icon name="arrow" size={16} /></button>
                      <button className="scene-icon-button" title="Fullscreen preview" onClick={toggleFullscreen}><Icon name="expand" size={16} /></button>
                    </div>
                  </div>
                  <div className="scene-bottomline">
                    <div className="scene-world-title">
                      <span className="scene-kicker"><Icon name="leaf" size={13} /> YOUR WORLD</span>
                      <h2>{activeWorld.title}</h2>
                      <p>{activeWorld.subtitle}</p>
                    </div>
                  </div>
                </div>
                <div className="viewer-footer">
                  <div className="asset-status"><span className="asset-check">{viewerState === 'loading' ? <span className="progress-spinner" /> : <Icon name={viewerState === 'error' ? 'info' : 'check'} size={12} strokeWidth={2.5} />}</span><span>{viewerState === 'loading' ? 'Preparing your world' : viewerState === 'error' ? 'World unavailable' : '3D scene ready'}</span><span className="footer-divider" /><span>{activeWorld.splatUrl || activeWorld.pinned ? 'Generated by Marble' : 'Local demo world'}</span></div>
                  <button className="viewer-open-button" onClick={toggleFullscreen}>Open preview <Icon name="expand" size={15} /></button>
                </div>
              </div>
              <div className="viewer-caption"><span><strong>World viewer</strong> <span className="caption-dot">·</span> {activeWorld.subtitle}</span><span className="viewer-caption-right"><span className="tiny-live-dot" /> {activeWorld.splatUrl ? 'Free-look preview' : 'Interactive 3D'}</span></div>
            </div>

            <aside className="builder-card" aria-label="Create a world">
              <div className="builder-heading">
                <div className="builder-title-icon"><Icon name="sparkle" size={18} /></div>
                <div><div className="builder-overline">WORLD BUILDER</div><h2>Create a world</h2></div>
                <button className="icon-button builder-more" title="More options"><Icon name="dots" size={18} /></button>
              </div>
              <div className="builder-tabs" role="tablist" aria-label="World input type">
                <button role="tab" aria-selected={inputMode === 'text'} className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}><Icon name="text" size={15} /> Text prompt</button>
                <button role="tab" aria-selected={inputMode === 'image'} className={inputMode === 'image' ? 'active' : ''} onClick={() => setInputMode('image')}><Icon name="image" size={15} /> Image input</button>
              </div>

              {inputMode === 'text' ? (
                <div className="prompt-block">
                  <label htmlFor="world-prompt" className="field-label">Describe the place you want to explore <span>OPTIONAL DETAIL</span></label>
                  <div className="prompt-textarea-wrap">
                    <textarea id="world-prompt" value={prompt} maxLength={500} onChange={(event) => setPrompt(event.target.value)} placeholder="A quiet forest clearing, with morning light filtering through the trees…" />
                    <div className="prompt-textarea-bottom"><span className="prompt-suggestion"><Icon name="sparkle" size={13} /> Be vivid and specific</span><span>{prompt.length}/500</span></div>
                  </div>
                  <div className="examples-heading"><span>TRY AN IDEA</span><button onClick={() => setPrompt('')}>Clear</button></div>
                  <div className="example-list">
                    {EXAMPLE_PROMPTS.slice(0, 2).map((example) => <button key={example} className="example-chip" onClick={() => pickExample(example)}>{example}<Icon name="plus" size={13} /></button>)}
                  </div>
                </div>
              ) : (
                <div className="prompt-block image-mode-block">
                  <span className="field-label">Choose reference images <span>PNG · JPG · WEBP · UP TO 8</span></span>
                  <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleFileChange} />
                  {uploadedImages.length > 0 && <div className="uploaded-images-grid">
                    {uploadedImages.map((image, index) => (
                      <div className="uploaded-image-card" key={image.id}>
                        <img src={image.url} alt={`Reference image ${index + 1}: ${image.file.name}`} />
                        <div className="uploaded-image-copy"><strong>{image.file.name}</strong><span>{(image.file.size / (1024 * 1024)).toFixed(1)} MB</span></div>
                        <button type="button" className="icon-button clear-upload" aria-label={`Remove ${image.file.name}`} onClick={() => removeUploadedImage(image)}><Icon name="close" size={14} /></button>
                      </div>
                    ))}
                  </div>}
                  <button type="button" className={`upload-dropzone ${uploadedImages.length ? 'has-uploads' : ''}`} disabled={uploadedImages.length >= MAX_REFERENCE_IMAGES} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addReferenceImages(event.dataTransfer.files || []); }}>
                    <span className="upload-icon"><Icon name="upload" size={19} /></span><strong>{uploadedImages.length >= MAX_REFERENCE_IMAGES ? 'Image limit reached' : uploadedImages.length ? 'Add more images' : 'Drop images here'}</strong><span>or <u>browse files</u></span><small>{uploadedImages.length} / {MAX_REFERENCE_IMAGES} selected · 12 MB each</small>
                  </button>
                  {uploadedImages.length > 0 && <button type="button" className="clear-all-uploads" onClick={clearUploadedImages}>Remove all images</button>}
                  <div className="image-guidance"><Icon name="info" size={15} /><span>For sharper multi-image worlds, use sharp, well-lit views of the same space with matching dimensions and some overlap.</span></div>
                  <label htmlFor="image-world-direction" className="field-label image-direction-label">Add a little direction <span>OPTIONAL</span></label>
                  <textarea id="image-world-direction" className="image-description-input" value={imageDirection} maxLength={500} onChange={(event) => setImageDirection(event.target.value)} placeholder="Describe details to add around the scene…" />
                </div>
              )}

              <div className="quality-block">
                <div className="quality-label-row"><span className="field-label">Render quality</span><button className="quality-info" title={quality === 'draft' ? 'Marble 1.1 Plus, loading the lightweight 100k splat' : 'Marble 1.1 Plus, loading the highest available splat resolution'}><Icon name="info" size={14} /></button></div>
                <div className="quality-options" role="radiogroup" aria-label="Render quality">
                  <button role="radio" aria-checked={quality === 'draft'} className={quality === 'draft' ? 'selected' : ''} onClick={() => setQuality('draft')}><span className="quality-dot" /><span><strong>Draft</strong><small>Quick iteration</small></span></button>
                  <button role="radio" aria-checked={quality === 'full'} className={quality === 'full' ? 'selected' : ''} onClick={() => setQuality('full')}><span className="quality-dot" /><span><strong>Full quality</strong><small>More detail</small></span></button>
                </div>
              </div>

              {generationState === 'generating' && <div className="generation-progress"><div className="progress-copy"><span><span className="progress-spinner" /> {generationStage}</span></div><div className="progress-track"><span className="progress-indeterminate" /></div><small>Marble generation runs asynchronously and can take a few minutes.</small></div>}
              {generationState === 'complete' && <div className="generation-success"><span><Icon name="check" size={14} /></span> Generated world opened in your library</div>}

              <button className={`generate-button ${generationState === 'generating' ? 'loading' : ''}`} onClick={startGeneration} disabled={generationState === 'generating'}>
                {generationState === 'generating' ? <><span className="button-spinner" /> Creating world…</> : <><Icon name="sparkle" size={17} /> Generate world <Icon name="arrow" size={15} className="generate-arrow" /></>}
              </button>
              <div className="generation-footnote"><span className="footnote-icon"><Icon name="clock" size={14} /></span><span>World generation is asynchronous and may take a few minutes.</span></div>
              <div className={`backend-callout ${apiConfigured ? 'is-connected' : ''}`}><span className="backend-callout-dot" /><span>{apiConfigured ? 'Marble connected' : 'Needs setup'}</span><span className="callout-separator">·</span><button onClick={() => setMessage(apiConfigured ? 'The local server is configured with a World Labs project key.' : 'Copy .env.example to .env, add WLT_API_KEY, and restart the dev server.')}>{apiConfigured ? 'Image to world ready' : 'Set up World Labs key'}</button></div>
            </aside>
          </section>

          <section className="library-section" id="library">
            <div className="library-heading-row">
              <div><div className="library-eyebrow">YOUR COLLECTION</div><h2>Your worlds <span>{worlds.length.toString().padStart(2, '0')}</span></h2></div>
              <div className="library-actions">
                {searchOpen && <input className="library-search-input" autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search worlds" aria-label="Search worlds" />}
                <button className={`icon-button search-button ${searchOpen ? 'active' : ''}`} aria-label="Search worlds" onClick={() => { setSearchOpen((open) => !open); setSearchText(''); }}><Icon name={searchOpen ? 'close' : 'search'} size={17} /></button>
                <button className="view-all-button import-library-button" title="Open a Marble world by URL or ID" onClick={() => { setImportError(''); setImportOpen(true); }}><Icon name="worlds" size={14} /> Import from Marble</button>
                <button className="view-all-button" onClick={() => navigate('worlds')}>View library <Icon name="arrow" size={14} /></button>
              </div>
            </div>
            {filteredWorlds.length ? (
              <div className="world-grid">
                {filteredWorlds.slice(0, 4).map((world) => (
                  <button key={world.id} className={`world-card ${activeWorldId === world.id ? 'current' : ''}`} onClick={() => { setActiveWorldId(world.id); navigate('explore'); }}>
                    <span className={`world-card-image tint-${world.tint} ${world.pending ? 'world-card-loading' : ''}`} style={{ backgroundImage: world.pending ? 'none' : `linear-gradient(180deg, rgba(10, 17, 19, 0) 30%, rgba(10, 17, 19, .55) 100%), url(${world.image})` }}>
                      <span className="world-card-tag">{world.pinned ? 'MARBLE' : world.subtitle.includes('Reference') || world.subtitle.includes('Image to world') ? 'IMAGE' : world.splatUrl ? 'MARBLE' : 'TEXT'}</span>
                      {world.pending && <span className="world-card-loading-label">{pinnedWorldState === 'loading' ? 'LOADING WORLD' : 'LOAD FAILED'}</span>}
                      <span className="world-card-open"><Icon name="arrow" size={15} /></span>
                      {world.id === activeWorldId && <span className="world-card-current-label"><span /> {world.pending ? 'OPENING' : 'OPEN NOW'}</span>}
                    </span>
                    <span className="world-card-meta"><span><strong>{world.title}</strong><small>{world.subtitle}</small></span><span className="world-card-date">{world.created}</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-search"><span>No worlds match “{searchText}”</span><button onClick={() => setSearchText('')}>Clear search</button></div>
            )}
          </section>

          <footer className="page-footer"><span>WYNTRR WORLD STUDIO</span><span>World generation · Exploration · Your imagination</span><span>Prototype build <b>01</b></span></footer>
        </div>
      </main>

      {message && <div className="toast-message" role="status"><span className="toast-mark"><Icon name="info" size={15} /></span>{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}><Icon name="close" size={14} /></button></div>}
      {importOpen && (
        <div className="modal-backdrop" onClick={() => { if (importState !== 'loading') setImportOpen(false); }}>
          <div className="settings-modal marble-import-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="import-world-title">
            <div className="settings-modal-top">
              <span className="settings-modal-icon"><Icon name="worlds" size={18} /></span>
              <button className="icon-button" onClick={() => setImportOpen(false)} aria-label="Close import dialog" disabled={importState === 'loading'}><Icon name="close" size={17} /></button>
            </div>
            <h2 id="import-world-title">Open a Marble world</h2>
            <p>Paste the URL of an individual world or its world ID. The API worlds listing page alone does not identify a specific world.</p>
            <form className="marble-import-form" onSubmit={importMarbleWorld}>
              <label htmlFor="marble-world-reference">Marble world URL or ID</label>
              <input id="marble-world-reference" value={worldReference} onChange={(event) => setWorldReference(event.target.value)} placeholder="https://marble.worldlabs.ai/worlds/..." autoComplete="off" autoFocus required />
              {importError && <div className="marble-import-error" role="alert">{importError}</div>}
              <button className="settings-close-button" type="submit" disabled={importState === 'loading' || !worldReference.trim()}>{importState === 'loading' ? 'Opening world…' : 'Open in viewer'}</button>
            </form>
          </div>
        </div>
      )}
      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="settings-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="settings-modal-top"><span className="settings-modal-icon"><Icon name="settings" size={18} /></span><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><Icon name="close" size={17} /></button></div><h2 id="settings-title">Workspace settings</h2><p>The local server keeps your World Labs API key private. Add it to .env to generate and load worlds from images.</p><div className="settings-state-row"><span className="backend-callout-dot" /><span>World Labs API</span><strong>{apiConfigured ? 'Connected' : 'Not connected'}</strong></div><button className="settings-close-button" onClick={() => setSettingsOpen(false)}>Got it</button></div></div>}
    </div>
  );
}

export default App;
