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

// Result shape returned to the UI.
// { passProbability, overlap, overlapLegend, gap, gapLegend, seniority,
//   requirements: [{name, met}], redFlag, usage }
export async function scoreFit(profile, jobDescription) {
  const token = getToken();
  if (!token) {
    const err = new Error("not_connected");
    err.code = "not_connected";
    throw err;
  }

  const state = {
    candidate: {
      resume: profile.resume || "",
      title: profile.title || "",
      years_experience: profile.years ?? null,
      key_skills: profile.skills || "",
      location: profile.location || "",
      work_pref: profile.workPref || "",
    },
    job_description: jobDescription,
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

  const res = await fetch(`${CONFIG.API_BASE}/alpha/decisions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: CONFIG.MODEL, state, questions }),
  });

  if (!res.ok) {
    const err = new Error("http_" + res.status);
    err.code = res.status;
    if (res.status === 429) err.retryAfter = Number(res.headers.get("Retry-After")) || 2;
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
    usage: data.usage || null,
  };
}

// Turn the raw scorecard into an overall recommendation + honest reasons.
// The verdict rule is OWNED BY CODE (thresholds), not the model.
export function recommendation(s) {
  const reasons = [];
  let verdict = "maybe";

  if (typeof s.hardBlocker === "number" && s.hardBlocker >= 0.7) {
    reasons.push("a hard requirement you likely don't meet");
    return { verdict: "skip", reasons };
  }
  if (typeof s.passProbability === "number") {
    if (s.passProbability >= 0.6) verdict = "apply";
    else if (s.passProbability >= 0.35) verdict = "stretch";
    else verdict = "skip";
  }
  if (typeof s.hasCoreSkills === "number" && s.hasCoreSkills < 0.4) {
    reasons.push("missing several core skills the job asks for");
  }
  if (typeof s.gap === "number" && s.gap <= 1) {
    reasons.push("your experience is below what they want");
  }
  if (typeof s.locationOk === "number" && s.locationOk < 0.4) {
    reasons.push("location/work-arrangement mismatch");
  }
  if (s.seniority === "overqualified") reasons.push("you may be overqualified");
  return { verdict, reasons };
}
