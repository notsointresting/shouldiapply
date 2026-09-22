# ShouldIApply — Sample Data for Testing

Paste the resume into the **Profile** tab, save it, then paste each job
description into the **Score a job** tab to see the different verdicts
(Apply / Stretch / Skip).

---

## 1) SAMPLE RESUME  → paste into Profile → Resume

```
Priya Sharma
Backend Software Engineer — Berlin, Germany (open to remote in EU)
priya.sharma@example.com · github.com/priyasharma

SUMMARY
Backend engineer with 4 years building and operating Python services at scale.
Strong in API design, relational databases, and cloud infrastructure. Comfortable
owning a service end-to-end: design, ship, monitor, on-call.

EXPERIENCE
Senior Backend Engineer — FinFlow (fintech), Berlin — 2023–present
- Designed and built payment-reconciliation microservices in Python (FastAPI)
  handling ~2M transactions/day; cut reconciliation errors 38%.
- Owned Postgres schema + query optimization; reduced p95 latency 450ms → 120ms.
- Ran services on AWS (ECS, RDS, S3, CloudWatch); set up CI/CD with GitHub Actions.
- Rotated on-call; wrote runbooks; led two incident post-mortems.

Backend Engineer — ShopStack (e-commerce), remote — 2021–2023
- Built REST APIs for the checkout and inventory services (Python, Flask).
- Introduced Redis caching layer; cut database load ~30%.
- Wrote integration tests, raised coverage from 41% to 78%.

SKILLS
Python, FastAPI, Flask, PostgreSQL, Redis, Docker, AWS (ECS/RDS/S3), REST APIs,
CI/CD (GitHub Actions), pytest, Git, Linux. Basic Kubernetes.

EDUCATION
B.Sc. Computer Science — Technical University, 2021
```

**Profile fields to fill:**
- Current title: `Backend Software Engineer`
- Years of experience: `4`
- Top skills: `Python, FastAPI, PostgreSQL, AWS, Redis, Docker`
- Location: `Berlin / EU remote`
- Work preference: `remote or hybrid in EU`

---

## 2) STRONG FIT  → expect **Apply** (high odds)

```
Backend Engineer (Python) — Remote (EU)
PayGrid · Full-time

We're hiring a backend engineer to build payment and reconciliation services.

What you'll do
- Design and build Python services (FastAPI or similar) for high-volume payments
- Own PostgreSQL schema design and query performance
- Deploy and operate services on AWS; participate in on-call

Requirements
- 3+ years backend experience in Python
- Strong with relational databases (PostgreSQL preferred)
- Experience with AWS and CI/CD
- Comfortable owning a service end-to-end

Nice to have: Redis, Docker, fintech/payments background.
Location: Remote within the EU.
```

---

## 3) STRETCH  → expect **Stretch** (borderline odds)

```
Staff Backend Engineer — Distributed Systems
Nimbus Cloud · Hybrid (Amsterdam)

Lead the architecture of our multi-region data platform.

Requirements
- 8+ years backend engineering, 3+ at Staff/Principal level
- Deep expertise in distributed systems, consensus, and event streaming (Kafka)
- Proven track record leading cross-team technical initiatives
- Expert-level Kubernetes and infrastructure-as-code (Terraform)
- Experience mentoring senior engineers

Nice to have: Go or Rust, open-source contributions to infra projects.
```

*(Why stretch: right domain, but asks for 8+ years/Staff level, deep distributed
systems, expert Kubernetes/Terraform, Kafka — beyond a 4-year backend profile.)*

---

## 4) SKIP — wrong domain  → expect **Skip** (low odds)

```
Senior Frontend Engineer (React) — On-site, London
Pixel & Co · Full-time

Build beautiful, performant web interfaces for our design tooling.

Requirements
- 5+ years frontend engineering
- Expert in React, TypeScript, and modern CSS
- Strong eye for design, accessibility, and animation
- Experience with Figma-to-code workflows and design systems
- Must be able to work on-site in London 5 days/week

Nice to have: WebGL, Canvas, motion design.
```

*(Why skip: frontend/React role, on-site London — mismatches a Python backend
engineer who wants EU remote. Also a likely location/arrangement flag.)*

---

## 5) SKIP — hard blocker  → expect **Skip** (hard blocker flag)

```
Backend Engineer — Defense Systems
AegisTech · On-site, Munich

Build secure backend services for defense clients.

Requirements
- 3+ years Python backend experience
- PostgreSQL and AWS experience
- MUST hold an active government security clearance
- MUST be an EU citizen eligible for classified work
- On-site in Munich, no remote

We cannot consider candidates without an existing clearance.
```

*(Why skip despite good technical overlap: the security-clearance / classified-work
requirement is a hard blocker the model should flag.)*

---

### Tip
Score all five with the same profile. A well-behaved run should show the odds and
verdict clearly separating: #2 highest, #3 middle, #4 and #5 low — with #5 also
tripping the "hard blocker" flag. If they don't separate sensibly, tell me and
I'll tune the questions/thresholds in `jev.js`.
