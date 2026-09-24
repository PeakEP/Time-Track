import { FileDown, FolderOpen, LogOut, Redo2, Undo2, UserCog, Users } from "lucide-react";
import { useStore } from "../store";
import { signOut, useCloud } from "../cloud";

// Top brand bar: wordmark, designer/client toggle, undo/redo, project + export.
// Online: shows who's signed in and whether the shared project is saved.
// Clients are locked to the client view and only ever see their own project.
export function SettingsBar({ onOpenProjects, onExport }: { onOpenProjects: () => void; onExport: () => void }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const me = useCloud((s) => s.me);
  const title = useCloud((s) => s.title);
  const status = useCloud((s) => s.status);
  const syncError = useCloud((s) => s.error);
  const isClient = me?.kind === "customer";
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.canUndo());
  const canRedo = useStore((s) => s.canRedo());

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">R</span>
        <div className="brand-text">
          <strong>Robins Interiors &amp; Design</strong>
          <span>Custom Home Finish Selections</span>
        </div>
      </div>

      {me && (
        <div className="who">
          <span>
            {title ? <b>{title}</b> : isClient ? null : <span className="muted">Scratch project (this device only)</span>}
            {title && (
              <em className={"sync " + status} title={syncError}>
                {status === "saving" ? " · Saving…" : status === "error" ? " · Not saved — retrying" : " · Saved"}
              </em>
            )}
          </span>
          <span className="muted">
            {me.name}
            {isClient ? "" : " · staff"} ·{" "}
            <button className="link-btn" onClick={() => signOut()}>
              <LogOut size={11} /> Sign out
            </button>
          </span>
        </div>
      )}

      <div className="topbar-actions">
        {!isClient && (
        <div className="seg" role="group" aria-label="Mode">
          <button className={mode === "designer" ? "on" : ""} onClick={() => setMode("designer")}>
            <UserCog size={14} /> Designer
          </button>
          <button className={mode === "client" ? "on" : ""} onClick={() => setMode("client")}>
            <Users size={14} /> Client
          </button>
        </div>
        )}

        <div className="seg">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 size={14} />
          </button>
        </div>

        {!isClient && (
          <button className="btn-soft" onClick={onOpenProjects}>
            <FolderOpen size={14} /> Projects
          </button>
        )}
        <button className="btn-primary" onClick={onExport}>
          <FileDown size={14} /> Export PDF
        </button>
      </div>
    </header>
  );
}
