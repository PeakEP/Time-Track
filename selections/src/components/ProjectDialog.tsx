import { useRef, useState } from "react";
import { Download, FolderOpen, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { useStore } from "../store";
import {
  deleteNamed,
  downloadProject,
  listSaved,
  readProjectFile,
  saveNamed,
} from "../utils/persistence";

// Modal: named in-browser library + import/export of .json project files.
export function ProjectDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const resetProject = useStore((s) => s.resetProject);

  const [name, setName] = useState(project.meta.project || project.meta.client || "");
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = listSaved();

  function save() {
    const n = name.trim();
    if (!n) {
      alert("Enter a name to save this project.");
      return;
    }
    saveNamed(n, project);
    force((x) => x + 1);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      loadProject(await readProjectFile(file));
      onClose();
    } catch (err) {
      alert("Could not open file: " + (err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Projects</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="save-row">
          <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary" onClick={save}>
            <Save size={14} /> Save
          </button>
        </div>

        <div className="lib-list">
          {saved.length === 0 && <p className="muted">No saved projects yet.</p>}
          {saved.map((entry) => (
            <div className="lib-row" key={entry.name}>
              <div className="lib-meta">
                <strong>{entry.name}</strong>
                <span className="muted">{new Date(entry.file.savedAt).toLocaleString()}</span>
              </div>
              <div className="lib-actions">
                <button
                  className="btn-soft"
                  onClick={() => {
                    loadProject(entry.file.project);
                    onClose();
                  }}
                >
                  <FolderOpen size={13} /> Open
                </button>
                <button
                  className="icon-btn"
                  title="Download .json"
                  onClick={() => downloadProject(entry.file.project, entry.name)}
                >
                  <Download size={13} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete"
                  onClick={() => {
                    deleteNamed(entry.name);
                    force((x) => x + 1);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn-soft" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import .json
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFile} />
          <button className="btn-soft" onClick={() => downloadProject(project, name || "selections")}>
            <Download size={14} /> Export current
          </button>
          <span className="spacer" />
          <button
            className="btn-soft danger"
            onClick={() => {
              if (confirm("Start a new blank project? Unsaved changes will be cleared.")) {
                resetProject();
                onClose();
              }
            }}
          >
            <RotateCcw size={14} /> New / Reset
          </button>
        </div>
      </div>
    </div>
  );
}
