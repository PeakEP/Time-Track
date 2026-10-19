import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { server } from "../api";
import { STEPS, fieldVisible, newRoom, uid, type Field } from "../data/questions";
import type { AiSuggestion, Attachment, CabinetSupplier, Quote, RoomKind } from "../types";
import {
  deleteFile, download, ensurePermission, folderSupported, getFile, guessType, listFolder, loadFolderHandle,
  pickFolder, putFile, readableByReader, saveFolderHandle, type FolderFile,
} from "../utils/files";

const CHUNK = 3.5 * 1024 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

function fieldsFor(q: Quote): Field[] {
  return STEPS.flatMap((s) => s.fields).filter((f) => fieldVisible(f, q.type, q.answers) && !["notes", "inclusionsExtra", "exclusionsExtra"].includes(f.key));
}

function coerce(f: Field | undefined, raw: string): unknown {
  if (!f) return raw;
  if (f.type === "number" || f.type === "money") {
    const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (f.type === "bool") return /^(true|yes|1)$/i.test(raw.trim());
  if (f.type === "select") {
    const o = f.options!.find((x) => String(x.value) === raw.trim() || x.label.toLowerCase() === raw.trim().toLowerCase());
    return o ? o.value : null;
  }
  return raw;
}

export default function DocumentsStep() {
  const { quote, update, live, notify } = useApp();
  const [over, setOver] = useState(false);
  const [folderFiles, setFolderFiles] = useState<FolderFile[] | null>(null);
  const [busy, setBusy] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reconnect a folder linked earlier (without prompting — that needs a click).
    if (!quote || !quote.folderName || !folderSupported()) return;
    loadFolderHandle(quote.id).then(async (h) => {
      if (h && (await h.queryPermission?.({ mode: "read" })) === "granted") setFolderFiles(await listFolder(h));
    }).catch(() => {});
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote) return null;
  const fields = fieldsFor(quote);
  const fieldByKey = new Map(fields.map((f) => [f.key as string, f]));

  async function addFiles(files: File[], from: Attachment["from"]) {
    const list: Attachment[] = [];
    for (const f of files) {
      if (quote!.attachments.some((a) => a.name === f.name && a.size === f.size)) continue;
      const a: Attachment = { id: uid(), name: f.name, type: guessType(f.name, f.type), size: f.size, from, addedAt: new Date().toISOString() };
      await putFile(quote!.id, a.id, f);
      list.push(a);
    }
    if (list.length) update((q) => { q.attachments.push(...list); });
  }

  async function connectFolder() {
    try {
      const h = await pickFolder();
      await saveFolderHandle(quote!.id, h);
      update((q) => { q.folderName = h.name; });
      setFolderFiles(await listFolder(h));
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify((e as Error).message, true);
    }
  }
  async function rescan() {
    const h = await loadFolderHandle(quote!.id);
    if (!h) return connectFolder();
    if (!(await ensurePermission(h))) return notify("Permission to read the folder was declined.", true);
    setFolderFiles(await listFolder(h));
  }

  async function runReader() {
    const q = quote!;
    const chosen = q.attachments.filter((a) => readableByReader(a.type, a.name) && !skip.has(a.id));
    const total = chosen.reduce((s, a) => s + a.size, 0);
    if (!chosen.length && !q.answers.notes.trim()) return notify("Add drawings, photos or notes first.", true);
    if (total > MAX_TOTAL) return notify(`Those files are ${kb(total)} — the reader takes up to 24 MB at once. Untick some.`, true);
    if (!live) return notify("The document reader runs on the live site (it needs the Claude API key set in Netlify).", true);
    const jobId = uid();
    try {
      const files = [];
      for (const [i, a] of chosen.entries()) {
        setBusy(`Uploading ${i + 1} of ${chosen.length}: ${a.name}`);
        const blob = await getFile(q.id, a.id);
        if (!blob) throw new Error(`${a.name} isn't stored in this browser — add it again.`);
        const n = Math.max(1, Math.ceil(blob.size / CHUNK));
        for (let c = 0; c < n; c++) await server.uploadChunk(jobId, a.id, c, blob.slice(c * CHUNK, (c + 1) * CHUNK));
        files.push({ id: a.id, name: a.name, type: a.type, size: a.size, chunks: n });
      }
      setBusy("Reading the documents — drawings can take a few minutes…");
      await server.startRead({
        jobId, quoteType: q.type, notes: q.answers.notes, files,
        answers: Object.fromEntries(fields.map((f) => [f.key, q.answers[f.key]])),
        fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, unit: f.unit, options: f.options })),
      });
      const started = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await server.readStatus(jobId);
        if (st.status === "done") { applyResult(st.result); break; }
        if (st.status === "error") throw new Error(st.error || "The reader hit a problem.");
        if (Date.now() - started > 16 * 60 * 1000) throw new Error("The reader is taking too long — try fewer files.");
      }
      notify("Done — review the suggestions below.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  function applyResult(r: any) {
    const sugg: AiSuggestion[] = [];
    for (const x of r.answers || []) {
      const v = coerce(fieldByKey.get(x.field), String(x.value));
      if (v === null || v === "") continue;
      sugg.push({ field: x.field, value: v, confidence: x.confidence, source: x.source, status: "pending" });
    }
    if ((r.rooms || []).length && (quote!.type === "renovation" || quote!.type === "remodel"))
      for (const room of r.rooms) sugg.push({ field: "room", value: room, confidence: room.confidence, source: room.source, status: "pending" });
    // Cabinet lines, grouped into one order per area.
    const groups = new Map<string, { area: string; supplier: string; lines: { sku: string; qty: number }[]; source: string }>();
    for (const c of r.cabinets || []) {
      const k = `${c.area}|${c.supplier}`;
      const g = groups.get(k) || { area: c.area, supplier: c.supplier, lines: [] as { sku: string; qty: number }[], source: c.source };
      g.lines.push({ sku: String(c.sku).toUpperCase(), qty: Math.max(1, Math.round(Number(c.qty) || 1)) });
      groups.set(k, g);
    }
    for (const g of groups.values()) sugg.push({ field: "cabinets", value: g, confidence: "medium", source: g.source, status: "pending" });
    if ((r.scopeItems || []).length) sugg.push({ field: "inclusionsExtra", value: r.scopeItems.join("\n"), confidence: "medium", source: "Scope items read from the documents", status: "pending" });
    if ((r.exclusions || []).length) sugg.push({ field: "exclusionsExtra", value: r.exclusions.join("\n"), confidence: "medium", source: "Exclusions read from the documents", status: "pending" });
    const summary = [r.summary, ...(r.openQuestions?.length ? ["", "To confirm with the client:", ...r.openQuestions.map((x: string) => `• ${x}`)] : [])].join("\n");
    update((q) => { q.ai = { suggestions: sugg, summary, ranAt: new Date().toISOString() }; });
  }

  function decide(i: number, accept: boolean) {
    update((q) => {
      const s = q.ai.suggestions[i];
      s.status = accept ? "accepted" : "rejected";
      if (!accept) return;
      const a = q.answers as unknown as Record<string, unknown>;
      if (s.field === "cabinets") {
        const v = s.value as { area: string; supplier: string; lines: { sku: string; qty: number }[] };
        const room = q.answers.rooms.find((x) => x.name.toLowerCase() === v.area.toLowerCase() || v.area.toLowerCase().includes(x.name.toLowerCase()));
        const supplier = (["aline", "oppein", "divine"].includes(v.supplier) ? v.supplier : "oppein") as CabinetSupplier;
        q.cabinetSets.push({
          id: uid(), name: v.area, roomId: room?.id || "", supplier, box: "PLY",
          color: supplier === "oppein" ? "WSS" : supplier === "aline" ? "SW" : "", style: supplier === "aline" ? "shaker" : supplier === "divine" ? "S7" : "",
          assemble: supplier === "divine", shipping: supplier === "divine" ? 150 : 0,
          lines: v.lines.map((l) => ({ id: uid(), sku: l.sku, qty: l.qty })), notes: v.supplier === "unknown" ? "Supplier not named in the documents — check." : "",
        });
      } else if (s.field === "room") {
        const v = s.value as { name: string; kind: RoomKind; length: number; width: number; height: number; scope: string };
        const room = newRoom(v.kind, v.name);
        if (v.length) room.length = v.length;
        if (v.width) room.width = v.width;
        if (v.height) room.height = v.height;
        room.notes = v.scope;
        q.answers.rooms.push(room);
      } else if (s.field === "inclusionsExtra" || s.field === "exclusionsExtra") {
        a[s.field] = [a[s.field], s.value].filter(Boolean).join("\n");
      } else a[s.field] = s.value;
    });
  }

  const label = (s: AiSuggestion) => s.field === "cabinets" ? "Cabinets" : s.field === "room" ? "Room" : fieldByKey.get(s.field)?.label || (s.field === "inclusionsExtra" ? "Inclusions" : s.field === "exclusionsExtra" ? "Exclusions" : s.field);
  const show = (s: AiSuggestion) => {
    if (s.field === "cabinets") { const v = s.value as any; return `${v.area} — ${v.supplier === "unknown" ? "supplier not named" : v.supplier}: ${v.lines.map((l: any) => `${l.sku}×${l.qty}`).join(", ")}`; }
    if (s.field === "room") { const v = s.value as any; return `${v.name} (${v.kind}) ${v.length || "?"}' × ${v.width || "?"}' — ${v.scope}`; }
    const f = fieldByKey.get(s.field);
    if (f?.type === "select") return f.options!.find((o) => o.value === s.value)?.label || String(s.value);
    if (f?.type === "bool") return s.value ? "Yes" : "No";
    return `${String(s.value)}${f?.unit ? ` ${f.unit}` : ""}`;
  };
  const pending = quote.ai.suggestions.map((s, i) => ({ s, i })).filter(({ s }) => s.status === "pending");

  return (
    <div className="stack">
      <div className="grid two">
        <div className="card">
          <h3>Plans, SOW &amp; photos</h3>
          <div
            className={`drop${over ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files], "upload"); }}
          >
            Drop files here, or{" "}
            <button className="btn sm" onClick={() => input.current?.click()}>choose files</button>
            <input ref={input} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,image/*,application/pdf" onChange={(e) => { void addFiles([...(e.target.files || [])], "upload"); e.target.value = ""; }} />
            <div className="small" style={{ marginTop: 6 }}>PDF plans &amp; scope of work, photos, cabinet lists and text notes. Kept in this browser with the quote.</div>
          </div>
        </div>
        <div className="card">
          <h3>Client folder</h3>
          {folderSupported() ? (
            <>
              <p className="muted small">Connect the client's job folder (e.g. on the shared drive) and pick what the quote should use. The finished proposal is saved back into its <b>Quotes</b> folder.</p>
              <div className="row" style={{ marginTop: 10 }}>
                {quote.folderName ? <span className="pill info">📁 {quote.folderName}</span> : null}
                <button className="btn sm" onClick={connectFolder}>{quote.folderName ? "Change folder" : "Connect folder"}</button>
                {quote.folderName && <button className="btn sm" onClick={rescan}>Rescan</button>}
              </div>
            </>
          ) : (
            <p className="muted small">Connecting a folder needs Chrome or Edge on a computer. You can still drag files in from the folder.</p>
          )}
          {folderFiles && (
            <ul className="file-list" style={{ marginTop: 10, maxHeight: 220, overflow: "auto" }}>
              {folderFiles.map((f) => {
                const added = quote.attachments.some((a) => a.name === f.file.name && a.size === f.file.size);
                return (
                  <li key={f.path}>
                    <span className="name" title={f.path}>{f.path}</span>
                    <span className="small muted">{kb(f.file.size)}</span>
                    <button className="btn sm" disabled={added} onClick={() => addFiles([f.file], "folder")}>{added ? "Added" : "Add"}</button>
                  </li>
                );
              })}
              {folderFiles.length === 0 && <li className="muted">The folder is empty.</li>}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Takeoff</h3>
          <div className="spacer" />
          <button className="btn primary" disabled={!!busy} onClick={runReader}>Read documents &amp; suggest answers</button>
        </div>
        {busy && <div className="banner info">{busy}</div>}
        <label className="field">
          <span>What's in scope &amp; notes for the reader — this steers the takeoff over the drawings</span>
          <textarea style={{ minHeight: 88 }}
            placeholder={`e.g. "Plans show 4 rooms — we're only doing the kitchen and main bath. Keep the existing hall flooring. Quartz counters, Oppein cabinets."`}
            value={quote.answers.notes} onChange={(e) => update((q) => { q.answers.notes = e.target.value; })} />
        </label>
        <div className="small muted" style={{ margin: "12px 0 4px" }}>Files sent to the reader — tick the ones to include</div>
        {quote.attachments.length === 0 ? <p className="muted">No files yet — drop plans, the SOW or photos in the box above.</p> : (
          <ul className="file-list">
            {quote.attachments.map((a) => {
              const ok = readableByReader(a.type, a.name);
              return (
                <li key={a.id}>
                  <input type="checkbox" title="Send to the document reader" disabled={!ok} checked={ok && !skip.has(a.id)}
                    onChange={(e) => { const s = new Set(skip); e.target.checked ? s.delete(a.id) : s.add(a.id); setSkip(s); }} />
                  <span className="name">{a.name}</span>
                  {!ok && <span className="pill">kept, not read</span>}
                  <span className="small muted">{kb(a.size)}{a.from === "folder" ? " · from folder" : ""}</span>
                  <button className="btn sm ghost" onClick={async () => { const b = await getFile(quote.id, a.id); b ? download(b, a.name) : notify("Not stored in this browser.", true); }}>Open</button>
                  <button className="btn sm ghost danger" onClick={async () => { await deleteFile(quote.id, a.id).catch(() => {}); update((q) => { q.attachments = q.attachments.filter((x) => x.id !== a.id); }); }}>Remove</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(quote.ai.ranAt || quote.ai.suggestions.length > 0) && (
        <div className="card">
          <div className="card-head">
            <h3>Suggestions from the documents</h3>
            <div className="spacer" />
            {pending.length > 0 && (
              <>
                <button className="btn sm" onClick={() => pending.filter(({ s }) => s.confidence === "high").forEach(({ i }) => decide(i, true))}>Accept all high-confidence</button>
                <button className="btn sm ghost" onClick={() => pending.forEach(({ i }) => decide(i, false))}>Reject the rest</button>
              </>
            )}
          </div>
          {quote.ai.summary && <p style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{quote.ai.summary}</p>}
          {quote.ai.suggestions.map((s, i) => (
            <div key={i} className={`suggestion ${s.status}`}>
              <div><b>{label(s)}</b><div><span className={`pill ${s.confidence === "high" ? "ok" : s.confidence === "medium" ? "info" : "warn"}`}>{s.confidence}</span></div></div>
              <div><div style={{ whiteSpace: "pre-wrap" }}>{show(s)}</div><div className="src">{s.source}</div></div>
              <div className="row">
                {s.status === "pending" ? (
                  <><button className="btn sm primary" onClick={() => decide(i, true)}>Use</button><button className="btn sm" onClick={() => decide(i, false)}>Skip</button></>
                ) : <span className="small muted">{s.status}</span>}
              </div>
            </div>
          ))}
          {quote.ai.suggestions.length === 0 && <p className="muted">The reader didn't find answers to the questions in these documents.</p>}
        </div>
      )}
    </div>
  );
}
