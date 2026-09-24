// Local, private application tracker. Everything lives in localStorage — no
// server, no account. Portable via JSON/CSV export + JSON import.
// Patterns adapted from ParasKoundal/JobTracker (MIT): one-click capture,
// dup-URL detection, status pipeline, export.

const KEY = "sia_applications";
const PROFILE_KEY = "sia_profile";
const RECENT_KEY = "sia_recent";

export const STATUSES = ["applied", "interview", "offer", "rejected"];

const today = () => new Date().toISOString().slice(0, 10);

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
// Throws on quota exceeded — callers surface that to the user.
const write = (key, v) => localStorage.setItem(key, JSON.stringify(v));

export const loadProfile = () => read(PROFILE_KEY, {});
export const saveProfile = (p) => write(PROFILE_KEY, p);

export const loadApplications = () => read(KEY, []);
const persist = (apps) => write(KEY, apps);

// Only http(s) links reach an href. Bare "example.com/job" gets https://.
export function safeUrl(u) {
  let s = String(u || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// Detect a job already saved: by URL (ignoring query/hash noise), else by
// title + company when there's no link.
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return url.origin + url.pathname;
  } catch {
    return (u || "").trim();
  }
}
const sameText = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
export function findDuplicate(entry, apps = loadApplications()) {
  if (entry.url) {
    const norm = normalizeUrl(safeUrl(entry.url));
    return apps.find((a) => a.url && normalizeUrl(a.url) === norm) || null;
  }
  if (!entry.company) return null;
  return apps.find((a) => sameText(a.title, entry.title) && sameText(a.company, entry.company)) || null;
}

// Coerce anything (form input or imported JSON) into a clean application record.
function normalize(e) {
  const status = STATUSES.includes(e.status) ? e.status : "applied";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : today();
  const str = (v, n = 300) => String(v ?? "").trim().slice(0, n);
  return {
    id: typeof e.id === "string" && e.id ? e.id : crypto.randomUUID(),
    title: str(e.title, 160) || "Untitled role",
    company: str(e.company, 160),
    url: safeUrl(e.url),
    date,
    status,
    statusDates: e.statusDates && typeof e.statusDates === "object" ? e.statusDates : { [status]: date },
    fit: typeof e.fit === "number" && e.fit >= 0 && e.fit <= 1 ? e.fit : null, // Jev pass probability at time of applying
    notes: str(e.notes, 2000),
    jd: str(e.jd, 20000),
    score: e.score && typeof e.score === "object" ? e.score : null,
  };
}

// Add an application. Returns { app, duplicate }.
export function addApplication(entry) {
  const apps = loadApplications();
  const duplicate = findDuplicate(entry, apps);
  const app = normalize(entry);
  apps.unshift(app);
  persist(apps);
  return { app, duplicate };
}

export function updateApplication(id, patch) {
  const apps = loadApplications();
  const i = apps.findIndex((a) => a.id === id);
  if (i === -1) return null;
  if (patch.status && patch.status !== apps[i].status) {
    patch = { ...patch, statusDates: { ...apps[i].statusDates, [patch.status]: today() } };
  }
  apps[i] = { ...apps[i], ...patch };
  persist(apps);
  return apps[i];
}

// Returns { app, index } so the caller can offer undo.
export function removeApplication(id) {
  const apps = loadApplications();
  const index = apps.findIndex((a) => a.id === id);
  if (index === -1) return null;
  const [app] = apps.splice(index, 1);
  persist(apps);
  return { app, index };
}
export function restoreApplication({ app, index }) {
  const apps = loadApplications();
  apps.splice(Math.min(index, apps.length), 0, app);
  persist(apps);
}

// --- recent scores (for side-by-side comparison) ---------------------------
export const loadRecent = () => read(RECENT_KEY, []);
export function addRecent(item) {
  const list = loadRecent().filter((r) => r.jd !== item.jd);
  list.unshift({ id: crypto.randomUUID(), at: Date.now(), ...item });
  write(RECENT_KEY, list.slice(0, 10));
}
export const clearRecent = () => localStorage.removeItem(RECENT_KEY);

// --- calibration: Jev's odds vs. what actually happened ---------------------
export const BUCKETS = [
  { label: "Under 35%", min: 0, max: 0.35 },
  { label: "35–59%", min: 0.35, max: 0.6 },
  { label: "60%+", min: 0.6, max: 1.01 },
];
export function calibration(apps = loadApplications()) {
  return BUCKETS.map((b) => {
    const inB = apps.filter((a) => typeof a.fit === "number" && a.fit >= b.min && a.fit < b.max);
    return {
      label: b.label,
      n: inB.length,
      interviews: inB.filter((a) => a.status === "interview" || a.status === "offer").length,
    };
  });
}

// --- import / export ---------------------------------------------------------
// Merge imported records by id; returns how many were added.
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("Expected a JSON array of applications.");
  const apps = loadApplications();
  const ids = new Set(apps.map((a) => a.id));
  let added = 0;
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const app = normalize(raw);
    if (ids.has(app.id)) continue;
    apps.push(app);
    ids.add(app.id);
    added++;
  }
  apps.sort((x, y) => y.date.localeCompare(x.date));
  persist(apps);
  return added;
}
export const exportJSON = () => JSON.stringify(loadApplications(), null, 2);
export function exportCSV(apps = loadApplications()) {
  const cols = ["title", "company", "url", "date", "status", "fit", "notes"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = apps.map((a) => cols.map((c) => esc(a[c])).join(","));
  return [cols.join(","), ...rows].join("\n");
}
export function download(filename, blobOrText, type = "text/plain") {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
