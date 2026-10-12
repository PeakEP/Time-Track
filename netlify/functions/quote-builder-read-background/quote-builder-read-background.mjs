// Quote Builder document reader (Netlify Background Function: the name ends
// in "-background", so Netlify answers 202 at once and lets it run up to 15
// minutes). Started by quote-builder-api POST /read with the job's one-time
// secret; writes the result to jobs/<id> where the app polls for it.
import { openStore } from "../../shared/storage.mjs";
import { readDocuments } from "../../shared/quote-reader.mjs";

export async function runJob(store, { jobId, secret }, { read = readDocuments } = {}) {
  const job = await store.get(`jobs/${jobId}`, { type: "json" });
  if (!job || !secret || job.secret !== secret || job.status !== "queued") return { ok: false };
  await store.setJSON(`jobs/${jobId}`, { ...job, status: "running" });
  try {
    const files = [];
    for (const f of job.files) {
      const parts = [];
      for (let n = 0; n < f.chunks; n++) {
        const buf = await store.get(`uploads/${jobId}/${f.id}/${n}`, { type: "arrayBuffer" });
        if (!buf) throw new Error(`${f.name} didn't finish uploading — try again.`);
        parts.push(Buffer.from(buf));
      }
      files.push({ name: f.name, type: f.type, data: Buffer.concat(parts) });
    }
    const result = await read({ job, files });
    await store.setJSON(`jobs/${jobId}`, { ...job, secret: "", status: "done", result, doneAt: new Date().toISOString() });
  } catch (e) {
    console.error("quote-builder-read", e);
    await store.setJSON(`jobs/${jobId}`, { ...job, secret: "", status: "error", error: String(e.message || e).slice(0, 500), doneAt: new Date().toISOString() });
  } finally {
    for (const f of job.files) for (let n = 0; n < f.chunks; n++) await store.delete(`uploads/${jobId}/${f.id}/${n}`).catch(() => {});
  }
  return { ok: true };
}

export default async (req, context) => {
  const body = await req.json().catch(() => ({}));
  const store = openStore(context, "quote-builder");
  if (store) await runJob(store, body);
};
