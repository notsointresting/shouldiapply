// ShouldIApply — controller.

import { CONFIG } from "./config.js";
import { login, disconnect, isConnected, fetchUserInfo, handleRedirectCallback } from "./auth.js";
import { scoreFit, recommendation } from "./jev.js";
import * as tracker from "./tracker.js";

const $ = (id) => document.getElementById(id);
const el = {
  connect: $("connect-btn"), disconnect: $("disconnect-btn"), status: $("conn-status"),
  banner: $("banner"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  trackerCount: $("tracker-count"),
  // profile
  pResume: $("p-resume"), pTitle: $("p-title"), pYears: $("p-years"), pSkills: $("p-skills"),
  pLocation: $("p-location"), pWorkpref: $("p-workpref"), pSave: $("p-save"), pSaved: $("p-saved"),
  // score
  jd: $("jd"), jTitle: $("j-title"), jCompany: $("j-company"), jUrl: $("j-url"),
  scoreBtn: $("score-btn"), scoreHint: $("score-hint"),
  scorecard: $("scorecard"), verdictBadge: $("verdict-badge"), oddsNum: $("odds-num"),
  verdictReasons: $("verdict-reasons"), metrics: $("metrics"), scoreUsage: $("score-usage"),
  trackBtn: $("track-btn"),
  // tracker
  trackerList: $("tracker-list"), exportJson: $("export-json"), exportCsv: $("export-csv"),
};

let lastScore = null;

// --- banner + auth --------------------------------------------------------
function showBanner(kind, html) { el.banner.hidden = false; el.banner.dataset.kind = kind; el.banner.innerHTML = html; }
function hideBanner() { el.banner.hidden = true; }

function refreshAuthUI() {
  const connected = isConnected();
  el.status.dataset.state = connected ? "on" : "off";
  el.status.textContent = connected ? "Connected" : "Not connected";
  el.connect.hidden = connected;
  el.disconnect.hidden = !connected;
  if (connected) fetchUserInfo().then((u) => { if (u && (u.username || u.name) && isConnected()) el.status.textContent = "Connected as " + (u.username || u.name); });
}
el.connect.addEventListener("click", async () => {
  try { await login(); }
  catch (e) { showBanner("error", `${escapeHtml(e.message)} <a href="${CONFIG.KEYS_DASHBOARD}" target="_blank" rel="noopener">Key dashboard →</a>`); }
});
el.disconnect.addEventListener("click", () => { disconnect(); refreshAuthUI(); });

// --- tabs -----------------------------------------------------------------
el.tabs.forEach((t) => t.addEventListener("click", () => {
  el.tabs.forEach((x) => x.classList.toggle("active", x === t));
  const name = t.dataset.tab;
  el.views.forEach((v) => (v.hidden = v.dataset.view !== name));
  if (name === "tracker") renderTracker();
}));

// --- profile --------------------------------------------------------------
function loadProfileIntoUI() {
  const p = tracker.loadProfile();
  el.pResume.value = p.resume || "";
  el.pTitle.value = p.title || "";
  el.pYears.value = p.years ?? "";
  el.pSkills.value = p.skills || "";
  el.pLocation.value = p.location || "";
  el.pWorkpref.value = p.workPref || "";
}
function readProfileFromUI() {
  return {
    resume: el.pResume.value.trim(),
    title: el.pTitle.value.trim(),
    years: el.pYears.value === "" ? null : Number(el.pYears.value),
    skills: el.pSkills.value.trim(),
    location: el.pLocation.value.trim(),
    workPref: el.pWorkpref.value.trim(),
  };
}
el.pSave.addEventListener("click", () => {
  tracker.saveProfile(readProfileFromUI());
  el.pSaved.textContent = "Saved ✓";
  setTimeout(() => (el.pSaved.textContent = ""), 2000);
  updateScoreHint();
});

function updateScoreHint() {
  const p = tracker.loadProfile();
  if (!p.resume) el.scoreHint.textContent = "Add your resume in the Profile tab first.";
  else if (!isConnected()) el.scoreHint.textContent = "Connect Pollen, then score.";
  else el.scoreHint.textContent = "Ready — paste a job description and score.";
}

// --- scoring --------------------------------------------------------------
el.scoreBtn.addEventListener("click", async () => {
  hideBanner();
  const profile = tracker.loadProfile();
  if (!profile.resume) { showBanner("info", "Add your resume in the <strong>Profile</strong> tab first."); return; }
  const jd = el.jd.value.trim();
  if (!jd) { showBanner("info", "Paste a job description to score."); return; }
  if (!isConnected()) { showBanner("info", "Connect your Pollen first — each scorecard is one cheap Jev call."); return; }

  el.scoreBtn.disabled = true;
  el.scoreBtn.textContent = "Asking Jev…";
  try {
    const s = await scoreFit(profile, jd);
    lastScore = s;
    renderScorecard(s);
  } catch (e) {
    handleApiError(e);
  } finally {
    el.scoreBtn.disabled = false;
    el.scoreBtn.textContent = "Should I apply?";
  }
});

function pct(x) { return typeof x === "number" ? Math.round(x * 100) + "%" : "—"; }
function scorePct(x) { return typeof x === "number" ? Math.round((x / 4) * 100) : null; } // 0..4 -> %

function renderScorecard(s) {
  el.scorecard.hidden = false;
  const rec = recommendation(s);
  el.verdictBadge.dataset.v = rec.verdict;
  el.verdictBadge.textContent = { apply: "Apply", stretch: "Stretch", skip: "Skip", maybe: "Maybe" }[rec.verdict];
  el.oddsNum.textContent = pct(s.passProbability);
  // Drive the ring gauge: fill % + color matched to the verdict.
  const gauge = document.getElementById("gauge");
  if (gauge) {
    const p = typeof s.passProbability === "number" ? Math.round(s.passProbability * 100) : 0;
    const color = rec.verdict === "apply" ? "var(--apply)" : rec.verdict === "skip" ? "var(--skip)" : "var(--stretch)";
    gauge.style.setProperty("--p", p);
    gauge.style.setProperty("--gc", color);
  }
  el.verdictReasons.textContent = rec.reasons.length ? "Why: " + rec.reasons.join(" · ") : "Looks like a solid fit.";

  const rows = [];
  rows.push(metricRow("Technical overlap", scorePct(s.overlap), legendLabel(s.overlap, s.overlapLegend)));
  rows.push(metricRow("Experience vs. ask", scorePct(s.gap), legendLabel(s.gap, s.gapLegend)));
  rows.push(metricRow("Has core skills", pctNum(s.hasCoreSkills), pct(s.hasCoreSkills)));
  rows.push(flagRow("Location / arrangement", s.locationOk, true));
  rows.push(flagRow("Hard blocker", s.hardBlocker, false));
  if (s.seniority) rows.push(`<div class="metric"><span class="m-label">Seniority</span><span class="flag">${escapeHtml(s.seniority.replace("_"," "))}</span><span></span></div>`);
  el.metrics.innerHTML = rows.join("");

  el.scoreUsage.textContent = s.usage ? `by Jev ✓ (${s.usage.input_tokens}→${s.usage.output_tokens} tokens)` : "by Jev ✓";
}

function pctNum(x) { return typeof x === "number" ? Math.round(x * 100) : null; }
function legendLabel(score, legend) {
  if (typeof score !== "number") return "—";
  if (legend) { const l = legend[String(Math.round(score))]; if (l) return l; }
  return (score / 4 * 100).toFixed(0) + "%";
}
function cls(p) { return p == null ? "" : p >= 66 ? "good" : p >= 40 ? "mid" : "bad"; }
function metricRow(label, p, valText) {
  const w = p == null ? 0 : p;
  return `<div class="metric"><span class="m-label">${label}</span><span class="m-track"><span class="m-fill ${cls(p)}" style="width:${w}%"></span></span><span class="m-val">${escapeHtml(String(valText))}</span></div>`;
}
function flagRow(label, noul, positiveIsGood) {
  if (typeof noul !== "number") return `<div class="metric"><span class="m-label">${label}</span><span class="flag">—</span><span></span></div>`;
  // For location: high = good. For hard blocker: high = bad.
  const good = positiveIsGood ? noul >= 0.5 : noul < 0.5;
  const text = positiveIsGood ? (good ? "compatible" : "possible mismatch") : (noul >= 0.5 ? `likely (${pct(noul)})` : "none detected");
  return `<div class="metric"><span class="m-label">${label}</span><span class="flag ${good ? "ok" : "warn"}">${text}</span><span></span></div>`;
}

// --- track it -------------------------------------------------------------
el.trackBtn.addEventListener("click", () => {
  const { app, duplicate } = tracker.addApplication({
    title: el.jTitle.value.trim() || guessTitle(el.jd.value),
    company: el.jCompany.value.trim(),
    url: el.jUrl.value.trim(),
    fit: lastScore?.passProbability ?? null,
  });
  if (duplicate) showBanner("info", `Tracked. Note: you already saved a job at that link on ${escapeHtml(duplicate.date)}.`);
  else showBanner("info", "Tracked. See the <strong>Tracker</strong> tab.");
  updateTrackerCount();
});
function guessTitle(jd) {
  const first = (jd || "").split("\n").map((l) => l.trim()).find(Boolean);
  return first ? first.slice(0, 60) : "Untitled role";
}

// --- tracker view ---------------------------------------------------------
function updateTrackerCount() {
  const n = tracker.loadApplications().length;
  el.trackerCount.textContent = n ? n : "";
}
function renderTracker() {
  const apps = tracker.loadApplications();
  if (!apps.length) { el.trackerList.innerHTML = '<p class="empty muted">Nothing tracked yet. Score a job and hit "I applied".</p>'; return; }
  el.trackerList.innerHTML = apps.map((a) => `
    <div class="track-card" data-id="${a.id}">
      <div class="track-main">
        <div class="track-title">${escapeHtml(a.title)}${a.company ? ' · <span class="muted">' + escapeHtml(a.company) + "</span>" : ""}</div>
        <div class="track-sub">
          <span>${escapeHtml(a.date)}</span>
          ${a.fit != null ? `<span class="fitpill">${Math.round(a.fit * 100)}% odds</span>` : ""}
          ${a.url ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.url)}</a>` : ""}
        </div>
      </div>
      <div class="track-actions">
        <select data-act="status">${tracker.STATUSES.map((s) => `<option value="${s}"${s === a.status ? " selected" : ""}>${s}</option>`).join("")}</select>
        <button class="del" data-act="del" title="Remove">✕</button>
      </div>
    </div>`).join("");
  el.trackerList.querySelectorAll(".track-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="status"]').addEventListener("change", (e) => tracker.updateApplication(id, { status: e.target.value }));
    card.querySelector('[data-act="del"]').addEventListener("click", () => { tracker.removeApplication(id); renderTracker(); updateTrackerCount(); });
  });
}
el.exportJson.addEventListener("click", () => tracker.download("applications.json", tracker.exportJSON(), "application/json"));
el.exportCsv.addEventListener("click", () => tracker.download("applications.csv", tracker.exportCSV(), "text/csv"));

// --- one-click example ----------------------------------------------------
const EXAMPLE_PROFILE = {
  resume:
    "Priya Sharma — Backend Software Engineer, Berlin (open to EU remote). 4 years building Python services. " +
    "Senior Backend Engineer at FinFlow (fintech, 2023-present): payment-reconciliation microservices in Python/FastAPI, " +
    "~2M transactions/day, PostgreSQL schema + query optimization (p95 450ms->120ms), AWS (ECS/RDS/S3/CloudWatch), " +
    "CI/CD with GitHub Actions, on-call. Backend Engineer at ShopStack (2021-2023): REST APIs in Python/Flask, Redis " +
    "caching, raised test coverage 41%->78%. Skills: Python, FastAPI, Flask, PostgreSQL, Redis, Docker, AWS, REST, " +
    "CI/CD, pytest, Git, Linux, basic Kubernetes. BSc Computer Science 2021.",
  title: "Backend Software Engineer",
  years: 4,
  skills: "Python, FastAPI, PostgreSQL, AWS, Redis, Docker",
  location: "Berlin / EU remote",
  workPref: "remote or hybrid in EU",
};
const EXAMPLE_JD =
  "Backend Engineer (Python) — Remote (EU). PayGrid. Build payment and reconciliation services in Python (FastAPI). " +
  "Own PostgreSQL schema and query performance. Deploy on AWS; participate in on-call. Requirements: 3+ years backend " +
  "Python, strong relational databases (PostgreSQL preferred), AWS and CI/CD, comfortable owning a service end-to-end. " +
  "Nice to have: Redis, Docker, fintech/payments background. Location: Remote within the EU.";

const loadExampleBtn = document.getElementById("load-example");
if (loadExampleBtn) {
  loadExampleBtn.addEventListener("click", () => {
    // Only fill the profile if the user hasn't set their own.
    const existing = tracker.loadProfile();
    if (!existing.resume) {
      tracker.saveProfile(EXAMPLE_PROFILE);
      loadProfileIntoUI();
    }
    el.jd.value = EXAMPLE_JD;
    el.jTitle.value = "Backend Engineer (Python)";
    el.jCompany.value = "PayGrid";
    updateScoreHint();
    showBanner("info", "Loaded a sample profile + job. Connect Pollen, then hit “Should I apply?” — this one should score high.");
  });
}

// --- errors + util --------------------------------------------------------
function handleApiError(e) {
  if (e.code === 402) showBanner("error", `Out of Pollen budget. <a href="${CONFIG.KEYS_DASHBOARD}" target="_blank" rel="noopener">Top up or reconnect →</a>`);
  else if (e.code === 401 || e.code === "not_connected") { disconnect(); refreshAuthUI(); showBanner("error", "Session expired — connect again."); }
  else showBanner("error", `Couldn't score (${escapeHtml(String(e.code || e.message))}). Try again.`);
}
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// --- boot -----------------------------------------------------------------
async function boot() {
  loadProfileIntoUI();
  updateTrackerCount();
  const outcome = await handleRedirectCallback();
  if (outcome === "connected") showBanner("info", "Connected. Paste a job description and get your odds.");
  else if (outcome && outcome.startsWith("error:")) { const r = outcome.slice(6); if (r !== "access_denied") showBanner("error", `Sign-in failed: ${escapeHtml(r)}.`); }
  refreshAuthUI();
  updateScoreHint();
}
boot();
