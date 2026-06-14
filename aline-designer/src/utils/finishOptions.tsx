import type { Finish } from "../types";

/**
 * Render a catalog's finishes as <option>s grouped by series so the
 * dropdown shows the sub-series structure (e.g. Urban Select / Signature
 * Prestige / Premium Shaker within the Premium tier). Finishes without a
 * series field fall back to tierName as the group label.
 */
export function renderFinishOptions(finishes: Finish[]): JSX.Element[] {
  // Group finishes by series, preserving the order they appear in the catalog.
  const groups: { label: string; items: Finish[] }[] = [];
  const indexByLabel = new Map<string, number>();
  for (const f of finishes) {
    const label = f.series ?? f.tierName;
    let i = indexByLabel.get(label);
    if (i === undefined) {
      i = groups.length;
      indexByLabel.set(label, i);
      groups.push({ label, items: [] });
    }
    groups[i].items.push(f);
  }
  return groups.map((g) => (
    <optgroup key={g.label} label={g.label}>
      {g.items.map((f) => (
        <option key={f.code} value={f.code}>
          {f.code} — {f.name}
        </option>
      ))}
    </optgroup>
  ));
}
