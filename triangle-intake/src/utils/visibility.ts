// The conditional engine that makes the wizard "spoon-feed" the path: steps and
// options appear only when earlier choices make them relevant (e.g. the stain
// palette shows only for a stained solid-wood door, filtered to the species).

import type { Catalog, Cond, Option, Project, Step } from "../types";

export function condMet(cond: Cond | undefined, selections: Record<string, string[]>): boolean {
  if (!cond) return true;
  const chosen = selections[cond.step] ?? [];
  return chosen.some((id) => cond.in.includes(id));
}

// The species code currently selected (from the "species" step), or null.
export function selectedSpecies(selections: Record<string, string[]>, catalog: Catalog): string | null {
  const id = (selections["species"] ?? [])[0];
  if (!id) return null;
  const sp = catalog.steps.find((s) => s.id === "species");
  const opt = sp?.options?.find((o) => o.id === id);
  return opt?.code ?? null;
}

// Options visible on a step, after option-level showIf and species filtering.
export function visibleOptions(step: Step, project: Project, catalog: Catalog): Option[] {
  let opts = (step.options ?? []).filter((o) => condMet(o.showIf, project.selections));
  if (step.speciesFilter) {
    const code = selectedSpecies(project.selections, catalog);
    if (code) opts = opts.filter((o) => !o.species || o.species.includes(code));
  }
  return opts;
}

// The ordered list of steps currently in play.
export function visibleSteps(catalog: Catalog, project: Project): Step[] {
  return catalog.steps.filter((s) => condMet(s.showIf, project.selections));
}

// Has the user dealt with this step? (optional steps and info/review steps are
// always "done" for progress purposes; a choose step needs a selection.)
export function stepDone(step: Step, project: Project, catalog: Catalog): boolean {
  if (step.kind !== "choose") return true;
  if (step.optional) return true;
  const chosen = project.selections[step.id] ?? [];
  if (chosen.length > 0) return true;
  // A choose step with no visible options (shouldn't happen) counts as done.
  return visibleOptions(step, project, catalog).length === 0;
}

// Prune selections that are no longer reachable (e.g. the species a stain was
// filtered to changed, or the construction changed and old door styles/colours
// no longer apply). Keeps the project consistent as the path narrows.
export function pruneSelections(catalog: Catalog, project: Project): Project {
  const live = new Set(visibleSteps(catalog, project).map((s) => s.id));
  let changed = false;
  const selections: Record<string, string[]> = {};
  for (const [stepId, ids] of Object.entries(project.selections)) {
    const step = catalog.steps.find((s) => s.id === stepId);
    if (!step || !live.has(stepId)) {
      changed = true;
      continue;
    }
    const allowed = new Set(visibleOptions(step, { ...project, selections: project.selections }, catalog).map((o) => o.id));
    const kept = ids.filter((id) => allowed.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length) selections[stepId] = kept;
    else if (ids.length) changed = true;
  }
  return changed ? { ...project, selections } : project;
}
