// Attachments (drawings, notes, photos) are kept in this browser's IndexedDB,
// keyed by quote + attachment id. The quote itself only stores the list. The
// client folder, when connected, is the shared source of truth for files.

const DB = "jmrc-quote-builder";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putFile = (quoteId: string, id: string, file: Blob) => tx("readwrite", (s) => s.put(file, `${quoteId}/${id}`));
export const getFile = (quoteId: string, id: string) => tx<Blob | undefined>("readonly", (s) => s.get(`${quoteId}/${id}`));
export const deleteFile = (quoteId: string, id: string) => tx("readwrite", (s) => s.delete(`${quoteId}/${id}`));

export function guessType(name: string, type: string): string {
  if (type) return type;
  const ext = name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", txt: "text/plain", md: "text/plain", csv: "text/csv" } as Record<string, string>)[ext || ""] || "application/octet-stream";
}

export const readableByReader = (type: string, name: string) =>
  /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/.*)$/.test(type) || /\.(txt|md|csv)$/i.test(name);

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------ client folder ------------------------------ */

// File System Access API (Chrome / Edge). The handle is remembered per quote
// in IndexedDB so the folder stays connected between visits (the browser asks
// again for permission).
type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(o: { mode: string }): Promise<string>;
  requestPermission?(o: { mode: string }): Promise<string>;
};

export const folderSupported = () => typeof (window as any).showDirectoryPicker === "function";

export async function pickFolder(): Promise<DirHandle> {
  return (window as any).showDirectoryPicker({ mode: "readwrite" });
}

export const saveFolderHandle = (quoteId: string, h: DirHandle) => tx("readwrite", (s) => s.put(h, `folder/${quoteId}`));
export const loadFolderHandle = (quoteId: string) => tx<DirHandle | undefined>("readonly", (s) => s.get(`folder/${quoteId}`));

export async function ensurePermission(h: DirHandle, mode: "read" | "readwrite" = "read") {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode })) === "granted") return true;
  return (await h.requestPermission?.({ mode })) === "granted";
}

export interface FolderFile { path: string; file: File }

// Walk the folder (two levels deep — client folders are usually
// "Drawings/", "Notes/", "Photos/") and list the files the quote can use.
export async function listFolder(h: DirHandle, prefix = "", depth = 0): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for await (const entry of h.values()) {
    if (entry.name.startsWith(".")) continue;
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path: prefix + entry.name, file });
    } else if (entry.kind === "directory" && depth < 2) {
      out.push(...(await listFolder(entry as DirHandle, `${prefix}${entry.name}/`, depth + 1)));
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// Save the exported proposal into the client folder ("Quotes/" subfolder).
export async function writeToFolder(h: DirHandle, name: string, blob: Blob) {
  if (!(await ensurePermission(h, "readwrite"))) throw new Error("Permission to write to the folder was declined.");
  const dir = await h.getDirectoryHandle("Quotes", { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as any).createWritable();
  await w.write(blob);
  await w.close();
}
