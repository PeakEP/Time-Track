import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Plus, Trash2, Upload, X } from "lucide-react";
import { useStore, defaultProject } from "../store";
import {
  closeProject, createProject, deleteProject, listProjects, openProject, useCloud, type ProjectSummary,
} from "../cloud";
import { downloadProject, readProjectFile } from "../utils/persistence";

// Staff-only (online): the shared intake list. Everyone with Triangle access
// sees every intake, so an employee can start one and the designer can open it.
export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const openId = useCloud((s) => s.projectId);

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cloud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Triangle intakes</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <div className="signin-error">{error}</div>}

        {creating ? (
          <NewProjectForm
            startFromCurrent={!openId && (Object.keys(current.selections).length > 0 || !!current.meta.client)}
            onCancel={() => setCreating(false)}
            onCreate={async (f) =>
              act(async () => {
                const start = f.fromCurrent ? current : defaultProject();
                const r = await createProject({
                  client: f.client,
                  title: f.title,
                  project: { ...start, meta: { ...start.meta, client: f.client } },
                });
                await openProject(r.project.id);
                setCreating(false);
                onClose();
              })
            }
          />
        ) : (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New intake
          </button>
        )}

        <div className="lib-list">
          {projects === null && <p className="muted">Loading…</p>}
          {projects?.length === 0 && <p className="muted">No intakes yet.</p>}
          {projects?.map((p) => (
            <div className={"lib-row" + (p.id === openId ? " is-open" : "")} key={p.id}>
              <div className="lib-meta">
                <strong>{p.title}</strong>
                <span className="muted">{p.client}</span>
                <span className="muted">
                  Updated {new Date(p.updatedAt).toLocaleString()} by {p.updatedByName}
                </span>
              </div>
              <div className="lib-actions">
                <button
                  className="btn-soft"
                  disabled={p.id === openId}
                  onClick={() => act(async () => { await openProject(p.id); onClose(); })}
                >
                  <FolderOpen size={13} /> {p.id === openId ? "Open" : "Open"}
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete intake"
                  onClick={() => {
                    if (confirm(`Delete "${p.title}"? This can't be undone.`)) act(() => deleteProject(p.id));
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn-soft" onClick={() => fileRef.current?.click()} title="Load a .json file into the open intake">
            <Upload size={14} /> Import .json
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
                const p = await readProjectFile(file);
                if (openId) useStore.getState().replaceProject(p);
                else loadProject(p);
                onClose();
              } catch (err) {
                alert("Could not open file: " + (err as Error).message);
              }
            }}
          />
          <button className="btn-soft" onClick={() => downloadProject(current, current.meta.client || "triangle-intake")}>
            <Download size={14} /> Export current
          </button>
          <span className="spacer" />
          {openId && (
            <button
              className="btn-soft"
              title="Close the shared intake and go back to a scratch intake on this device"
              onClick={() => {
                closeProject();
                useStore.getState().resetProject();
                onClose();
              }}
            >
              Close intake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewProjectForm({
  startFromCurrent, onCancel, onCreate,
}: {
  startFromCurrent: boolean;
  onCancel: () => void;
  onCreate: (f: { client: string; title: string; fromCurrent: boolean }) => Promise<void>;
}) {
  const [client, setClient] = useState("");
  const [title, setTitle] = useState("");
  const [fromCurrent, setFromCurrent] = useState(startFromCurrent);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="new-project"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!client.trim()) return alert("Enter the customer's name");
        setBusy(true);
        try {
          await onCreate({ client: client.trim(), title: title.trim() || client.trim(), fromCurrent });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>Customer name</span>
        <input autoFocus value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Jane Smith" />
      </label>
      <label className="field">
        <span>Intake title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Smith — 12 Elm St kitchen" />
      </label>
      {startFromCurrent && (
        <label className="check">
          <input type="checkbox" checked={fromCurrent} onChange={(e) => setFromCurrent(e.target.checked)} />
          Start from the selections currently on screen
        </label>
      )}
      <div className="new-project-actions">
        <button type="button" className="btn-soft" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create intake"}
        </button>
      </div>
    </form>
  );
}
