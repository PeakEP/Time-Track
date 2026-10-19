import { useState } from "react";
import type { CatalogItem } from "../types";

// Add a product to the master catalog (Admins). Lives in its own catalog bucket
// on the server, so re-importing the master cost catalog never wipes it.
export default function NewProductModal({ initialName = "", initialCostCode = "", onClose, onSave }: {
  initialName?: string; initialCostCode?: string; onClose: () => void; onSave: (item: Partial<CatalogItem>) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("EA");
  const [unitCost, setUnitCost] = useState("");
  const [costCode, setCostCode] = useState(initialCostCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Enter a name."); return; }
    setBusy(true);
    setErr("");
    try {
      await onSave({
        name: name.trim(), description: description.trim(), unit: unit.trim().toUpperCase() || "EA",
        unitCost: unitCost === "" ? null : Number(unitCost), costCode: costCode.trim(),
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
        <header><h3 style={{ margin: 0 }}>New product</h3></header>
        <div className="body stack">
          <label className="field"><span>Name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Description / spec</span><input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="grid three">
            <label className="field"><span>Unit</span><input value={unit} onChange={(e) => setUnit(e.target.value.toUpperCase())} /></label>
            <label className="field"><span>Unit cost</span><input type="number" step="0.01" min={0} placeholder="blank = as per drawings" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></label>
            <label className="field"><span>Cost code</span><input value={costCode} onChange={(e) => setCostCode(e.target.value)} placeholder="e.g. 1701" /></label>
          </div>
          <p className="small muted">Added to the catalog for every future quote. The cost code sets its margin category (e.g. 17/18 = finish).</p>
          {err && <div className="banner warn">{err}</div>}
        </div>
        <footer>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add product"}</button>
        </footer>
      </div>
    </div>
  );
}
