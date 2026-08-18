import type { ProjectDocument } from "../types";

const LIBRARY_KEY = "rid-selections-library";

export interface SavedEntry {
  name: string;
  doc: ProjectDocument;
}

export function listSaved(): SavedEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, ProjectDocument>) : {};
    return Object.entries(obj)
      .map(([name, doc]) => ({ name, doc }))
      .sort((a, b) => (b.doc.savedAt || "").localeCompare(a.doc.savedAt || ""));
  } catch {
    return [];
  }
}

function writeLibrary(lib: Record<string, ProjectDocument>): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

export function saveNamed(name: string, doc: ProjectDocument): void {
  const lib: Record<string, ProjectDocument> = {};
  for (const e of listSaved()) lib[e.name] = e.doc;
  lib[name] = doc;
  writeLibrary(lib);
}

export function deleteNamed(name: string): void {
  const lib: Record<string, ProjectDocument> = {};
  for (const e of listSaved()) if (e.name !== name) lib[e.name] = e.doc;
  writeLibrary(lib);
}

/** Download the project as a .json file the client/designer can re-open later. */
export function downloadProject(doc: ProjectDocument, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readProjectFile(file: File): Promise<ProjectDocument> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result)) as ProjectDocument;
        if (!doc || doc.version !== 1) throw new Error("Unrecognized project file");
        resolve(doc);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
