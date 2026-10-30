export default function WorldLoadingPanel({ title = 'Your world', progress = null, stage = 'Connecting to your world' }) {
  return (
    <div className="world-loading-panel" role="status" aria-live="polite">
      <div className="world-loading-content">
        <div className="world-loading-orbit" aria-hidden="true"><span /></div>
        <span className="world-loading-kicker">GETTING EVERYTHING READY</span>
        <h3>Step inside, in a moment.</h3>
        <p>{title}</p>
        <div className={`world-loading-track${progress === null || progress === 100 ? ' indeterminate' : ''}`} role="progressbar" aria-label="World download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}>
          <span style={progress !== null && progress < 100 ? { width: `${progress}%` } : undefined} />
        </div>
        <span className="world-loading-stage">{stage}{progress !== null && progress < 100 ? ` · ${progress}%` : ''}</span>
        <small>Preparing the scene, walkable surfaces, and your companion.</small>
      </div>
    </div>
  );
}
