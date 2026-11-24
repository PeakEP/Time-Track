// Single source of truth for Triangle Kitchen intake domain types.
// Style mirrors the JMRC cabinet-designer / selections house style: `type`
// aliases only, string-literal unions, explicit optional fields. There is NO
// pricing anywhere — this is a hand-off form, not a quote.

// A condition: this step/option is shown only when the selection stored for
// `step` contains at least one id in `in`.
export type Cond = {
  step: string;
  in: string[];
};

// One choosable option (a door style, species, finish colour, accessory, …).
export type Option = {
  id: string;
  name: string;
  // Short helper line shown under the option name.
  note?: string;
  // Product photo path (resolved under BASE_URL). When absent, `swatch` drives
  // a generated colour/placeholder tile.
  image?: string;
  // Hex colour for a generated swatch when there's no photo.
  swatch?: string;
  // Species codes this option belongs to (door styles: where it's offered;
  // stains: which species palette it's in). Codes: C M O P W WO.
  species?: string[];
  // Species single-letter code (on the species step's own options).
  code?: string;
  // Grouping label (e.g. TFL colour family) shown as a divider.
  group?: string;
  // Slab sub-kind ("solid" | "mdf") — species applies only to solid slabs.
  kind?: string;
  // Only shown when this condition passes.
  showIf?: Cond;
};

export type StepKind = "info" | "choose" | "review";

export type Step = {
  id: string;
  name: string;
  // Short label for the left rail / progress.
  nav?: string;
  subtitle?: string;
  // Extra guidance shown in a tip box.
  help?: string;
  kind: StepKind;
  // choose: allow more than one selection.
  multi?: boolean;
  // choose: the step may be left with no selection.
  optional?: boolean;
  // How option photos fit the card image box.
  fit?: "cover" | "contain";
  // choose: filter options to the selected species (reads selections.species).
  speciesFilter?: boolean;
  // Only shown when this condition passes.
  showIf?: Cond;
  options?: Option[];
};

export type CatalogMeta = {
  line: string;
  company: string;
  designer_default: string;
  note?: string;
};

export type Catalog = {
  _meta: CatalogMeta;
  steps: Step[];
};

// ---- Project (one customer's intake) ----

export type ProjectMeta = {
  client: string;
  contact: string; // phone / email
  address: string;
  date: string; // ISO yyyy-mm-dd
  designer: string;
  employee: string; // who took the intake
  projectType: string; // New build / Renovation / Addition …
  timeline: string;
};

export type Project = {
  meta: ProjectMeta;
  // stepId -> selected optionId(s)
  selections: Record<string, string[]>;
  // stepId -> free-text note for that step
  notes: Record<string, string>;
  // General notes & special requests (the "notes" step).
  requests: string;
};

// Versioned wrapper written to .json files + the cloud document.
export type ProjectFile = {
  app: "jmrc-triangle-intake";
  version: 1;
  savedAt: string;
  project: Project;
};
