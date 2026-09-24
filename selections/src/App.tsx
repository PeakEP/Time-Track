import { useEffect, useState } from "react";
import { SettingsBar } from "./components/SettingsBar";
import { CategoryNav } from "./components/CategoryNav";
import { OptionGrid } from "./components/OptionGrid";
import { SummaryPanel } from "./components/SummaryPanel";
import { ProjectDialog } from "./components/ProjectDialog";
import { Welcome } from "./components/Welcome";
import { SignIn } from "./components/SignIn";
import { CloudProjectsDialog } from "./components/CloudProjectsDialog";
import { attachAutosave, loadCatalog, restoreDraft, useStore } from "./store";
import { attachCloudSync, fetchConfig, lastProjectId, openProject, resume, useCloud } from "./cloud";
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
  // "checking" → "signin" | "in" (online) or "local" (no server: works as before)
  const [access, setAccess] = useState<"checking" | "signin" | "in" | "local">("checking");
  const me = useCloud((s) => s.me);
  const cloudProjectId = useCloud((s) => s.projectId);

  // Load catalog, restore any autosaved draft, and attach autosave + sync.
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
    const detachSync = attachCloudSync();
    return () => {
      alive = false;
      detach();
      detachSync();
    };
  }, [setCatalog, loadProject]);

  // Online (Netlify) the app needs a sign-in; without a server it runs locally.
  useEffect(() => {
    fetchConfig().then(async (cfg) => {
      if (!cfg) {
        if (import.meta.env.DEV) return setAccess("local");
        return setError("Couldn't reach the Finish Selections service. Check your connection and reload.");
      }
      if (!cfg.live) return setAccess("local");
      useCloud.setState({ live: true });
      setAccess((await resume()) ? "in" : "signin");
    });
  }, []);

  // Signed out (button or expired session) → back to the sign-in screen.
  useEffect(() => {
    if (access === "in" && !me) setAccess("signin");
  }, [access, me]);

  // After sign-in: clients go straight to their project; staff reopen the
  // project they last had open (if any).
  useEffect(() => {
    if (access !== "in" || !me || !ready) return;
    const id = me.kind === "customer" ? me.projectId : lastProjectId();
    if (id && useCloud.getState().projectId !== id)
      openProject(id).catch((e: Error) => me.kind === "customer" && setError(e.message));
  }, [access, me, ready]);

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

  if (access === "signin")
    return (
      <div className="app-shell">
        <SignIn onSignedIn={() => setAccess("in")} />
      </div>
    );

  const waitingForClientProject = me?.kind === "customer" && !cloudProjectId;

  return (
    <div className="app-shell">
      <SettingsBar onOpenProjects={() => setProjectsOpen(true)} onExport={handleExport} />

      {error ? (
        <div className="app-error">Could not load the catalog: {error}</div>
      ) : !ready || access === "checking" || waitingForClientProject ? (
        <div className="app-loading">Loading…</div>
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
      {projectsOpen &&
        (access === "in" ? (
          <CloudProjectsDialog onClose={() => setProjectsOpen(false)} />
        ) : (
          <ProjectDialog onClose={() => setProjectsOpen(false)} />
        ))}
    </div>
  );
}
