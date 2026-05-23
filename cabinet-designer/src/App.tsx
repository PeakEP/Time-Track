import { useEffect, useRef, useState } from "react";
import { useStore, loadCatalog } from "./store";
import { CatalogPalette } from "./components/CatalogPalette";
import { Plan2D } from "./components/Plan2D";
import { Scene3D } from "./components/Scene3D";
import { SchedulePanel } from "./components/SchedulePanel";
import { SettingsBar } from "./components/SettingsBar";
import { Inspector } from "./components/Inspector";

export default function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const setCatalogError = useStore((s) => s.setCatalogError);
  const catalog = useStore((s) => s.catalog);
  const catalogError = useStore((s) => s.catalogError);
  const view = useStore((s) => s.view);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e) => {
        if (!cancelled) setCatalogError(e.message ?? "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [setCatalog, setCatalogError]);

  return (
    <div className="app-shell">
      <SettingsBar />
      {catalogError && (
        <div className="banner-error">Failed to load catalog: {catalogError}</div>
      )}
      <main className="workspace">
        <CatalogPalette />
        <section className="canvas-area">
          {view === "plan" && <Plan2D />}
          {view === "3d" && <Scene3D />}
          {view === "split" && <SplitView />}
          <Inspector />
        </section>
        <SchedulePanel />
      </main>
      {/* footer */}
      <footer className="app-footer">
        <span>
          {catalog
            ? `Catalog: OPPEIN RTA ${catalog._meta.pricing_year ?? 2025} · ${catalog.products.length} SKUs · ${catalog.finishes.length} finishes`
            : "Loading catalog…"}
        </span>
        <span>J.M Robins Construction Ltd.</span>
      </footer>
    </div>
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
      <div className="split-pane"><Scene3D /></div>
    </div>
  );
}
