// Turns a project into the ordered hand-off summary the designer reads, plus
// the "confirm before ordering" flags the Triangle intake should always raise.

import type { Catalog, Option, Project, Step } from "../types";
import { visibleOptions, visibleSteps } from "./visibility";

export type SummaryLine = {
  step: Step;
  options: Option[];
  note?: string;
};

// One line per answered choose-step, in wizard order.
export function buildSummary(catalog: Catalog, project: Project): SummaryLine[] {
  const lines: SummaryLine[] = [];
  for (const step of visibleSteps(catalog, project)) {
    if (step.kind !== "choose") continue;
    const chosenIds = project.selections[step.id] ?? [];
    const opts = visibleOptions(step, project, catalog).filter((o) => chosenIds.includes(o.id));
    const note = (project.notes[step.id] ?? "").trim();
    if (opts.length === 0 && !note) continue;
    lines.push({ step, options: opts, note: note || undefined });
  }
  return lines;
}

// Choose-steps still waiting on a selection (not optional, in play, no answer).
export function openSteps(catalog: Catalog, project: Project): Step[] {
  return visibleSteps(catalog, project).filter(
    (s) => s.kind === "choose" && !s.optional && (project.selections[s.id] ?? []).length === 0 && visibleOptions(s, project, catalog).length > 0,
  );
}

const nameOf = (catalog: Catalog, stepId: string, optId: string): string | null => {
  const s = catalog.steps.find((x) => x.id === stepId);
  return s?.options?.find((o) => o.id === optId)?.name ?? null;
};
const chosen = (project: Project, stepId: string): string[] => project.selections[stepId] ?? [];
const has = (project: Project, stepId: string, optId: string) => chosen(project, stepId).includes(optId);

// The standing "confirm before ordering" list from the Triangle intake brief,
// made specific to what the user picked.
export function verificationFlags(catalog: Catalog, project: Project): string[] {
  const flags: string[] = [];
  const construction = chosen(project, "construction")[0];

  if (construction === "fivepiece" || (construction === "slab")) {
    flags.push("Confirm exact wood species and door style from a physical Triangle sample before ordering.");
  }
  if (has(project, "finish-type", "stained") || has(project, "finish-type", "painted")) {
    flags.push("Confirm the exact finish colour from a physical door sample — on-screen swatches are approximate.");
  }
  if (has(project, "finish-type", "custom-match")) {
    flags.push("Custom colour match: a physical sample is required for final approval.");
  }
  // Upper-cabinet stacking / max wall height.
  flags.push("Confirm ceiling height and whether 9'+ uppers are stacked, and the max wall-cabinet height.");

  // Ventilation: OTR vs wood hood is the classic mix-up.
  if (has(project, "ventilation", "vent-otr")) {
    flags.push("Ventilation is an OTR microwave with a cabinet above — this is NOT a Triangle wood range hood.");
  }
  if (has(project, "ventilation", "vent-hood")) {
    const series = chosen(project, "hood-series").map((id) => nameOf(catalog, "hood-series", id)).filter(Boolean);
    flags.push(`Wood range hood (${series.join(", ") || "series TBD"}): confirm base option, size (30\"–60\") and ventilator liner.`);
  }
  if (has(project, "ventilation", "vent-other")) {
    flags.push("Other ventilation supplied by others — confirm the opening/clearance needed.");
  }

  // Sink / appliances aren't captured on this form.
  flags.push("Confirm sink/faucet model and appliance specs (openings affect the cabinet layout).");
  // Out-of-scope reminder.
  flags.push("Hardware (handles/pulls), countertops and flooring are supplied separately — not Triangle. Bath vanities are usually Oppein.");

  return flags;
}
