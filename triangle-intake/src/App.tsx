import { useEffect, useMemo, useState } from "react";
import { TopBar } from "./components/TopBar";
import { StepRail } from "./components/StepRail";
import { StepView } from "./components/StepView";
import { SignIn } from "./components/SignIn";
import { Welcome } from "./components/Welcome";
import { ProjectsDialog } from "./components/ProjectsDialog";
import { attachAutosave, loadCatalog, restoreDraft, useStore } from "./store";
import { attachCloudSync, fetchConfig, lastProjectId, openProject, resume, useCloud } from "./cloud";
import { visibleSteps } from "./utils/visibility";
import { buildSummary, verificationFlags } from "./utils/summary";
import { exportIntakePdf } from "./utils/pdf";

export default function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const loadProject = useStore((s) => s.loadProject);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const activeStep = useStore((s) => s.activeStep);
  const setActiveStep = useStore((s) => s.setActiveStep);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  // "checking" → "signin" | "in" (online) or "local" (no server)
  const [access, setAccess] = useState<"checking" | "signin" | "in" | "local">("checking");
  const me = useCloud((s) => s.me);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => {
        if (!alive) return;
        setCatalog(c);
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

  useEffect(() => {
    fetchConfig().then(async (cfg) => {
      if (!cfg) {
        if (import.meta.env.DEV) return setAccess("local");
        return setError("Couldn't reach the Triangle Intake service. Check your connection and reload.");
      }
      if (!cfg.live) return setAccess("local");
      useCloud.setState({ live: true });
      setAccess((await resume()) ? "in" : "signin");
    });
  }, []);

  useEffect(() => {
    if (access === "in" && !me) setAccess("signin");
  }, [access, me]);

  // After sign-in, staff reopen the project they last had open (if any).
  useEffect(() => {
    if (access !== "in" || !me || !ready) return;
    const id = lastProjectId();
    if (id && useCloud.getState().projectId !== id) openProject(id).catch(() => {});
  }, [access, me, ready]);

  // Undo / redo keyboard shortcuts.
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

  const steps = useMemo(() => (catalog ? visibleSteps(catalog, project) : []), [catalog, project]);

  // Keep the active step valid as the path narrows.
  useEffect(() => {
    if (!steps.length) return;
    if (!activeStep || !steps.some((s) => s.id === activeStep)) setActiveStep(steps[0].id);
  }, [steps, activeStep, setActiveStep]);

  async function handleExport() {
    const { catalog: c, project: p } = useStore.getState();
    if (!c) return;
    try {
      await exportIntakePdf({
        meta: p.meta,
        lines: buildSummary(c, p),
        requests: p.requests,
        flags: verificationFlags(c, p),
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

  return (
    <div className="app-shell">
      <TopBar onOpenProjects={() => setProjectsOpen(true)} onExport={handleExport} />

      {error ? (
        <div className="app-error">Could not load the Triangle catalog: {error}</div>
      ) : !ready || access === "checking" ? (
        <div className="app-loading">Loading…</div>
      ) : (
        <div className="workspace">
          <StepRail steps={steps} />
          <StepView steps={steps} onExport={handleExport} />
        </div>
      )}

      <footer className="app-footer">
        <span>Robins Interiors &amp; Design · Triangle Kitchen Intake</span>
        <span className="muted">J.M Robins Construction Ltd.</span>
      </footer>

      <Welcome />
      {projectsOpen &&
        (access === "in" ? (
          <ProjectsDialog onClose={() => setProjectsOpen(false)} />
        ) : (
          <LocalProjectsDialog onClose={() => setProjectsOpen(false)} />
        ))}
    </div>
  );
}

// Minimal local (no-server) project tools: import/export a .json file.
import { downloadProject, readProjectFile } from "./utils/persistence";
import { useRef } from "react";
import { X, Upload, Download } from "lucide-react";

function LocalProjectsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Intake file</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="muted">Save this intake to a file, or open one you saved earlier.</p>
        <div className="modal-foot">
          <button className="btn-soft" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Open .json
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                loadProject(await readProjectFile(file));
                onClose();
              } catch (err) {
                alert("Could not open file: " + (err as Error).message);
              }
            }}
          />
          <button className="btn-primary" onClick={() => downloadProject(project, project.meta.client || "triangle-intake")}>
            <Download size={14} /> Save .json
          </button>
        </div>
      </div>
    </div>
  );
}
