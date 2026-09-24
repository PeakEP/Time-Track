import { useEffect, useState } from "react";
import { SettingsBar } from "./components/SettingsBar";
import { CategoryNav } from "./components/CategoryNav";
import { OptionGrid } from "./components/OptionGrid";
import { SummaryPanel } from "./components/SummaryPanel";
import { ProjectDialog } from "./components/ProjectDialog";
import { Welcome } from "./components/Welcome";
import { attachAutosave, loadCatalog, restoreDraft, useStore } from "./store";
import { computeLines, computeTotals } from "./utils/pricing";
import { exportSelectionsPdf } from "./utils/pdf";

export default function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const loadProject = useStore((s) => s.loadProject);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // Load catalog, restore any autosaved draft, and attach autosave.
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((catalog) => {
        if (!alive) return;
        setCatalog(catalog);
        const draft = restoreDraft();
        if (draft) loadProject(draft);
        setReady(true);
      })
      .catch((e: Error) => alive && setError(e.message));
    const detach = attachAutosave();
    return () => {
      alive = false;
      detach();
    };
  }, [setCatalog, loadProject]);

  // Undo / redo keyboard shortcuts (ignore typing in inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  async function handleExport() {
    const { project, catalog, mode } = useStore.getState();
    const lines = computeLines(project, catalog);
    const totals = computeTotals(lines, project);
    try {
      await exportSelectionsPdf({
        meta: project.meta,
        basePrice: project.basePrice,
        lines,
        totals,
        discount: project.discount,
        mode,
      });
    } catch (e) {
      alert("PDF export failed: " + (e as Error).message);
    }
  }

  return (
    <div className="app-shell">
      <SettingsBar onOpenProjects={() => setProjectsOpen(true)} onExport={handleExport} />

      {error ? (
        <div className="app-error">Could not load the catalog: {error}</div>
      ) : !ready ? (
        <div className="app-loading">Loading catalog…</div>
      ) : (
        <div className="workspace">
          <CategoryNav />
          <OptionGrid />
          <SummaryPanel />
        </div>
      )}

      <footer className="app-footer">
        <span>Robins Interiors &amp; Design · Custom Home Finish Selections</span>
        <span className="muted">J.M Robins Construction Ltd.</span>
      </footer>

      <Welcome />
      {projectsOpen && <ProjectDialog onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}
