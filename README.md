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
3. **Verdict** — the app (not the model) turns those into Apply / Stretch / Skip
   with honest reasons.
4. **Track** — one click logs `{title, company, link, date, status, odds}` to a
   local dashboard with duplicate-link detection and JSON/CSV export.

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
| `tracker.js` | Local application tracker (localStorage, dup detection, export). |
| `app.js` | Controller. |

## Honest limits

- Jev's odds are **estimates from your resume and the JD** — a guide, not a
  guarantee. It can't see the other applicants or the recruiter's mood.
- Resume input is **paste-text** in v1 (most robust). PDF import and
  "grab-the-JD-from-the-page" (browser extension) are possible v2 additions.
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

## License

MIT
