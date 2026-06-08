import type { Project } from "../types";

const FILE_VERSION = 1;

type Wrapped = {
  app: "JMRC Cabinet Designer";
  version: number;
  savedAt: string;
  project: Project;
};

export function projectToBlob(project: Project): Blob {
  const wrapped: Wrapped = {
    app: "JMRC Cabinet Designer",
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  return new Blob([JSON.stringify(wrapped, null, 2)], { type: "application/json" });
}

export function suggestedFilename(project: Project): string {
  const safe = (project.meta.name || "Untitled").replace(/[^a-z0-9\-_ ]/gi, "_").trim();
  return `JMRC-${safe || "Untitled"}.json`;
}

type FsApiWindow = Window & {
  showSaveFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
};

export async function saveProject(project: Project): Promise<void> {
  const blob = projectToBlob(project);
  const name = suggestedFilename(project);
  const w = window as FsApiWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [
          { description: "JMRC Cabinet Project", accept: { "application/json": [".json"] } },
        ],
      });
      const writable = await (handle as unknown as { createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }).createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // user cancelled or API not permitted — fall through to download
      if ((e as { name?: string })?.name === "AbortError") return;
    }
  }
  downloadBlob(blob, name);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openProject(): Promise<Project | null> {
  const w = window as FsApiWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: [
          { description: "JMRC Cabinet Project", accept: { "application/json": [".json"] } },
        ],
      });
      const file = await (handle as unknown as { getFile: () => Promise<File> }).getFile();
      return parseProjectFile(file);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return null;
    }
  }
  return openWithInput();
}

function openWithInput(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await parseProjectFile(file));
      } catch (e) {
        alert(`Failed to open project: ${(e as Error).message}`);
        resolve(null);
      }
    };
    input.click();
  });
}

async function parseProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data?.project) return data.project as Project;
  // Allow raw Project JSON too
  if (data?.items && data?.room && data?.settings) return data as Project;
  throw new Error("Unrecognized project file format");
}

export function exportScheduleCsv(rows: Record<string, string | number>[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(",")))
    .join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), filename);
}
