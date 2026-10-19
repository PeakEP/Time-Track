import { server } from "../api";
import { guessType } from "./files";

// Upload picked files and run the document reader on them, returning its result
// (answers, rooms, cabinets, scope…). Used by the Cabinets step to scan a plan
// drawing; the Notes & drawings step has its own richer flow.
const CHUNK = 3.5 * 1024 * 1024;
const uid = () => (typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export async function scanFiles(files: File[], quoteType: string, onProgress?: (s: string) => void): Promise<any> {
  const jobId = uid();
  const meta: { id: string; name: string; type: string; size: number; chunks: number }[] = [];
  for (const [i, f] of files.entries()) {
    onProgress?.(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
    const chunks = Math.max(1, Math.ceil(f.size / CHUNK));
    for (let c = 0; c < chunks; c++) await server.uploadChunk(jobId, `f${i}`, c, f.slice(c * CHUNK, (c + 1) * CHUNK));
    meta.push({ id: `f${i}`, name: f.name, type: guessType(f.name, f.type), size: f.size, chunks });
  }
  onProgress?.("Reading the drawing — this can take a minute…");
  await server.startRead({ jobId, quoteType, notes: "", files: meta, answers: {}, fields: [] });
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await server.readStatus(jobId);
    if (st.status === "done") return st.result;
    if (st.status === "error") throw new Error(st.error || "The reader hit a problem.");
    if (Date.now() - started > 16 * 60 * 1000) throw new Error("The reader is taking too long — try fewer files.");
  }
}
