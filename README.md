# ShouldIApply ◔

**Get your real odds on a job before you waste the effort.**

Every other tool counts keywords. ShouldIApply asks **Jev** — TypeSafe's
decision model, trained to be *honest about probability* — for your
**calibrated chance of passing the initial screen**, plus where you overlap,
where you fall short, whether you're over/under-qualified, and whether there's a
hard blocker. Then it tracks what you applied to.

- **Free.** No signup. Paid from **your own** Pollen (Bring Your Own Pollen).
- **100% private.** Your resume and application history live in your browser
  (`localStorage`), never uploaded to us.
- **Honest, not hype.** A calibrated probability from a decision model — not a
  keyword-overlap score, not a chatbot's guess.

Powered by [Pollinations](https://gen.pollinations.ai)' typed-decision endpoint
(`jev`, via `POST /alpha/decisions`). Curious what a decision model is? See
[awesome-jev-family](https://github.com/notsointresting/awesome-jev-family).

## How it works

1. **Profile** (once) — paste your resume + a few fields. Saved locally.
2. **Score a job** — paste a job description → Connect Pollen → one Jev call
   returns, in parallel:
   - **pass_screen** (`noul`) — your calibrated odds of clearing the screen ← headline
   - **technical_overlap** / **experience_gap** (`score`) — how you match up
   - **seniority_match** (`choice`) — under / good fit / over-qualified
   - **has_core_skills**, **location_ok**, **hard_blocker** (`noul`) — gates
   - **req_N** (`noul`) — one per must-have line code pulls from the JD → a ✓/✗
     requirement-by-requirement breakdown
3. **Verdict** — the app (not the model) turns those into Apply / Stretch / Skip
   with honest reasons.
4. **Track** — one click logs `{title, company, link, date, status, odds}` to a
   local dashboard: search/filter/sort, notes, status dates, undo, duplicate
   detection, JSON import + JSON/CSV export.
5. **Improve my chances** — one call to a text model (`/v1/chat/completions`)
   rewrites your resume lines, LinkedIn headline and About section toward this
   job's gaps. It only rewords what your resume already shows: numbers not in your
   resume are flagged, and gaps wording can't fix are listed with honest next steps.
   Prompt adapted from the Profile Optimizer in
   [sergebulaev/linkedin-skills](https://github.com/sergebulaev/linkedin-skills) (MIT).
6. **Calibration** — the tracker compares Jev's odds with what actually happened
   (interview rate per odds bucket), so you can see whether the odds hold up for you.

Also: resume import from PDF/.txt (pdf.js, loaded on demand), recent scores ranked
side by side, save-as-image result card, light/dark theme, works offline once loaded.

Counting (years, thresholds, verdict rules) is done in code; Jev does the
judgment. Same discipline as a good decision-model app should have.

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000/
```

Uses a Pollinations **App Key** (public `pk_`) in `config.js`. Add both redirect
URIs to that key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys):

- `https://notsointresting.github.io/shouldiapply/`
- `http://localhost:8000/`

## Why it's different

Existing resume/JD tools (there are many) score **keyword overlap** (TF-IDF) or
ask a **generic LLM**. ShouldIApply is the only one that returns a **calibrated
pass-probability**, because Jev is built for exactly that. Keyword tools tell you
what words match; ShouldIApply tells you your honest odds.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Tabs: Score a job · Profile · Tracker. |
| `styles.css` | Styling; the odds number + metric bars are the hook. |
| `config.js` | App Key + endpoints. |
| `auth.js` | BYOP OAuth 2.1 + PKCE. |
| `jev.js` | The scorecard: one `/alpha/decisions` call + code-owned verdict rules. |
| `improve.js` | "Improve my chances": adapted rewrite prompt + invented-number guard. |
| `tracker.js` | Local application tracker (localStorage, dup detection, export). |
| `app.js` | Controller. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installable + offline. |
| `test.mjs` | `npm test` — checks verdict rules, requirement extraction, tracker. |

## Honest limits

- Jev's odds are **estimates from your resume and the JD** — a guide, not a
  guarantee. It can't see the other applicants or the recruiter's mood.
- PDF import extracts text only — scanned (image) PDFs need pasting. A
  "grab-the-JD-from-the-page" browser extension is a possible v2 addition.
- Auto-applying to jobs is deliberately **not** included — mass auto-apply hurts
  candidates and platforms flag it. ShouldIApply helps you *decide*, not spray.

## Credits

Feature patterns adapted (MIT) from
[hugounoclaw/ats-checker](https://github.com/hugounoclaw/ats-checker)
(client-side paste-and-score UX) and
[ParasKoundal/JobTracker](https://github.com/ParasKoundal/JobTracker)
(local one-click tracker, dup detection, export). Built on
[Pollinations](https://pollinations.ai); BYOP per their
[Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
guide.

## Like it?

⭐ [Star it on GitHub](https://github.com/notsointresting/shouldiapply) — it helps other job seekers find it.

## License

MIT
