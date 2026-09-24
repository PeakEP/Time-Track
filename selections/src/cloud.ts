// Online mode: sign-in, the shared project list, and keeping an open project
// in sync with the server (/api/selections/*). When the site has no server
// storage (plain `vite dev`), the app runs locally exactly as before.
import { create } from "zustand";
import type { Project } from "./types";
import { setLocalAutosave, useStore } from "./store";
import { merge3, same } from "./utils/merge";

const API = "/api/selections/";
const SESSION_KEY = "jmrc.selections.session.v1";
const LAST_PROJECT_KEY = "jmrc.selections.lastProject.v1";
const SAVE_DELAY_MS = 800;
const POLL_MS = 15000;

export type Me = {
  kind: "staff" | "customer";
  id: string;
  name: string;
  role?: string;
  projectId?: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  client: string;
  createdAt: string;
  createdByName: string;
  updatedAt: string;
  updatedByName: string;
  customer: { name: string; active: boolean; hasPin: boolean } | null;
};

export type SyncStatus = "idle" | "saving" | "saved" | "error";

type CloudState = {
  live: boolean;
  me: Me | null;
  projectId: string | null;
  title: string;
  status: SyncStatus;
  error: string;
};

export const useCloud = create<CloudState>(() => ({
  live: false,
  me: null,
  projectId: null,
  title: "",
  status: "idle",
  error: "",
}));

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------ session ------------------------------ */

// The last name signed in on this device (pre-fills the sign-in form). The
// session itself is the suite sign-in cookie, set by the server.
type Session = { name: string };

export function savedSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode: sign-in lasts for this tab only
  }
}
function remember(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* ------------------------------ requests ------------------------------ */

export async function fetchConfig(): Promise<{ live: boolean } | null> {
  try {
    const r = await fetch(API + "config", { headers: { accept: "application/json" } });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method,
    credentials: "same-origin", // the suite sign-in cookie
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && path !== "login") signedOut();
    throw new ApiError(r.status, data.error || `Request failed (${r.status})`);
  }
  return data as T;
}

/* ------------------------------ sign-in ------------------------------ */

// Keep the name on the device so the next sign-in only needs the PIN.
function signedOut() {
  closeProject();
  useCloud.setState({ me: null });
  useStore.getState().lockMode(null);
}

function applyMe(me: Me) {
  useCloud.setState({ me });
  useStore.getState().lockMode(me.kind === "customer" ? "client" : null);
}

export async function signIn(name: string, pin: string): Promise<Me> {
  const r = await api<{ me: Me }>("POST", "login", { name, pin });
  saveSession({ name: r.me.name });
  applyMe(r.me);
  return r.me;
}

export async function signOut() {
  try {
    await api("POST", "logout");
  } catch {
    // already signed out on the server
  }
  signedOut();
}

// On page load: already signed in (on the suite home page or here)?
export async function resume(): Promise<Me | null> {
  try {
    const { me } = await api<{ me: Me }>("GET", "me");
    applyMe(me);
    return me;
  } catch {
    return null;
  }
}

export const lastProjectId = () => recall(LAST_PROJECT_KEY);

/* ------------------------------ projects ------------------------------ */

export const listProjects = () => api<{ projects: ProjectSummary[] }>("GET", "projects").then((r) => r.projects);

export const createProject = (body: {
  client: string;
  title: string;
  customerName: string;
  project: Project;
}) => api<{ project: ProjectSummary; customerName: string; pin: string }>("POST", "projects", body);

export const resetPin = (id: string) =>
  api<{ customerName: string; pin: string }>("POST", `projects/${id}/reset-pin`);

export const setAccess = (id: string, active: boolean) => api("PATCH", `projects/${id}/access`, { active });

export async function deleteProject(id: string) {
  await api("DELETE", `projects/${id}`);
  if (useCloud.getState().projectId === id) closeProject();
}

// The link a client opens; their sign-in name is filled in for them.
export function shareLink(customerName: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}?name=${encodeURIComponent(customerName)}`;
}

/* ------------------------------ sync ------------------------------ */

// `base` is the last copy we know the server has; `version` its number.
let base: Project | null = null;
let version = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

type Loaded = { id: string; title: string; version: number; project: Project };

export async function openProject(id: string) {
  const r = await api<Loaded>("GET", `projects/${id}`);
  base = r.project;
  version = r.version;
  setLocalAutosave(false);
  useStore.getState().loadProject(r.project);
  useCloud.setState({ projectId: id, title: r.title, status: "saved", error: "" });
  if (useCloud.getState().me?.kind === "staff") remember(LAST_PROJECT_KEY, id);
}

// Back to a local (this-browser-only) project.
export function closeProject() {
  clearTimeout(saveTimer);
  base = null;
  version = 0;
  setLocalAutosave(true);
  useCloud.setState({ projectId: null, title: "", status: "idle", error: "" });
  remember(LAST_PROJECT_KEY, null);
}

// Adopt a newer server copy while keeping any edits made since `sentFrom`.
function adopt(server: Project, sentFrom: Project) {
  const local = useStore.getState().project;
  const next = same(local, sentFrom) ? server : merge3(sentFrom, local, server);
  base = server;
  if (!same(next, local)) useStore.getState().replaceProject(next);
}

async function save() {
  const id = useCloud.getState().projectId;
  if (!id || !base || inFlight) return;
  const sent = useStore.getState().project;
  if (same(sent, base)) return;
  inFlight = true;
  useCloud.setState({ status: "saving", error: "" });
  try {
    const r = await api<{ version: number; project: Project }>("PUT", `projects/${id}`, { base, project: sent });
    version = r.version;
    adopt(r.project, sent);
    useCloud.setState({ status: "saved" });
  } catch (e) {
    useCloud.setState({ status: "error", error: (e as Error).message });
  } finally {
    inFlight = false;
  }
  // Edits made while that save was in flight
  if (base && !same(useStore.getState().project, base)) schedule();
}

function schedule() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

// Pick up changes someone else saved (e.g. the client while you're watching).
async function poll() {
  const id = useCloud.getState().projectId;
  if (!id || !base || inFlight || document.hidden) return;
  try {
    const r = await api<Loaded>("GET", `projects/${id}`);
    if (r.version > version && useCloud.getState().projectId === id) {
      version = r.version;
      adopt(r.project, base);
    }
  } catch {
    // shown on the next save attempt
  }
}

// Attach once at startup.
export function attachCloudSync(): () => void {
  const unsub = useStore.subscribe((s, prev) => {
    if (s.project !== prev.project && useCloud.getState().projectId && base && !same(s.project, base)) schedule();
  });
  const t = setInterval(poll, POLL_MS);
  const onVis = () => !document.hidden && poll();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    unsub();
    clearInterval(t);
    document.removeEventListener("visibilitychange", onVis);
  };
}
