import { useEffect, useRef, useState } from "react";
import { Copy, Download, FolderOpen, KeyRound, Plus, Power, Trash2, Upload, X } from "lucide-react";
import { useStore, defaultProject } from "../store";
import {
  closeProject,
  createProject,
  deleteProject,
  listProjects,
  openProject,
  resetPin,
  setAccess,
  shareLink,
  useCloud,
  type ProjectSummary,
} from "../cloud";
import { downloadProject, readProjectFile } from "../utils/persistence";

// Staff-only (online): the shared project list. Each project has one client
// sign-in (name + PIN) that opens that project, locked to the client view.
export function CloudProjectsDialog({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.project);
  const catalog = useStore((s) => s.catalog);
  const loadProject = useStore((s) => s.loadProject);
  const openId = useCloud((s) => s.projectId);

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [share, setShare] = useState<{ name: string; pin: string; title: string } | null>(null);
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

  // "Done" on the PIN screen closes the whole dialog — the project is open.
  if (share) return <ShareModal {...share} onClose={onClose} />;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cloud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Client projects</h3>
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
                const start = f.fromCurrent ? current : defaultProject(catalog?._meta.base_price ?? 0);
                const r = await createProject({ ...f, project: { ...start, meta: { ...start.meta, client: f.client, project: f.title } } });
                await openProject(r.project.id);
                setCreating(false);
                setShare({ name: r.customerName, pin: r.pin, title: r.project.title });
              })
            }
          />
        ) : (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New client project
          </button>
        )}

        <div className="lib-list">
          {projects === null && <p className="muted">Loading…</p>}
          {projects?.length === 0 && <p className="muted">No client projects yet.</p>}
          {projects?.map((p) => (
            <div className={"lib-row" + (p.id === openId ? " is-open" : "")} key={p.id}>
              <div className="lib-meta">
                <strong>{p.title}</strong>
                <span className="muted">
                  {p.client}
                  {p.customer && (
                    <>
                      {" · client signs in as "}
                      <b>{p.customer.name}</b>
                      {!p.customer.active && " (access off)"}
                    </>
                  )}
                </span>
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
                  <FolderOpen size={13} /> {p.id === openId ? "Opened" : "Open"}
                </button>
                <button
                  className="icon-btn"
                  title="Share: issue a new client PIN"
                  onClick={() => {
                    if (!p.customer) return;
                    if (!confirm(`Issue a new PIN for ${p.customer.name}? Their old PIN stops working.`)) return;
                    act(async () => {
                      const r = await resetPin(p.id);
                      setShare({ name: r.customerName, pin: r.pin, title: p.title });
                    });
                  }}
                >
                  <KeyRound size={13} />
                </button>
                <button
                  className="icon-btn"
                  title={p.customer?.active ? "Turn off client access" : "Turn on client access"}
                  onClick={() => act(() => setAccess(p.id, !p.customer?.active))}
                >
                  <Power size={13} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete project"
                  onClick={() => {
                    if (confirm(`Delete "${p.title}" and its client sign-in? This can't be undone.`))
                      act(() => deleteProject(p.id));
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn-soft" onClick={() => fileRef.current?.click()} title="Load a .json file into the open project">
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
          <button className="btn-soft" onClick={() => downloadProject(current, current.meta.project || "selections")}>
            <Download size={14} /> Export current
          </button>
          <span className="spacer" />
          {openId && (
            <button
              className="btn-soft"
              title="Close the client project and go back to a scratch project on this device"
              onClick={() => {
                closeProject();
                useStore.getState().resetProject();
                onClose();
              }}
            >
              Close project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewProjectForm({
  startFromCurrent,
  onCancel,
  onCreate,
}: {
  startFromCurrent: boolean;
  onCancel: () => void;
  onCreate: (f: { client: string; title: string; customerName: string; fromCurrent: boolean }) => Promise<void>;
}) {
  const [client, setClient] = useState("");
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [fromCurrent, setFromCurrent] = useState(startFromCurrent);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="new-project"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!client.trim()) return alert("Enter the client's name");
        setBusy(true);
        try {
          await onCreate({ client: client.trim(), title: title.trim() || client.trim(), customerName: (customerName || client).trim(), fromCurrent });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>Client name</span>
        <input autoFocus value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Jane Smith" />
      </label>
      <label className="field">
        <span>Project</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Smith — 12 Elm St" />
      </label>
      <label className="field">
        <span>Client signs in as</span>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={client || "same as client name"} />
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
          {busy ? "Creating…" : "Create & issue PIN"}
        </button>
      </div>
    </form>
  );
}

// Shown once after a PIN is issued: the PIN can't be looked up again later.
export function ShareModal({ name, pin, title, onClose }: { name: string; pin: string; title: string; onClose: () => void }) {
  const link = shareLink(name);
  const message =
    `Hi ${name.split(" ")[0]}, here's the link to choose your finishes for ${title}:\n${link}\n\n` +
    `Sign in with your name (${name}) and PIN: ${pin}\n\nRobins Interiors & Design`;
  const [copied, setCopied] = useState("");
  const copy = (what: string, text: string) =>
    navigator.clipboard?.writeText(text).then(() => setCopied(what), () => setCopied(""));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Client sign-in for {title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="muted">
          Send these to your client. They'll only see the client view of this one project. The PIN is shown{" "}
          <b>once</b>. If it's lost, issue a new one from Projects.
        </p>
        <div className="share-grid">
          <span>Signs in as</span>
          <b>{name}</b>
          <span>PIN</span>
          <b className="pin-big">{pin}</b>
          <span>Link</span>
          <a href={link} target="_blank" rel="noreferrer" className="share-link">
            {link}
          </a>
        </div>
        <div className="modal-foot">
          <button className="btn-soft" onClick={() => copy("link", link)}>
            <Copy size={14} /> {copied === "link" ? "Copied" : "Copy link"}
          </button>
          <button className="btn-soft" onClick={() => copy("message", message)}>
            <Copy size={14} /> {copied === "message" ? "Copied" : "Copy message with PIN"}
          </button>
          <span className="spacer" />
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
