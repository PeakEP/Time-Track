import { FileDown, FolderOpen, LogOut, Redo2, Undo2 } from "lucide-react";
import { useStore } from "../store";
import { signOut, useCloud } from "../cloud";

// Top brand bar: wordmark, who's signed in + save status, undo/redo, projects,
// export. Online: shows whether the shared project is saved.
export function TopBar({ onOpenProjects, onExport }: { onOpenProjects: () => void; onExport: () => void }) {
  const me = useCloud((s) => s.me);
  const title = useCloud((s) => s.title);
  const status = useCloud((s) => s.status);
  const syncError = useCloud((s) => s.error);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.canUndo());
  const canRedo = useStore((s) => s.canRedo());

  return (
    <header className="topbar">
      {me && <a className="suite-link" href="/" title="Back to the JMRC suite">← Suite</a>}
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <polygon points="12,4 21,20 3,20" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="brand-text">
          <strong>Triangle Kitchen Intake</strong>
          <span>Robins Interiors &amp; Design</span>
        </div>
      </div>

      {me && (
        <div className="who">
          <span>
            {title ? <b>{title}</b> : <span className="muted">Scratch intake (this device only)</span>}
            {title && (
              <em className={"sync " + status} title={syncError}>
                {status === "saving" ? " · Saving…" : status === "error" ? " · Not saved — retrying" : " · Saved"}
              </em>
            )}
          </span>
          <span className="muted">
            {me.name} · staff ·{" "}
            <button className="link-btn" onClick={() => signOut()}>
              <LogOut size={11} /> Sign out
            </button>
          </span>
        </div>
      )}

      <div className="topbar-actions">
        <div className="seg">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 size={14} />
          </button>
        </div>
        <button className="btn-soft" onClick={onOpenProjects}>
          <FolderOpen size={14} /> {me ? "Intakes" : "File"}
        </button>
        <button className="btn-primary" onClick={onExport}>
          <FileDown size={14} /> Export PDF
        </button>
      </div>
    </header>
  );
}
