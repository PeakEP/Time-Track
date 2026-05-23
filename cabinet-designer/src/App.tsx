import { useEffect } from "react";
import { useStore, loadCatalog } from "./store";
import { CatalogPalette } from "./components/CatalogPalette";
import { Plan2D } from "./components/Plan2D";
import { Scene3D } from "./components/Scene3D";
import { SchedulePanel } from "./components/SchedulePanel";
import { SettingsBar } from "./components/SettingsBar";

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
          {view === "split" && (
            <div className="split">
              <div className="split-pane"><Plan2D /></div>
              <div className="split-divider" />
              <div className="split-pane"><Scene3D /></div>
            </div>
          )}
        </section>
        <SchedulePanel />
      </main>
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
