// Save/open project files + a named in-browser library + CSV export.
// Mirrors cabinet-designer/persistence.ts: a versioned wrapper, the File System
// Access API with a graceful <a download> fallback, all quota-sensitive calls
// wrapped in try/catch.

import type { LineCost } from "./pricing";
import { formatCAD } from "./pricing";
import type { Project, ProjectFile } from "../types";

const LIBRARY_KEY = "jmrc.selections.library.v1";

function wrap(project: Project): ProjectFile {
  return {
    app: "jmrc-finish-selections",
    version: 1,
    savedAt: new Date().toISOString(),
    project,
  };
}

function sanitize(name: string): string {
  return (name || "selections").replace(/[^a-z0-9\-_ ]/gi, "_").trim() || "selections";
}

// ---- Named in-browser library (localStorage) ----

export type SavedEntry = { name: string; file: ProjectFile };

export function listSaved(): SavedEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, ProjectFile>) : {};
    return Object.entries(obj)
      .map(([name, file]) => ({ name, file }))
      .sort((a, b) => (b.file.savedAt || "").localeCompare(a.file.savedAt || ""));
  } catch {
    return [];
  }
}

function writeLibrary(lib: Record<string, ProjectFile>): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    // ignore quota errors
  }
}

export function saveNamed(name: string, project: Project): void {
  const lib: Record<string, ProjectFile> = {};
  for (const e of listSaved()) lib[e.name] = e.file;
  lib[name] = wrap(project);
  writeLibrary(lib);
}

export function deleteNamed(name: string): void {
  const lib: Record<string, ProjectFile> = {};
  for (const e of listSaved()) if (e.name !== name) lib[e.name] = e.file;
  writeLibrary(lib);
}

// ---- File download / open ----

export async function downloadProject(project: Project, filename: string): Promise<void> {
  const json = JSON.stringify(wrap(project), null, 2);
  const name = `${sanitize(filename)}.json`;
  const picker = (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await (picker as (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>)({
        suggestedName: name,
        types: [{ description: "Selections project", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // fall through to <a download>
    }
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function readProjectFile(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ProjectFile;
        if (!parsed || parsed.version !== 1 || !parsed.project) {
          throw new Error("Unrecognized project file");
        }
        resolve(parsed.project);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ---- CSV export (selection schedule) ----

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportScheduleCsv(lines: LineCost[], filename: string): void {
  const rows = [
    ["Category", "Selection", "Type", "Price"],
    ...lines.map((l) => [
      l.category.name,
      l.option.name,
      l.option.pricing === "included" ? "Included" : "Upgrade",
      l.option.pricing === "included" ? "" : formatCAD(l.price),
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => csvField(String(c))).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(filename)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
