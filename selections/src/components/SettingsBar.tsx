import { FileDown, FolderOpen, Redo2, Undo2, UserCog, Users } from "lucide-react";
import { useStore } from "../store";

// Top brand bar: wordmark, designer/client toggle, undo/redo, project + export.
export function SettingsBar({ onOpenProjects, onExport }: { onOpenProjects: () => void; onExport: () => void }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
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

      <div className="topbar-actions">
        <div className="seg" role="group" aria-label="Mode">
          <button className={mode === "designer" ? "on" : ""} onClick={() => setMode("designer")}>
            <UserCog size={14} /> Designer
          </button>
          <button className={mode === "client" ? "on" : ""} onClick={() => setMode("client")}>
            <Users size={14} /> Client
          </button>
        </div>

        <div className="seg">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 size={14} />
          </button>
        </div>

        <button className="btn-soft" onClick={onOpenProjects}>
          <FolderOpen size={14} /> Projects
        </button>
        <button className="btn-primary" onClick={onExport}>
          <FileDown size={14} /> Export PDF
        </button>
      </div>
    </header>
  );
}
