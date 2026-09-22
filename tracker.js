// Local, private application tracker. Everything lives in localStorage — no
// server, no account. Portable via JSON/CSV export.
// Patterns adapted from ParasKoundal/JobTracker (MIT): one-click capture,
// dup-URL detection, status pipeline, export.

const KEY = "sia_applications";
const PROFILE_KEY = "sia_profile";

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
  } catch {
    return {};
  }
}
export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

export function loadApplications() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}
function persist(apps) {
  localStorage.setItem(KEY, JSON.stringify(apps));
}

// Detect a job already saved by URL (ignoring query/hash noise).
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return url.origin + url.pathname;
  } catch {
    return (u || "").trim();
  }
}
export function findByUrl(url) {
  const norm = normalizeUrl(url);
  return loadApplications().find((a) => normalizeUrl(a.url) === norm) || null;
}

// Add an application. Returns { app, duplicate }.
export function addApplication(entry) {
  const apps = loadApplications();
  const dup = entry.url ? findByUrl(entry.url) : null;
  const app = {
    id: crypto.randomUUID(),
    title: entry.title || "Untitled role",
    company: entry.company || "",
    url: entry.url || "",
    date: entry.date || new Date().toISOString().slice(0, 10),
    status: entry.status || "applied",
    fit: entry.fit ?? null, // Jev pass probability at time of applying
    notes: entry.notes || "",
  };
  apps.unshift(app);
  persist(apps);
  return { app, duplicate: dup };
}

export function updateApplication(id, patch) {
  const apps = loadApplications();
  const i = apps.findIndex((a) => a.id === id);
  if (i === -1) return null;
  apps[i] = { ...apps[i], ...patch };
  persist(apps);
  return apps[i];
}

export function removeApplication(id) {
  persist(loadApplications().filter((a) => a.id !== id));
}

export const STATUSES = ["applied", "interview", "offer", "rejected"];

// --- export -------------------------------------------------------------
export function exportJSON() {
  return JSON.stringify(loadApplications(), null, 2);
}
export function exportCSV() {
  const apps = loadApplications();
  const cols = ["title", "company", "url", "date", "status", "fit", "notes"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = apps.map((a) => cols.map((c) => esc(a[c])).join(","));
  return [cols.join(","), ...rows].join("\n");
}
export function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
