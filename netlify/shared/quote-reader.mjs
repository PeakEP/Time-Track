// Document reader for Quote Builder: sends a job's drawings, photos and notes
// to Claude and gets back suggested answers for the quote interview, each
// with where it came from. Suggestions are only ever shown to the rep to
// accept or reject — nothing is applied to a quote automatically.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

const ROOM_KINDS = ["kitchen", "bathroom", "ensuite", "bedroom", "living", "dining", "basement", "laundry", "hallway", "office", "mudroom", "other"];

export function resultSchema(fieldKeys) {
  const conf = { type: "string", enum: ["high", "medium", "low"] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "projectType", "answers", "rooms", "cabinets", "scopeItems", "exclusions", "openQuestions"],
    properties: {
      summary: { type: "string", description: "Two to four sentences describing the job as the documents show it." },
      projectType: { type: "string", enum: ["renovation", "remodel", "shop", "custom-home", "unknown"] },
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "value", "confidence", "source"],
          properties: {
            field: { type: "string", enum: fieldKeys.length ? fieldKeys : ["notes"] },
            value: { type: "string", description: "The answer. Numbers as plain decimals in the field's unit (feet as decimal feet, e.g. 28.5)." },
            confidence: conf,
            source: { type: "string", description: "Where it came from: file name, sheet/page and what was read, or how it was worked out." },
          },
        },
      },
      rooms: {
        type: "array",
        description: "Renovation/remodel rooms in scope. Empty for new builds.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "kind", "length", "width", "height", "scope", "confidence", "source"],
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: ROOM_KINDS },
            length: { type: "number", description: "feet; 0 if not shown" },
            width: { type: "number", description: "feet; 0 if not shown" },
            height: { type: "number", description: "ceiling height in feet; 0 if not shown" },
            scope: { type: "string", description: "What the documents say is being done in this room." },
            confidence: conf,
            source: { type: "string" },
          },
        },
      },
      cabinets: {
        type: "array",
        description: "Every cabinet line on a cabinet design, take-off, cutlist or supplier quote (kitchen, vanity, laundry…). Empty if there is none.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["area", "supplier", "sku", "qty", "source"],
          properties: {
            area: { type: "string", description: "Room or area, e.g. Kitchen, Ensuite vanity" },
            supplier: { type: "string", enum: ["aline", "oppein", "divine", "unknown"] },
            sku: { type: "string", description: "Cabinet code exactly as written, e.g. B24, W3030, SB36, S7-B24" },
            qty: { type: "number" },
            source: { type: "string" },
          },
        },
      },
      scopeItems: { type: "array", items: { type: "string" }, description: "Scope of work items stated in the documents, in plain contractor language." },
      exclusions: { type: "array", items: { type: "string" }, description: "Anything the documents say is by the owner, by others, or not included." },
      openQuestions: { type: "array", items: { type: "string" }, description: "What the rep needs to confirm with the client before the quote is right." },
    },
  };
}

export const SYSTEM = `You help the sales team at J.M Robins Construction Ltd. (JMRC), a general contractor in New Brunswick, Canada, prepare quotes for renovations, remodels, new shops/garages and custom homes.

You are given a client's drawings, photos and notes, and the list of interview questions the quote needs. Read everything and answer the questions the documents actually answer.

Rules:
- The rep's notes set the scope of this quote. Quote only what the rep says they are doing. If the drawings show more than that — e.g. the plan has four rooms but the notes say "kitchen only" — return only the in-scope rooms, scope items and cabinets, and leave the rest out. When the notes and the drawings disagree about what's included, the notes win; put the difference in openQuestions so the rep can confirm.
- Only report what the documents state or what can be measured from a dimensioned drawing. If something isn't there, leave it out — a missing answer is fine, a guessed one is not. Never estimate prices.
- Give every answer a source: the file name, the sheet number or page, and what you read (e.g. "A101 floor plan, overall dimensions 40'-0\\" x 28'-0\\""). If you worked a number out (e.g. counted windows on the elevations, added up wall lengths), say how.
- Convert dimensions to decimal feet (28'-6" → 28.5). Counts are whole numbers.
- Confidence: high = stated plainly; medium = measured or counted from drawings; low = inferred from notes or photos.
- For selects and yes/no questions, answer with one of the listed option values exactly.
- If there is a cabinet design or cabinet list, copy every cabinet code and quantity into cabinets exactly as written (don't convert codes between suppliers). Name the supplier only if the document does.
- Drawings are often preliminary and notes are often rough. Put anything that conflicts, or that the rep must confirm, in openQuestions.`;

export function questionText(job) {
  const lines = (job.fields || []).map((f) => {
    const opts = f.options?.length ? ` — options: ${f.options.map((o) => `${o.value} (${o.label})`).join(", ")}` : "";
    return `- ${f.key}: ${f.label}${f.unit ? ` [${f.unit}]` : ""}${f.type === "bool" ? " — answer true or false" : ""}${opts}`;
  });
  const known = Object.entries(job.answers || {})
    .filter(([, v]) => v !== "" && v !== 0 && v != null && typeof v !== "object")
    .map(([k, v]) => `- ${k}: ${v}`);
  return [
    `Project type selected by the rep: ${job.quoteType || "unknown"}.`,
    "",
    job.notes ? `The rep's scope notes — these set what's in scope; follow them over the drawings:\n${job.notes}` : "",
    "",
    "Interview questions (use these field keys):",
    ...lines,
    "",
    known.length ? "Already answered by the rep (only suggest a change if the documents clearly disagree):" : "",
    ...known,
  ].filter((x) => x !== "").join("\n");
}

// files: [{ name, type, data: Buffer }]
export function contentBlocks(files) {
  const blocks = [];
  for (const f of files) {
    const b64 = f.data.toString("base64");
    if (f.type === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, title: f.name });
    } else if (/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) {
      const media = f.type === "image/jpg" ? "image/jpeg" : f.type;
      blocks.push({ type: "text", text: `Image: ${f.name}` });
      blocks.push({ type: "image", source: { type: "base64", media_type: media, data: b64 } });
    } else {
      blocks.push({ type: "document", source: { type: "text", media_type: "text/plain", data: f.data.toString("utf8") }, title: f.name });
    }
  }
  return blocks;
}

export async function readDocuments({ job, files, client = new Anthropic() }) {
  const keys = (job.fields || []).map((f) => f.key);
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "high", format: { type: "json_schema", schema: resultSchema(keys) } },
    messages: [{ role: "user", content: [...contentBlocks(files), { type: "text", text: questionText(job) }] }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The document reader declined these documents.");
  if (msg.stop_reason === "max_tokens") throw new Error("The documents produced too long an answer — try fewer files at once.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let out;
  try { out = JSON.parse(text); } catch { throw new Error("The document reader returned something unreadable — try again."); }
  out.answers = (out.answers || []).filter((x) => keys.includes(x.field));
  return { ...out, model: msg.model };
}
