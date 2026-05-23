import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useStore, loadCatalog, attachAutosave, restoreDraft, clearDraft } from "./store";
import { CatalogPalette } from "./components/CatalogPalette";
import { Plan2D } from "./components/Plan2D";
import { SchedulePanel, ScheduleRail } from "./components/SchedulePanel";
import { SettingsBar } from "./components/SettingsBar";
import { Inspector } from "./components/Inspector";
import { Welcome } from "./components/Welcome";
import { Elevation } from "./components/Elevation";

// 3D scene is large (three.js + r3f). Lazy-load so first paint is fast.
const LazyScene3D = lazy(() =>
  import("./components/Scene3D").then((m) => ({ default: m.Scene3D })),
);

function ThreePane() {
  return (
    <Suspense fallback={<div className="three-loading">Loading 3D…</div>}>
      <LazyScene3D />
    </Suspense>
  );
}

export default function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const setCatalogError = useStore((s) => s.setCatalogError);
  const setProject = useStore((s) => s.setProject);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const catalog = useStore((s) => s.catalog);
  const catalogError = useStore((s) => s.catalogError);
  const view = useStore((s) => s.view);
  const scheduleCollapsed = useStore((s) => s.scheduleCollapsed);
  const [paletteWidth, setPaletteWidth] = useState(() => readWidth("jmrc.cabinet.paletteW", 280));
  const [scheduleWidth, setScheduleWidth] = useState(() => readWidth("jmrc.cabinet.scheduleW", 340));

  useEffect(() => {
    writeWidth("jmrc.cabinet.paletteW", paletteWidth);
  }, [paletteWidth]);
  useEffect(() => {
    writeWidth("jmrc.cabinet.scheduleW", scheduleWidth);
  }, [scheduleWidth]);
  const [draftPrompt, setDraftPrompt] = useState<{ name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e) => {
        if (!cancelled) setCatalogError(e.message ?? "Unknown error");
      });
    // restore draft prompt
    const draft = restoreDraft();
    if (draft && (draft.items.length > 0 || draft.meta.name !== "Untitled Kitchen")) {
      setDraftPrompt({ name: draft.meta.name });
    }
    // start autosave only after initial paint to avoid persisting the default project
    const unsub = attachAutosave();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [setCatalog, setCatalogError]);

  // global keyboard shortcuts (undo/redo)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        undo();
        e.preventDefault();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        redo();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function acceptDraft() {
    const draft = restoreDraft();
    if (draft) setProject(draft);
    setDraftPrompt(null);
  }
  function discardDraft() {
    clearDraft();
    setDraftPrompt(null);
  }

  return (
    <div className="app-shell">
      <SettingsBar />
      <Welcome />
      {catalogError && (
        <div className="banner-error">Failed to load catalog: {catalogError}</div>
      )}
      {draftPrompt && (
        <div className="banner-info">
          <span>
            Found an autosaved draft: <strong>{draftPrompt.name}</strong>. Restore it?
          </span>
          <span className="banner-actions">
            <button className="btn-soft" onClick={acceptDraft}>Restore</button>
            <button className="btn-soft" onClick={discardDraft}>Discard</button>
          </span>
        </div>
      )}
      <main
        className="workspace"
        style={{
          gridTemplateColumns: scheduleCollapsed
            ? `${paletteWidth}px 6px 1fr 44px`
            : `${paletteWidth}px 6px 1fr 6px ${scheduleWidth}px`,
        }}
      >
        <CatalogPalette />
        <PaneResizer
          onDelta={(dx) => setPaletteWidth((w) => clamp(w + dx, 200, 480))}
          title="Drag to resize catalog"
        />
        <section className="canvas-area">
          {view === "plan" && <Plan2D />}
          {view === "front" && <Elevation />}
          {view === "3d" && <ThreePane />}
          {view === "split" && <SplitView />}
          <Inspector />
        </section>
        {!scheduleCollapsed && (
          <PaneResizer
            onDelta={(dx) => setScheduleWidth((w) => clamp(w - dx, 240, 560))}
            title="Drag to resize schedule"
          />
        )}
        {scheduleCollapsed ? <ScheduleRail /> : <SchedulePanel />}
      </main>
      <footer className="app-footer">
        <span>
          {catalog
            ? `Catalog: OPPEIN RTA ${catalog._meta.pricing_year ?? 2025} · ${catalog.products.length} SKUs · ${catalog.finishes.length} finishes`
            : "Loading catalog…"}
        </span>
        <span>
          Cmd/Ctrl-Z undo · Shift-Cmd/Ctrl-Z redo · R rotate · Del delete
        </span>
        <span>J.M Robins Construction Ltd.</span>
      </footer>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function readWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}
function writeWidth(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore
  }
}

function PaneResizer({ onDelta, title }: { onDelta: (dx: number) => void; title: string }) {
  const dragging = useRef(false);
  const lastX = useRef(0);
  function down(e: React.PointerEvent) {
    dragging.current = true;
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    if (dx !== 0) onDelta(dx);
  }
  function up(e: React.PointerEvent) {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }
  return (
    <div
      className="pane-resizer"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      title={title}
    />
  );
}

function SplitView() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const dragging = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const r = (e.clientX - rect.left) / rect.width;
    setRatio(Math.max(0.18, Math.min(0.82, r)));
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const pct = `${(ratio * 100).toFixed(2)}%`;
  const pctRest = `${((1 - ratio) * 100).toFixed(2)}%`;

  return (
    <div
      ref={wrapRef}
      className="split"
      style={{ gridTemplateColumns: `${pct} 6px ${pctRest}` }}
    >
      <div className="split-pane"><Plan2D /></div>
      <div
        className="split-divider draggable"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize"
      />
      <div className="split-pane"><ThreePane /></div>
    </div>
  );
}
