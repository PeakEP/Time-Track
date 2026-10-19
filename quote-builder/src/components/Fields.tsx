import type { Answers } from "../types";
import { fieldVisible, type Field } from "../data/questions";
import { useApp } from "../store";

export function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const num = (s: string) => (s === "" ? 0 : Number(s));
  let input;
  switch (f.type) {
    case "textarea":
      input = <textarea value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      input = (
        <select value={String(value)} onChange={(e) => {
          const opt = f.options!.find((o) => String(o.value) === e.target.value);
          onChange(opt ? opt.value : e.target.value);
        }}>
          {f.options!.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      );
      break;
    case "bool":
      return (
        <label className="check" style={{ marginTop: 18 }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
        </label>
      );
    case "number":
    case "money":
      input = (
        <div className="unit-input">
          {f.type === "money" && <em>$</em>}
          <input type="number" min={f.min ?? 0} step={f.step ?? (f.type === "money" ? 0.01 : 1)} value={value === 0 ? "" : String(value ?? "")} placeholder="0" onChange={(e) => onChange(num(e.target.value))} />
          {f.unit && <em>{f.unit}</em>}
        </div>
      );
      break;
    default:
      input = <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className="field">
      <span>{f.label}</span>
      {input}
      {f.help && <span className="help">{f.help}</span>}
    </label>
  );
}

export function FieldGrid({ fields }: { fields: Field[] }) {
  const { quote, update } = useApp();
  if (!quote) return null;
  const a = quote.answers;
  const visible = fields.filter((f) => fieldVisible(f, quote.type, a));
  const wide = visible.filter((f) => f.type === "textarea");
  const narrow = visible.filter((f) => f.type !== "textarea");
  const pending = new Set(quote.ai.suggestions.filter((s) => s.status === "pending").map((s) => s.field));
  return (
    <div className="stack">
      {narrow.length > 0 && (
        <div className="grid three">
          {narrow.map((f) => (
            <div key={f.key} style={pending.has(f.key) ? { outline: "2px dashed var(--cyan)", outlineOffset: 4, borderRadius: 6 } : undefined}>
              <FieldInput f={f} value={a[f.key]} onChange={(v) => update((q) => { (q.answers as unknown as Record<string, unknown>)[f.key] = v; })} />
            </div>
          ))}
        </div>
      )}
      {wide.map((f) => (
        <FieldInput key={f.key} f={f} value={a[f.key as keyof Answers]} onChange={(v) => update((q) => { (q.answers as unknown as Record<string, unknown>)[f.key] = v; })} />
      ))}
    </div>
  );
}
