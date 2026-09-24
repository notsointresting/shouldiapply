// ShouldIApply — controller.

import { CONFIG } from "./config.js";
import { login, disconnect, isConnected, fetchUserInfo, handleRedirectCallback } from "./auth.js";
import { scoreFit, recommendation, MAX_CHARS } from "./jev.js";
import { improveChances } from "./improve.js";
import * as tracker from "./tracker.js";

const $ = (id) => document.getElementById(id);
const el = {
  connect: $("connect-btn"), disconnect: $("disconnect-btn"), status: $("conn-status"),
  banner: $("banner"), steps: $("steps"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  trackerCount: $("tracker-count"),
  // profile
  pResume: $("p-resume"), pTitle: $("p-title"), pYears: $("p-years"), pSkills: $("p-skills"),
  pLocation: $("p-location"), pWorkpref: $("p-workpref"), pSaved: $("p-saved"), pCount: $("p-count"),
  pImport: $("p-import"), pFile: $("p-file"),
  // score
  scoreView: $("view-score"),
  jd: $("jd"), jdCount: $("jd-count"), jTitle: $("j-title"), jCompany: $("j-company"), jUrl: $("j-url"),
  scoreBtn: $("score-btn"), scoreHint: $("score-hint"),
  scorecard: $("scorecard"), staleNote: $("stale-note"), gauge: $("gauge"),
  verdictBadge: $("verdict-badge"), oddsNum: $("odds-num"),
  verdictReasons: $("verdict-reasons"), reqs: $("reqs"), reqsList: $("reqs-list"),
  metrics: $("metrics"), scoreUsage: $("score-usage"),
  trackBtn: $("track-btn"), shareBtn: $("share-btn"),
  improveBtn: $("improve-btn"), improve: $("improve"), improveBody: $("improve-body"),
  recent: $("recent"), recentList: $("recent-list"), recentClear: $("recent-clear"),
  // tracker
  trackerList: $("tracker-list"), stats: $("stats"), calibBody: $("calib-body"),
  tSearch: $("t-search"), tStatus: $("t-status"), tSort: $("t-sort"),
  importJson: $("import-json"), importFile: $("import-file"),
  exportJson: $("export-json"), exportCsv: $("export-csv"),
};

const DRAFT_KEY = "sia_draft"; // sessionStorage: survives the OAuth redirect
const VERDICT_LABEL = { apply: "Apply", stretch: "Worth a try", skip: "Probably skip", maybe: "Not sure" };
const STATUS_LABEL = { applied: "Applied", interview: "Interview", offer: "Offer", rejected: "Rejected" };
const SENIORITY_LABEL = { underqualified: "below what they want", good_fit: "about right", overqualified: "above what they want" };

let lastScore = null;  // scorecard currently shown
let scoredJd = "";     // the JD that produced lastScore
let tracked = false;   // lastScore already logged to the tracker
let inflight = null;   // AbortController of the running Jev call
let improving = null;  // AbortController of the running "Improve my chances" call

// --- banner ---------------------------------------------------------------
function showBanner(kind, html, action) {
  el.banner.hidden = false;
  el.banner.dataset.kind = kind;
  el.banner.setAttribute("role", kind === "error" ? "alert" : "status");
  el.banner.innerHTML = html;
  if (action) {
    const b = document.createElement("button");
    b.className = "btn btn-ghost small banner-action";
    b.textContent = action.label;
    b.addEventListener("click", () => { action.run(); hideBanner(); });
    el.banner.append(" ", b);
  }
}
function hideBanner() { el.banner.hidden = true; }

// --- auth -----------------------------------------------------------------
function refreshAuthUI() {
  const connected = isConnected();
  el.status.dataset.state = connected ? "on" : "off";
  el.status.textContent = connected ? "Signed in" : "Not signed in";
  el.connect.hidden = connected;
  el.disconnect.hidden = !connected;
  if (connected) fetchUserInfo().then((u) => { if (u && (u.username || u.name) && isConnected()) el.status.textContent = "Signed in as " + (u.username || u.name); });
  updateSteps();
  updateScoreHint();
}
async function connect() {
  saveDraft(); // the redirect reloads the page
  try { await login(); }
  catch (e) { showBanner("error", `${escapeHtml(e.message)} <a href="${CONFIG.KEYS_DASHBOARD}" target="_blank" rel="noopener">Key dashboard →</a>`); }
}
el.connect.addEventListener("click", connect);
el.disconnect.addEventListener("click", () => { disconnect(); refreshAuthUI(); });

// --- tabs (hash-routed, arrow-key navigable) -------------------------------
const TAB_NAMES = [...el.tabs].map((t) => t.dataset.tab);
function showTab(name, focus = false) {
  if (!TAB_NAMES.includes(name)) name = "score";
  el.tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  el.views.forEach((v) => (v.hidden = v.dataset.view !== name));
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  if (name === "tracker") renderTracker();
}
el.tabs.forEach((t) => {
  t.addEventListener("click", () => showTab(t.dataset.tab));
  t.addEventListener("keydown", (e) => {
    const i = TAB_NAMES.indexOf(t.dataset.tab);
    if (e.key === "ArrowRight") showTab(TAB_NAMES[(i + 1) % TAB_NAMES.length], true);
    else if (e.key === "ArrowLeft") showTab(TAB_NAMES[(i - 1 + TAB_NAMES.length) % TAB_NAMES.length], true);
  });
});
addEventListener("hashchange", () => showTab(location.hash.slice(1)));

// --- onboarding steps -------------------------------------------------------
function updateSteps() {
  const hasProfile = !!tracker.loadProfile().resume;
  const connected = isConnected();
  el.steps.querySelector('[data-step="profile"]').dataset.done = hasProfile;
  el.steps.querySelector('[data-step="connect"]').dataset.done = connected;
  el.steps.hidden = hasProfile && connected;
}
el.steps.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]")?.dataset.goto;
  if (go === "profile") showTab("profile", true);
  else if (go === "connect") connect();
});

// --- profile (autosaves) ----------------------------------------------------
const PROFILE_FIELDS = [el.pResume, el.pTitle, el.pYears, el.pSkills, el.pLocation, el.pWorkpref];
function loadProfileIntoUI() {
  const p = tracker.loadProfile();
  el.pResume.value = p.resume || "";
  el.pTitle.value = p.title || "";
  el.pYears.value = p.years ?? "";
  el.pSkills.value = p.skills || "";
  el.pLocation.value = p.location || "";
  el.pWorkpref.value = p.workPref || "";
  updateCounts();
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
let savedTimer;
function saveProfileNow() {
  try {
    tracker.saveProfile(readProfileFromUI());
    el.pSaved.textContent = "Saved ✓";
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (el.pSaved.textContent = "Saved automatically, only on this device"), 1500);
  } catch {
    showBanner("error", "Couldn't save your resume — your browser's storage is full or turned off.");
  }
  updateCounts();
  updateScoreHint();
  updateSteps();
}
PROFILE_FIELDS.forEach((f) => f.addEventListener("input", saveProfileNow));

// Resume import: .txt read directly, PDF via pdf.js (loaded only when used).
el.pImport.addEventListener("click", () => el.pFile.click());
el.pFile.addEventListener("change", async () => {
  const file = el.pFile.files[0];
  el.pFile.value = "";
  if (!file) return;
  el.pImport.disabled = true;
  el.pImport.textContent = "Reading file…";
  try {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const text = isPdf ? await pdfToText(file) : await file.text();
    if (!text.trim()) throw new Error("no text found — it may be a scanned image");
    el.pResume.value = text;
    saveProfileNow();
    showBanner("info", `Added your resume from ${escapeHtml(file.name)}. Take a quick look — PDFs don't always copy over perfectly.`);
  } catch (e) {
    showBanner("error", `Couldn't read ${escapeHtml(file.name)} (${escapeHtml(e.message)}). Please copy and paste your resume instead.`);
  } finally {
    el.pImport.disabled = false;
    el.pImport.textContent = "Upload PDF or text file";
  }
});
async function pdfToText(file) {
  const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/";
  const pdfjs = await import(base + "pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join(""));
  }
  return pages.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --- counts + hints ---------------------------------------------------------
function countText(n) {
  if (!n) return "";
  return n > MAX_CHARS ? `${n.toLocaleString()} characters — too long, only the first ${MAX_CHARS.toLocaleString()} will be used` : `${n.toLocaleString()} characters`;
}
function updateCounts() {
  el.pCount.textContent = countText(el.pResume.value.length);
  el.jdCount.textContent = countText(el.jd.value.length);
  el.pCount.classList.toggle("over", el.pResume.value.length > MAX_CHARS);
  el.jdCount.classList.toggle("over", el.jd.value.length > MAX_CHARS);
}
function updateScoreHint() {
  const p = tracker.loadProfile();
  if (!isConnected()) el.scoreHint.textContent = "First, sign in with Pollinations (top right).";
  else if (!p.resume) el.scoreHint.textContent = "Next, add your resume in the “My resume” tab.";
  else el.scoreHint.textContent = "Ready — paste a job ad and click “Should I apply?”";
}

// --- JD draft (survives reloads + the OAuth round-trip) ---------------------
const DRAFT_FIELDS = { jd: el.jd, title: el.jTitle, company: el.jCompany, url: el.jUrl };
function saveDraft() {
  const d = {};
  for (const [k, f] of Object.entries(DRAFT_FIELDS)) d[k] = f.value;
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode: draft just won't persist */ }
}
function restoreDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {};
    for (const [k, f] of Object.entries(DRAFT_FIELDS)) if (d[k]) f.value = d[k];
  } catch { /* ignore */ }
}
Object.values(DRAFT_FIELDS).forEach((f) => f.addEventListener("input", () => { saveDraft(); updateCounts(); checkStale(); }));

// A scorecard for a different JD must not be tracked as if it were current.
function checkStale() {
  if (el.scorecard.hidden || !lastScore) return;
  const stale = el.jd.value.trim() !== scoredJd;
  el.staleNote.hidden = !stale;
  el.scorecard.classList.toggle("stale", stale);
  el.trackBtn.disabled = stale || tracked;
  el.improveBtn.disabled = stale || !!improving;
}

// --- scoring --------------------------------------------------------------
el.scoreView.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.scoreBtn.click(); }
});
el.scoreBtn.addEventListener("click", async () => {
  if (inflight) { inflight.abort("cancel"); return; }
  hideBanner();
  const profile = tracker.loadProfile();
  if (!isConnected()) { showBanner("info", "Please sign in with Pollinations first (top right). Each check uses a tiny amount of your Pollinations credit."); return; }
  if (!profile.resume) { showBanner("info", "Next, add your resume in the <strong>My resume</strong> tab."); return; }
  const jd = el.jd.value.trim();
  if (!jd) { showBanner("info", "Paste a job ad first."); el.jd.focus(); return; }

  const ctrl = (inflight = new AbortController());
  const timer = setTimeout(() => ctrl.abort("timeout"), 60000);
  el.scoreBtn.textContent = "Cancel";
  showLoading();
  try {
    const s = await scoreFit(profile, jd, { signal: ctrl.signal });
    lastScore = s;
    scoredJd = jd;
    tracked = false;
    renderScorecard(s);
    try {
      tracker.addRecent({ jd, title: el.jTitle.value.trim() || guessTitle(jd), company: el.jCompany.value.trim(), url: el.jUrl.value.trim(), score: s });
    } catch { /* recent list is a convenience; ignore quota errors */ }
    renderRecent();
  } catch (e) {
    if (lastScore) renderScorecard(lastScore); else el.scorecard.hidden = true;
    if (ctrl.signal.aborted) {
      if (ctrl.signal.reason === "timeout") showBanner("error", "This is taking too long. Please try again in a moment.");
      else showBanner("info", "Stopped.");
    } else handleApiError(e);
  } finally {
    clearTimeout(timer);
    inflight = null;
    el.scorecard.classList.remove("loading");
    el.scorecard.setAttribute("aria-busy", "false");
    el.scoreBtn.textContent = "Should I apply?";
  }
});

function showLoading() {
  el.improve.hidden = true;
  el.improveBtn.disabled = true;
  el.scorecard.hidden = false;
  el.scorecard.classList.add("loading");
  el.scorecard.classList.remove("stale");
  el.scorecard.setAttribute("aria-busy", "true");
  el.staleNote.hidden = true;
  el.verdictBadge.dataset.v = "maybe";
  el.verdictBadge.textContent = "Checking…";
  el.oddsNum.textContent = "…";
  el.gauge.style.setProperty("--p", 0);
  el.verdictReasons.textContent = "";
  el.reqs.hidden = true;
  el.metrics.innerHTML = '<div class="skeleton"></div>'.repeat(5);
  el.scoreUsage.textContent = "";
  el.trackBtn.disabled = true;
  el.shareBtn.disabled = true;
}

const pct = (x) => (typeof x === "number" ? Math.round(x * 100) + "%" : "—");
const pctNum = (x) => (typeof x === "number" ? Math.round(x * 100) : null);
const scorePct = (x) => (typeof x === "number" ? Math.round((x / 4) * 100) : null); // 0..4 -> %
// Experience scale: 2 = "meets required years"; meeting or beating the ask is a full bar.
const gapPct = (x) => (typeof x === "number" ? Math.round(Math.min(x / 2, 1) * 100) : null);
const verdictColor = (v) => (v === "maybe" ? "var(--muted)" : `var(--${v})`);

function renderScorecard(s) {
  el.scorecard.hidden = false;
  el.scorecard.classList.remove("loading");
  const rec = recommendation(s);
  el.verdictBadge.dataset.v = rec.verdict;
  el.verdictBadge.textContent = VERDICT_LABEL[rec.verdict];
  el.oddsNum.textContent = pct(s.passProbability);
  el.gauge.style.setProperty("--p", pctNum(s.passProbability) ?? 0);
  el.gauge.style.setProperty("--gc", verdictColor(rec.verdict));
  el.gauge.setAttribute("aria-label", typeof s.passProbability === "number" ? `${pct(s.passProbability)} chance — ${VERDICT_LABEL[rec.verdict]}` : "No result");

  if (typeof s.passProbability !== "number") el.verdictReasons.textContent = "The AI didn't give a clear answer this time — please try again.";
  else if (rec.reasons.length) el.verdictReasons.textContent = "Why: " + rec.reasons.join(" · ") + ".";
  else el.verdictReasons.textContent = "You look like a strong match for this job.";

  const reqs = s.requirements || [];
  el.reqs.hidden = !reqs.length;
  el.reqsList.innerHTML = reqs.map((r) => {
    const state = typeof r.met !== "number" ? "unknown" : r.met >= 0.6 ? "met" : r.met >= 0.4 ? "partial" : "unmet";
    const icon = { met: "✓", partial: "~", unmet: "✗", unknown: "?" }[state];
    const label = { met: "yes", partial: "unclear", unmet: "not on resume", unknown: "no answer" }[state];
    return `<li data-state="${state}"><span class="req-icon" aria-hidden="true">${icon}</span><span class="req-name">${escapeHtml(r.name)}</span><span class="req-val">${label}${typeof r.met === "number" ? " · " + pct(r.met) : ""}</span></li>`;
  }).join("");

  const rows = [
    metricRow("Skills match", scorePct(s.overlap), legendLabel(s.overlap, s.overlapLegend)),
    metricRow("Years of experience", gapPct(s.gap), legendLabel(s.gap, s.gapLegend)),
    metricRow("Has the must-have skills", pctNum(s.hasCoreSkills), pct(s.hasCoreSkills)),
    flagRow("Location / remote", s.locationOk, true),
    flagRow("Deal-breaker (license, visa…)", s.hardBlocker, false),
  ];
  if (s.seniority) rows.push(`<div class="metric"><span class="m-label">Job level</span><span class="flag">${escapeHtml(SENIORITY_LABEL[s.seniority] || s.seniority.replace("_", " "))}</span><span></span></div>`);
  el.metrics.innerHTML = rows.join("");

  el.scoreUsage.textContent = usageText(s.usage);
  el.shareBtn.disabled = false;
  el.trackBtn.textContent = tracked ? "Saved ✓" : "I applied — save it";
  el.trackBtn.disabled = tracked;
  el.staleNote.hidden = true;
  el.scorecard.classList.remove("stale");
  checkStale();
}

// ponytail: shows Pollen cost only if the API reports `usage.cost`; tokens otherwise.
function usageText(u) {
  if (u && typeof u.cost === "number") return `Checked by Jev AI ✓ · cost ${u.cost.toFixed(4)} Pollen`;
  return "Checked by Jev AI ✓";
}
function legendLabel(score, legend) {
  if (typeof score !== "number") return "—";
  if (legend) { const l = legend[String(Math.round(score))]; if (l) return l; }
  return ((score / 4) * 100).toFixed(0) + "%";
}
const barCls = (p) => (p == null ? "" : p >= 66 ? "good" : p >= 40 ? "mid" : "bad");
function metricRow(label, p, valText) {
  return `<div class="metric"><span class="m-label">${label}</span><span class="m-track" aria-hidden="true"><span class="m-fill ${barCls(p)}" style="width:${p ?? 0}%"></span></span><span class="m-val">${escapeHtml(String(valText))}</span></div>`;
}
function flagRow(label, noul, positiveIsGood) {
  if (typeof noul !== "number") return `<div class="metric"><span class="m-label">${label}</span><span class="flag">—</span><span></span></div>`;
  // For location: high = good. For hard blocker: high = bad.
  const good = positiveIsGood ? noul >= 0.5 : noul < 0.5;
  const text = positiveIsGood ? (good ? "works for you" : "may not work") : (noul >= 0.5 ? `likely (${pct(noul)})` : "none found");
  return `<div class="metric"><span class="m-label">${label}</span><span class="flag ${good ? "ok" : "warn"}">${good ? "✓" : "!"} ${text}</span><span></span></div>`;
}

// --- improve my chances ------------------------------------------------------
el.improveBtn.addEventListener("click", async () => {
  if (improving) { improving.abort("cancel"); return; }
  if (!lastScore) return;
  if (!isConnected()) { showBanner("info", "Please sign in with Pollinations first (top right)."); return; }
  const profile = tracker.loadProfile();
  if (!profile.resume) { showBanner("info", "Add your resume in the <strong>My resume</strong> tab first."); return; }

  hideBanner();
  const ctrl = (improving = new AbortController());
  const timer = setTimeout(() => ctrl.abort("timeout"), 90000);
  el.improveBtn.textContent = "Cancel";
  el.improve.hidden = false;
  el.improve.setAttribute("aria-busy", "true");
  el.improveBody.innerHTML = '<p class="muted">Rewriting your resume for this job… this takes about 10–30 seconds.</p>' + '<div class="skeleton"></div>'.repeat(4);
  el.improve.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const r = await improveChances(profile, scoredJd, lastScore, { signal: ctrl.signal });
    renderImprove(r);
  } catch (e) {
    el.improve.hidden = true;
    if (ctrl.signal.aborted) {
      if (ctrl.signal.reason === "timeout") showBanner("error", "The rewrite is taking too long. Please try again in a moment.");
      else showBanner("info", "Stopped.");
    } else if (e.message === "bad_reply" || e instanceof SyntaxError) {
      showBanner("error", "The AI sent back something we couldn’t read. Please try again.");
    } else handleApiError(e);
  } finally {
    clearTimeout(timer);
    improving = null;
    el.improve.setAttribute("aria-busy", "false");
    el.improveBtn.textContent = "Improve my chances";
    checkStale();
  }
});

// Rewrites that contain numbers not in the resume get a visible warning.
const numberWarning = (nums) => (nums?.length
  ? `<p class="warn-note">⚠ Contains ${nums.map((n) => `“${escapeHtml(n)}”`).join(", ")}, which isn’t in your resume. Only keep it if it’s true.</p>`
  : "");
const copyBtn = (text) => `<button type="button" class="btn btn-ghost small copy-btn" data-copy="${escapeHtml(text)}">Copy</button>`;

function renderImprove(r) {
  const parts = [];
  if (r.summary) parts.push(`<p class="improve-summary">${escapeHtml(r.summary)}</p>`);
  if (r.bullets.length) {
    parts.push(`<h3 class="sub-h">Resume lines to rewrite</h3><div class="rewrites">${r.bullets.map((b) => `
      <div class="rewrite">
        ${b.before ? `<p class="rw-before"><span class="rw-tag">Now</span>${escapeHtml(b.before)}</p>` : ""}
        <p class="rw-after"><span class="rw-tag">Better</span>${escapeHtml(b.after)}</p>
        ${numberWarning(b.newNumbers)}
        <div class="rw-foot">${b.why ? `<span class="muted small">Shows: ${escapeHtml(b.why)}</span>` : "<span></span>"}${copyBtn(b.after)}</div>
      </div>`).join("")}</div>`);
  }
  if (r.skills.length) {
    parts.push(`<h3 class="sub-h">Skills to name clearly (your resume already shows them)</h3><div class="chips">${r.skills.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join("")}</div>`);
  }
  if (r.headline) {
    parts.push(`<h3 class="sub-h">LinkedIn headline</h3><div class="rewrite"><p class="rw-after">${escapeHtml(r.headline)}</p>${numberWarning(r.headlineNewNumbers)}<div class="rw-foot"><span class="muted small">${r.headline.length}/220 characters</span>${copyBtn(r.headline)}</div></div>`);
  }
  if (r.about) {
    parts.push(`<h3 class="sub-h">LinkedIn “About” section</h3><div class="rewrite"><div class="rw-about">${r.about.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>${numberWarning(r.aboutNewNumbers)}<div class="rw-foot"><span></span>${copyBtn(r.about)}</div></div>`);
  }
  if (r.gaps.length) {
    parts.push(`<h3 class="sub-h">Gaps rewording can’t fix — and what to do instead</h3><ul class="gap-list">${r.gaps.map((g) => `<li><strong>${escapeHtml(g.gap)}</strong>${g.how ? `<span>${escapeHtml(g.how)}</span>` : ""}</li>`).join("")}</ul>`);
  }
  el.improveBody.innerHTML = parts.join("") || '<p class="muted">The AI didn’t suggest any changes. Please try again.</p>';
}
el.improveBody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  } catch {
    showBanner("error", "Couldn’t copy — select the text and copy it yourself.");
  }
});

// --- track it -------------------------------------------------------------
el.trackBtn.addEventListener("click", () => {
  if (!lastScore || tracked) return;
  try {
    const { duplicate } = tracker.addApplication({
      title: el.jTitle.value.trim() || guessTitle(scoredJd),
      company: el.jCompany.value.trim(),
      url: el.jUrl.value.trim(),
      fit: lastScore.passProbability,
      jd: scoredJd,
      score: lastScore,
    });
    tracked = true;
    el.trackBtn.disabled = true;
    el.trackBtn.textContent = "Saved ✓";
    if (duplicate) showBanner("info", `Saved. Heads up: you already saved this job on ${escapeHtml(duplicate.date)}.`);
    else showBanner("info", "Saved to <strong>My applications</strong>.");
    updateTrackerCount();
  } catch {
    showBanner("error", "Couldn't save — your browser's storage is full. Download a backup, then delete some old applications.");
  }
});
// "Backend Engineer (Python) — Remote (EU). PayGrid…" → "Backend Engineer (Python)"
function guessTitle(jd) {
  const first = (jd || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  const head = first.split(/\s[—–-]\s|\.\s|\s\|\s/)[0].trim();
  return (head && head.length <= 80 ? head : first.slice(0, 60)) || "Untitled role";
}

// --- share as image -----------------------------------------------------------
el.shareBtn.addEventListener("click", async () => {
  if (!lastScore) return;
  await document.fonts?.ready;
  const rec = recommendation(lastScore);
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const color = v(rec.verdict === "maybe" ? "--muted" : "--" + rec.verdict);
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d");
  const font = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;
  g.fillStyle = v("--bg"); g.fillRect(0, 0, 1200, 630);
  g.lineWidth = 34; g.strokeStyle = v("--line");
  g.beginPath(); g.arc(300, 315, 170, 0, Math.PI * 2); g.stroke();
  const p = lastScore.passProbability ?? 0;
  if (p > 0) {
    g.strokeStyle = color; g.lineCap = "round";
    g.beginPath(); g.arc(300, 315, 170, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); g.stroke();
  }
  g.textAlign = "center"; g.fillStyle = v("--text"); g.font = font(800, 92);
  g.fillText(pct(lastScore.passProbability), 300, 345);
  g.fillStyle = v("--muted"); g.font = font(600, 22);
  g.fillText("CHANCE", 300, 388);
  g.textAlign = "left";
  g.fillStyle = color; g.font = font(800, 64);
  g.fillText(VERDICT_LABEL[rec.verdict].toUpperCase(), 560, 250);
  const title = (el.jTitle.value.trim() || guessTitle(scoredJd)).slice(0, 38);
  g.fillStyle = v("--text"); g.font = font(700, 38);
  g.fillText(title, 560, 315);
  g.fillStyle = v("--muted"); g.font = font(600, 28);
  g.fillText(el.jCompany.value.trim().slice(0, 40), 560, 360);
  g.font = font(600, 22);
  g.fillText("◔ ShouldIApply · chance of passing the first resume check", 560, 540);
  c.toBlob((b) => b && tracker.download("shouldiapply-odds.png", b), "image/png");
});

// --- recent scores (compare side by side) -------------------------------------
function renderRecent() {
  const list = tracker.loadRecent();
  el.recent.hidden = !list.length;
  const ranked = [...list].sort((a, b) => (b.score?.passProbability ?? -1) - (a.score?.passProbability ?? -1));
  el.recentList.innerHTML = ranked.map((r) => {
    const v = recommendation(r.score || {}).verdict;
    return `<li><button type="button" class="recent-item" data-id="${escapeHtml(r.id)}">
      <span class="fitpill" data-v="${v}">${pct(r.score?.passProbability)}</span>
      <span class="recent-title">${escapeHtml(r.title || "Untitled role")}${r.company ? ' <span class="muted">· ' + escapeHtml(r.company) + "</span>" : ""}</span>
      <span class="verdict-mini" data-v="${v}">${VERDICT_LABEL[v]}</span>
    </button></li>`;
  }).join("");
}
el.recentList.addEventListener("click", (e) => {
  const id = e.target.closest(".recent-item")?.dataset.id;
  const r = tracker.loadRecent().find((x) => x.id === id);
  if (!r) return;
  openScore({ jd: r.jd, title: r.title, company: r.company, url: r.url, score: r.score }, false);
});
el.recentClear.addEventListener("click", () => { tracker.clearRecent(); renderRecent(); });

// Load a saved JD + scorecard back into the Score tab.
function openScore({ jd, title, company, url, score }, isTracked) {
  el.jd.value = jd || "";
  el.jTitle.value = title || "";
  el.jCompany.value = company || "";
  el.jUrl.value = url || "";
  saveDraft();
  updateCounts();
  lastScore = score;
  el.improve.hidden = true;
  scoredJd = (jd || "").trim();
  tracked = isTracked;
  showTab("score");
  if (score) renderScorecard(score);
  el.scorecard.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- tracker view ---------------------------------------------------------
tracker.STATUSES.forEach((s) => el.tStatus.add(new Option(STATUS_LABEL[s], s)));
function updateTrackerCount() {
  const n = tracker.loadApplications().length;
  el.trackerCount.textContent = n || "";
}
const fitVerdict = (f) => (f >= 0.6 ? "apply" : f >= 0.35 ? "stretch" : "skip");

function renderTracker() {
  const all = tracker.loadApplications();
  const interviews = all.filter((a) => a.status === "interview" || a.status === "offer").length;
  const offers = all.filter((a) => a.status === "offer").length;
  el.stats.innerHTML = all.length
    ? `<span><strong>${all.length}</strong> applied</span><span><strong>${interviews}</strong> interviews</span><span><strong>${offers}</strong> offers</span><span><strong>${Math.round((interviews / all.length) * 100)}%</strong> got an interview</span>`
    : "";

  const q = el.tSearch.value.trim().toLowerCase();
  const st = el.tStatus.value;
  const apps = all
    .filter((a) => !st || a.status === st)
    .filter((a) => !q || [a.title, a.company, a.notes].join(" ").toLowerCase().includes(q))
    .sort({
      date: (a, b) => b.date.localeCompare(a.date),
      odds: (a, b) => (b.fit ?? -1) - (a.fit ?? -1),
      company: (a, b) => (a.company || "~").localeCompare(b.company || "~"),
    }[el.tSort.value]);

  if (!all.length) el.trackerList.innerHTML = '<p class="empty muted">Nothing saved yet. Check a job, then click “I applied — save it”.</p>';
  else if (!apps.length) el.trackerList.innerHTML = '<p class="empty muted">No applications match your search.</p>';
  else el.trackerList.innerHTML = apps.map(trackCard).join("");

  el.calibBody.innerHTML = tracker.calibration(all).map((b) =>
    `<tr><th scope="row">${b.label}</th><td>${b.n}</td><td>${b.interviews}</td><td>${b.n ? Math.round((b.interviews / b.n) * 100) + "%" : "—"}</td></tr>`).join("");
}
function trackCard(a) {
  const url = tracker.safeUrl(a.url);
  const since = a.statusDates?.[a.status];
  return `
    <div class="track-card" data-id="${escapeHtml(a.id)}" data-status="${escapeHtml(a.status)}">
      <div class="track-main">
        <div class="track-title">${escapeHtml(a.title)}${a.company ? ' · <span class="muted">' + escapeHtml(a.company) + "</span>" : ""}</div>
        <div class="track-sub">
          <span>${escapeHtml(a.date)}</span>
          ${a.fit != null ? `<span class="fitpill" data-v="${fitVerdict(a.fit)}">${Math.round(a.fit * 100)}% chance</span>` : ""}
          ${since && a.status !== "applied" ? `<span>${escapeHtml(STATUS_LABEL[a.status] || a.status)} since ${escapeHtml(since)}</span>` : ""}
          ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>` : ""}
        </div>
        <input class="notes" data-act="notes" value="${escapeHtml(a.notes || "")}" placeholder="Add a note…" aria-label="Notes for ${escapeHtml(a.title)}" />
      </div>
      <div class="track-actions">
        <select data-act="status" aria-label="Status for ${escapeHtml(a.title)}">${tracker.STATUSES.map((s) => `<option value="${s}"${s === a.status ? " selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select>
        ${a.score ? '<button class="btn btn-ghost small" data-act="view">View</button>' : ""}
        <button class="del" data-act="del" aria-label="Remove ${escapeHtml(a.title)}" title="Remove">✕</button>
      </div>
    </div>`;
}
el.trackerList.addEventListener("change", (e) => {
  const id = e.target.closest(".track-card")?.dataset.id;
  const act = e.target.dataset.act;
  if (!id) return;
  try {
    if (act === "status") { tracker.updateApplication(id, { status: e.target.value }); renderTracker(); }
    else if (act === "notes") tracker.updateApplication(id, { notes: e.target.value.trim() });
  } catch {
    showBanner("error", "Couldn't save — your browser's storage is full.");
  }
});
el.trackerList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  const id = e.target.closest(".track-card")?.dataset.id;
  if (!btn || !id) return;
  if (btn.dataset.act === "del") {
    const removed = tracker.removeApplication(id);
    renderTracker();
    updateTrackerCount();
    if (removed) showBanner("info", `Removed “${escapeHtml(removed.app.title)}”.`, {
      label: "Undo",
      run: () => { tracker.restoreApplication(removed); renderTracker(); updateTrackerCount(); },
    });
  } else if (btn.dataset.act === "view") {
    const a = tracker.loadApplications().find((x) => x.id === id);
    if (a) openScore({ jd: a.jd, title: a.title, company: a.company, url: a.url, score: a.score }, true);
  }
});
[el.tSearch, el.tStatus, el.tSort].forEach((f) => f.addEventListener("input", renderTracker));

el.importJson.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", async () => {
  const file = el.importFile.files[0];
  el.importFile.value = "";
  if (!file) return;
  try {
    const n = tracker.importJSON(await file.text());
    showBanner("info", n ? `Restored ${n} application${n === 1 ? "" : "s"}.` : "Nothing new to restore — those applications are already here.");
    renderTracker();
    updateTrackerCount();
  } catch (e) {
    showBanner("error", `That file doesn't look like a ShouldIApply backup (${escapeHtml(e.message)}).`);
  }
});
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

$("load-example").addEventListener("click", () => {
  // Only fill the profile if the user hasn't set their own.
  if (!tracker.loadProfile().resume) {
    tracker.saveProfile(EXAMPLE_PROFILE);
    loadProfileIntoUI();
  }
  el.jd.value = EXAMPLE_JD;
  el.jTitle.value = "Backend Engineer (Python)";
  el.jCompany.value = "PayGrid";
  el.jUrl.value = "";
  saveDraft();
  updateCounts();
  checkStale();
  updateScoreHint();
  updateSteps();
  showBanner("info", isConnected()
    ? "Loaded an example resume and job. Click “Should I apply?” — this one should come out high."
    : "Loaded an example resume and job. Sign in (top right) — the example will still be here — then click “Should I apply?”.");
});

// --- errors + util --------------------------------------------------------
function handleApiError(e) {
  if (e.code === 402) showBanner("error", `You've used up your Pollinations credit (called Pollen). <a href="${CONFIG.KEYS_DASHBOARD}" target="_blank" rel="noopener">Add more or sign in again →</a>`);
  else if (e.code === 401 || e.code === "not_connected") { disconnect(); refreshAuthUI(); showBanner("error", "You've been signed out. Please sign in again."); }
  else if (e.code === 429) showBanner("error", "Too many checks at once. Wait a few seconds and try again.");
  else showBanner("error", `Something went wrong (${escapeHtml(String(e.code || e.message))}). Please try again.`);
}
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// --- boot -----------------------------------------------------------------
async function boot() {
  loadProfileIntoUI();
  restoreDraft();
  updateCounts();
  updateTrackerCount();
  renderRecent();
  showTab(location.hash.slice(1) || "score");
  const outcome = await handleRedirectCallback();
  if (outcome === "connected") showBanner("info", "You're signed in. Paste a job ad to see your chances.");
  else if (outcome && outcome.startsWith("error:")) { const r = outcome.slice(6); if (r !== "access_denied") showBanner("error", `Sign-in didn't work (${escapeHtml(r)}). Please try again.`); }
  if (outcome) showTab(document.querySelector(".tab.active")?.dataset.tab); // callback cleanup dropped the #hash
  refreshAuthUI();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
