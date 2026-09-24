// The brain: ask Jev for a calibrated job-fit scorecard.
//
// Jev is a decision model — great at "given this candidate + this JD, how well
// do they fit / will they pass the screen?" (single judgment from present
// state), and honest about probability (calibration). It is NOT good at
// arithmetic, so anything countable (years, number of requirements met) we
// resolve in code where possible and let Jev judge the fuzzy parts.
//
// One /alpha/decisions call, several typed questions answered in parallel.

import { CONFIG } from "./config.js";
import { getToken } from "./auth.js";

// ponytail: hard cap keeps each call cheap; raise if long resumes get cut short.
export const MAX_CHARS = 12000;
export const clip = (s) => (s || "").slice(0, MAX_CHARS);

// Pull the JD's must-have lines so Jev can judge each one. Code does the
// splitting (cheap, deterministic); Jev only judges met / not met.
// ponytail: heading/bullet heuristic; swap for a Jev extraction pass if it misses too often.
const REQ_HEAD = /\b(requirements|qualifications|must[- ]haves?|what you(?:'|’)ll need|what we(?:'|’)re looking for|you have)\b[^\n:]{0,20}(:|\n)/i;
const REQ_END = /\b(nice[- ]to[- ]haves?|preferred qualifications|bonus points|benefits|perks|about (?:us|the company)|what we offer)\b/i;
const BULLET = /^\s*(?:[-•*▪·]|\d+[.)])\s+/;

export function extractRequirements(jd, max = 8) {
  const text = jd || "";
  const head = text.match(REQ_HEAD);
  let section;
  if (head) {
    const rest = text.slice(head.index + head[0].length);
    const end = rest.search(REQ_END);
    section = end === -1 ? rest : rest.slice(0, end);
  } else {
    section = text.split("\n").filter((l) => BULLET.test(l)).join("\n");
  }
  const lines = section.split("\n").filter((l) => l.trim());
  // One long line → split on commas/semicolons outside parentheses, or sentence ends.
  const parts = lines.length > 1 ? lines : section.split(/[;,](?![^(]*\))|\.\s/);
  const seen = new Set();
  return parts
    .map((p) => p.replace(BULLET, "").trim().replace(/[.;,]$/, ""))
    .filter((p) => p && p.length <= 140 && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
    .slice(0, max);
}

// Result shape returned to the UI.
// { passProbability, overlap, overlapLegend, gap, gapLegend, seniority,
//   seniorityConfidence, hasCoreSkills, locationOk, hardBlocker,
//   requirements: [{name, met}], usage }
export async function scoreFit(profile, jobDescription, { signal } = {}) {
  const token = getToken();
  if (!token) {
    const err = new Error("not_connected");
    err.code = "not_connected";
    throw err;
  }

  const requirements = extractRequirements(jobDescription);
  const state = {
    candidate: {
      resume: clip(profile.resume),
      title: profile.title || "",
      years_experience: profile.years ?? null,
      key_skills: profile.skills || "",
      location: profile.location || "",
      work_pref: profile.workPref || "",
    },
    job_description: clip(jobDescription),
    instructions_to_reader:
      "You are assessing whether THIS candidate should apply to THIS job. " +
      "Judge honestly from the resume and the job description. Be calibrated: " +
      "a high pass probability should mean the candidate really would clear the " +
      "initial screen for a role like this.",
  };

  const questions = {
    pass_screen: {
      type: "noul",
      instructions:
        "Would this candidate realistically pass the initial recruiter/ATS screen for this job?",
    },
    technical_overlap: {
      type: "score",
      instructions:
        "How well do the candidate's skills and background overlap with what this job requires?",
      criteria: ["almost none", "some", "moderate", "strong", "excellent"],
    },
    experience_gap: {
      type: "score",
      instructions:
        "How do the candidate's YEARS of professional experience compare to the years this job requires? Judge years and seniority level only — not domain or skills match.",
      criteria: [
        "far below required years",
        "somewhat below",
        "meets required years",
        "somewhat above",
        "well above",
      ],
    },
    seniority_match: {
      type: "choice",
      instructions: "How does the candidate's seniority fit this role?",
      criteria: {
        underqualified: "the candidate is below the level this role needs",
        good_fit: "the candidate is at about the right level",
        overqualified: "the candidate is above the level this role needs",
      },
    },
    has_core_skills: {
      type: "noul",
      instructions:
        "Does the candidate clearly have the core must-have technical skills named in the job description?",
    },
    location_ok: {
      type: "noul",
      instructions:
        "Are the location and work arrangement (remote/onsite/hybrid) compatible between candidate and job? If the job doesn't specify, treat as compatible.",
    },
    hard_blocker: {
      type: "noul",
      instructions:
        "Ignoring skills and seniority fit: does the job state a mandatory credential the candidate lacks — an active security clearance, a specific professional license or certification, a required degree, or legal work authorization/citizenship? Only answer yes for such a formal disqualifier, NOT for a weak skills match or a location preference.",
    },
  };
  requirements.forEach((r, i) => {
    questions[`req_${i}`] = {
      type: "noul",
      instructions: `Does the candidate's resume show they meet this job requirement: "${r}"?`,
    };
  });

  const res = await post(token, { model: CONFIG.MODEL, state, questions }, signal);

  if (!res.ok) {
    const err = new Error("http_" + res.status);
    err.code = res.status;
    try {
      err.body = await res.json();
    } catch {
      /* ignore */
    }
    throw err;
  }

  const data = await res.json();
  const a = data.answers || {};

  const scoreOf = (q) => (typeof a[q]?.score === "number" ? a[q].score : null);
  const noulOf = (q) => (typeof a[q]?.noul === "number" ? a[q].noul : null);

  return {
    passProbability: noulOf("pass_screen"),
    overlap: scoreOf("technical_overlap"),
    overlapLegend: a.technical_overlap?.legend || null,
    gap: scoreOf("experience_gap"),
    gapLegend: a.experience_gap?.legend || null,
    seniority: a.seniority_match?.choice || null,
    seniorityConfidence: a.seniority_match?.confidence ?? null,
    hasCoreSkills: noulOf("has_core_skills"),
    locationOk: noulOf("location_ok"),
    hardBlocker: noulOf("hard_blocker"),
    requirements: requirements.map((name, i) => ({ name, met: noulOf(`req_${i}`) })),
    usage: data.usage || null,
  };
}

// POST with one automatic retry on 429, honoring Retry-After (capped at 10s).
async function post(token, body, signal, retried = false) {
  const res = await fetch(`${CONFIG.API_BASE}/alpha/decisions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 429 && !retried) {
    const wait = Math.min(Number(res.headers.get("Retry-After")) || 2, 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
    signal?.throwIfAborted();
    return post(token, body, signal, true);
  }
  return res;
}

// Turn the raw scorecard into an overall recommendation + honest reasons.
// The verdict rule is OWNED BY CODE (thresholds), not the model.
export function recommendation(s) {
  const reasons = [];
  let verdict = "maybe";

  if (typeof s.hardBlocker === "number" && s.hardBlocker >= 0.7) {
    reasons.push("the job requires something you don't seem to have (like a license, degree, security clearance or work permit)");
    return { verdict: "skip", reasons };
  }
  if (typeof s.passProbability === "number") {
    if (s.passProbability >= 0.6) verdict = "apply";
    else if (s.passProbability >= 0.35) verdict = "stretch";
    else verdict = "skip";
  }
  if (typeof s.hasCoreSkills === "number" && s.hasCoreSkills < 0.4) {
    reasons.push("your resume is missing some of the main skills they want");
  }
  const reqs = (s.requirements || []).filter((r) => typeof r.met === "number");
  const unmet = reqs.filter((r) => r.met < 0.4).length;
  if (unmet) reasons.push(`${unmet} of ${reqs.length} things they ask for aren't shown on your resume`);
  if (typeof s.gap === "number" && s.gap <= 1) {
    reasons.push("they want more years of experience than you have");
  }
  if (typeof s.locationOk === "number" && s.locationOk < 0.4) {
    reasons.push("the location or remote/office setup may not work for you");
  }
  if (s.seniority === "overqualified") reasons.push("you may be more senior than this role needs");
  return { verdict, reasons };
}
