# SafePermit AI — MVP Brief (Ground Truth)

> Generated from the actual code in this repo. Every non-obvious claim cites a file path. Each major claim is tagged `[confident]` or `[uncertain — verify]`. Where a fact is absent from the code, it says **"not found"** rather than guessing.
>
> **Branch documented:** `backend-claude-security`. No README product copy exists (the README is the default Vite template), so positioning is inferred from in-app UI strings and prompts.

---

## 1. ONE-LINER & POSITIONING

**What it is:** An AI web app that turns a plain-language description of a construction-site situation into a formal, print-ready HSE/SƏTƏM document **draft** in Azerbaijani. `[confident]`

- App name & tagline (from login screen): **"SafePermit AI — Tikinti SƏTƏM Sənəd Layihələri"** ("Construction HSE Document Drafts") — `src/components/Auth.jsx:42-43`
- Browser title: **"SafePermit AI — SƏTƏM Sənəd Generatoru"** ("HSE Document Generator") — `index.html:7`
- Dashboard subtitle (closest thing to a value prop): *"Tikinti üzrə yoxlanılmalı SƏTƏM sənəd layihələri hazırlayın və ya keçmiş layihələrə baxın"* = "Prepare construction HSE document drafts that need review, or view past drafts." — `src/components/Dashboard.jsx:31-33`

**Who it's for:** Azerbaijani **construction companies** and their SƏTƏM (HSE) officers / site managers. The system prompts repeatedly self-describe as *"construction-first document drafts for Azerbaijani construction companies."* — `supabase/functions/_shared/systemPrompts.ts:24` (and each prompt). `[confident]`

**Core positioning (explicit and enforced in code):** Output is always an **AI-prepared initial draft**, never a final/approved document. Every generated document and PDF carries a fixed disclaimer: *"Bu sənəd AI tərəfindən hazırlanmış ilkin sənəd layihəsidir. Rəsmi istifadə üçün məsul SƏTƏM mütəxəssisi tərəfindən yoxlanılmalı, düzəliş edilməli və imzalanmalıdır."* — `src/components/DocumentPreview.jsx:10`, `src/lib/pdfUtils.js:18`. `[confident]`

**Exact elevator/MVP statement in code:** **not found** (no marketing one-liner exists; the above are UI labels).

---

## 2. TECH STACK

Source: `package.json`, `vite.config.js`, edge functions.

| Layer | Choice | Evidence |
|---|---|---|
| Framework | **React 19** (`react`/`react-dom` ^19.2.6) | `package.json:19-20` |
| Build tool | **Vite 8** + `@vitejs/plugin-react` | `package.json:32`, `vite.config.js` |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` plugin | `package.json:14,21`, `vite.config.js:3` |
| Icons | `lucide-react` | `package.json:16` |
| Fonts | Inter (Google Fonts, UI) + **Noto Sans** bundled for PDF Azerbaijani glyphs | `index.html:10`, `package.json:18`, `pdfUtils.js:8-9` |
| Backend / DB / Auth | **Supabase** (`@supabase/supabase-js` ^2.106.0) — Postgres, Auth, Edge Functions | `package.json:13`, `src/lib/supabase.js` |
| AI provider | **Anthropic Claude** — called via raw `fetch` to `https://api.anthropic.com/v1/messages` from Supabase Edge Functions | `supabase/functions/generate-document/index.ts:3` |
| **AI model string** | **`claude-sonnet-4-6`** (both edge functions) | `generate-document/index.ts:4`, `generate-risk-assessment/index.ts:2` |
| Anthropic API version | `2023-06-01` header | `generate-document/index.ts:119` |
| PDF library | **jsPDF** ^4.2.1 + **html2canvas** ^1.4.1 (image fallback) | `package.json:15,17`, `pdfUtils.js:1-2` |
| Lint | ESLint 10 | `package.json:24-31` |
| Hosting / deploy target | **not found** — no `vercel.json`, `netlify.toml`, or `supabase/config.toml`; a stale `dist/` build exists but no deploy config | repo root listing |

**Environment variable NAMES** (from `.env.example` — values never shown):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` — explicitly **not** a `VITE_*` var; set as a Supabase Edge Function secret. `.env.example` carries a comment: *"Anthropic keys must never be exposed through VITE_* frontend variables."* — `.env.example` `[confident]`

> Security note: the Anthropic key lives server-side in the edge function only (`Deno.env.get('ANTHROPIC_API_KEY')` — `generate-document/index.ts:67`). The frontend never sees it.

---

## 3. ARCHITECTURE & ROUTES

**Folder structure (top 2 levels, source only):**
```
SafePermitAI/
├── index.html, vite.config.js, eslint.config.js
├── package.json
├── .env.example
├── supabase-setup.sql            # documents table (run manually in SQL editor)
├── src/
│   ├── App.jsx                   # session gate
│   ├── main.jsx, index.css
│   ├── components/               # Auth, Dashboard, Sidebar, DocumentGenerator,
│   │                             #   RiskAssessmentForm, PhotoUpload,
│   │                             #   DocumentPreview, DocumentHistory
│   ├── lib/                      # claude.js, systemPrompts.js, supabase.js, pdfUtils.js
│   └── assets/                   # hero.png, svgs
└── supabase/
    ├── migrations/20240101000000_risk_assessments.sql
    └── functions/
        ├── generate-document/index.ts
        ├── generate-risk-assessment/index.ts
        └── _shared/systemPrompts.ts
```

**Routing:** No router library. The app is a **single-page state machine**, not URL routes. `[confident]`
- `App.jsx`: if no Supabase session → `<Auth />`; else → `<Dashboard />` — `src/App.jsx:31`
- `Dashboard.jsx`: a `page` state toggles between `'dashboard'` and `'history'` views via the sidebar — `src/components/Dashboard.jsx:7,37-53`
- Inside the dashboard, a `mode` state toggles **Incident Report** vs **Risk Assessment** generators — `src/components/DocumentGenerator.jsx:41,139-160`

**Key components:**
- `DocumentGenerator.jsx` — main free-text → document flow (4 doc types + demo scenarios + photos)
- `RiskAssessmentForm.jsx` — structured-form → JSON risk-assessment table flow
- `DocumentPreview.jsx` — parses plain-text AI output into a styled, sectioned document view
- `DocumentHistory.jsx` — lists past `documents` rows, expandable, re-downloadable as PDF
- `PhotoUpload.jsx` — drag/drop image picker (used by both generators)
- `pdfUtils.js` — text-based PDF (primary) with image-PDF fallback; separate landscape risk-assessment PDF

**High-level data flow** `[confident]`:
```
React UI (DocumentGenerator / RiskAssessmentForm)
   │  text + optional base64 images
   ▼
src/lib/claude.js  →  supabase.functions.invoke('generate-document' | 'generate-risk-assessment')
   ▼
Supabase Edge Function (Deno)  →  fetch → Anthropic Messages API (claude-sonnet-4-6)
   ▼
Edge function validates output (section count / JSON parse) → returns { output }
   ▼
UI renders via DocumentPreview / RiskAssessmentPreview
   │
   ├─ insert row into Supabase `documents` / `risk_assessments` (client-side, RLS-scoped)
   └─ on demand: jsPDF export (client-side) → file download
```
Note: the DB insert happens **client-side from the browser**, not inside the edge function — `DocumentGenerator.jsx:106-114`, `RiskAssessmentForm.jsx:175-186`.

---

## 4. FEATURE INVENTORY

✅ Built & works end-to-end  🟡 Partial/stubbed  🔵 Planned only

| Feature | Status | Backing file(s) / notes |
|---|---|---|
| Email/password auth (sign up, log in, log out) | ✅ | `Auth.jsx`, `Sidebar.jsx:5-7`, `App.jsx` (Supabase email/password) |
| Session gating of the whole app | ✅ | `App.jsx:10-31` |
| Free-text → HSE document generation (4 types) | ✅ | `DocumentGenerator.jsx`, `generate-document/index.ts`, `_shared/systemPrompts.ts` |
| Document type: Incident Report (`incident_report`) | ✅ | 8-section prompt — `systemPrompts.ts:24-102` |
| Document type: Near-Miss (`near_miss`) | ✅ | 8-section prompt — `systemPrompts.ts:105-173` |
| Document type: Toolbox Talk (`toolbox_talk`) | ✅ | 8-section prompt — `systemPrompts.ts:176-282` |
| Document type: Permit to Work (`permit_to_work`) | ✅ | 10-section prompt — `systemPrompts.ts:285-399` |
| Risk Assessment (structured form → JSON hazard table) | ✅ | `RiskAssessmentForm.jsx`, `generate-risk-assessment/index.ts` |
| One-click demo scenarios (4 prefilled examples) | ✅ | `DocumentGenerator.jsx:17-38` |
| Photo upload as model input (vision) | ✅ | `PhotoUpload.jsx`; base64 sent to model — `DocumentGenerator.jsx:96-101` (max 5), `RiskAssessmentForm.jsx` (max 3). Photo-reading instruction lives only in the edge-function prompt — `systemPrompts.ts:18` |
| Styled on-screen document preview (section parser) | ✅ | `DocumentPreview.jsx` |
| Unicode-safe text PDF export (Azerbaijani glyphs) | ✅ | `pdfUtils.js:228-455` (Noto Sans embedded) |
| Image-PDF fallback if text PDF fails | ✅ | `pdfUtils.js:154-226,714-721` |
| Landscape Risk-Assessment PDF (color-coded table) | ✅ | `pdfUtils.js:465-712` |
| Document history list + re-download | ✅ | `DocumentHistory.jsx` (reads `documents` table) |
| Persist generated docs to DB | ✅ | `DocumentGenerator.jsx:106-114` → `documents`; `RiskAssessmentForm.jsx:175-186` → `risk_assessments` |
| Server-side output validation (section count) | ✅ | `generate-document/index.ts:161-173` rejects truncated drafts |
| Server-side JSON extraction/validation (risk assessment) | ✅ | `generate-risk-assessment/index.ts:29-33,124-131` |
| Per-doc-type token budgets | ✅ | `generate-document/index.ts:12-17` |
| Azerbaijani error messages throughout | ✅ | both edge functions, `claude.js` |
| **Risk Assessment in history view** | 🟡 | History tab reads **only** the `documents` table; risk assessments are saved to `risk_assessments` but are **never listed back** in the UI — `DocumentHistory.jsx:102-104` |
| `src/lib/systemPrompts.js` (frontend prompt copy) | 🟡 | **Dead/stale duplicate** — not imported anywhere; lacks the photo-reading instruction the live edge-function prompt has. Verified no `src/**` import. The authoritative prompts are in `supabase/functions/_shared/systemPrompts.ts` |
| Document editing after generation | 🔵 | not found — output is read-only; user must regenerate |
| Delete document / history management | 🔵 | not found (no delete UI; RLS policy on `documents` only grants select+insert) |
| Supabase Storage for uploaded photos | 🔵 | not found — photos are sent inline as base64 and never persisted |
| Multi-language / English output | 🔵 | not found — Azerbaijani only, hardcoded |
| Team/org accounts, roles, sharing | 🔵 | not found |
| Payments / subscriptions | 🔵 | not found |

---

## 5. CORE DOCUMENT-GENERATION FLOW

### Flow A — Incident/Near-Miss/Toolbox/Permit (free text)
**Inputs collected** (`DocumentGenerator.jsx`):
- Document type — dropdown of the 4 types — lines 175-191
- Free-text site description (Azerbaijani) — required, min 10 chars enforced server-side (`generate-document/index.ts:87-89`) — lines 210-221
- Up to **5** site photos (optional, drag/drop) — line 228

> There is **no separate "company profile" step.** The brief's "company-profile step" does not exist as such; the only structured intake is the Risk Assessment form (Flow B). `[confident]`

**How the AI call is made** (`generate-document/index.ts`):
- Model `claude-sonnet-4-6`; `max_tokens` per type: incident 4096, near_miss 3072, toolbox 4096, permit 8192 — lines 12-17
- `system` prompt = the per-type template from `_shared/systemPrompts.ts`
- User message = optional image blocks (base64) + text: *"Aşağıdakı tikinti sahəsi təsviri əsasında yoxlanılmalı ilkin sənəd layihəsi hazırlayın: …"* — lines 107-113
- After response: counts numbered section headers and **rejects** the draft if fewer than expected (8/8/8/10), returning a partial-draft error — lines 161-173

**System-prompt summary** (`_shared/systemPrompts.ts`): each type tells the model it is an *"expert SƏTƏM/HSE documentation officer"* producing construction-first drafts, then enforces strict formatting via shared `COMMON_RULES` (plain text only; `•` bullets; `NUMBER. CAPS TITLE` headers; DD.MM.YYYY dates; doc-number format `PREFIX-AZ-<year>-001`; **Azerbaijani only**; never invent real names — use placeholders like `[Ad Soyad daxil edilməlidir]`; must output all sections through the signatures block, never truncate). The exact section skeleton for each doc type is hardcoded in the prompt. — `systemPrompts.ts:1-15` (rules), `17-19` (construction context/hazards).

**Regulation grounding:** Hardcoded legal references inside the prompts, **not** a RAG/knowledge base. `[confident]`
- Incident report prompt: *"Reference ISO 45001 and the Azerbaijan Labour Code"* — `systemPrompts.ts:24`
- Permit prompt: JSA principles, LOTO/Kilid-Etiket, and O2/LEL/H2S/CO atmospheric limits (e.g., O2 19.5–23.5%, LEL <10%) — `systemPrompts.ts:285,360-363`
- Risk-assessment prompt: *"compliant with Azerbaijan Labour Code Chapter 33 and Technical Safety Law"* — `generate-risk-assessment/index.ts:10`
- **No vector DB, no document retrieval, no uploaded legal corpus.** Grounding = prompt text + hardcoded section templates only.

**How the result is displayed:** `DocumentPreview.jsx` parses the plain-text output by regex into numbered sections and renders bullets, key-value rows, subsection labels, and signature lines as styled HTML, with header, the draft disclaimer, and a footer — `DocumentPreview.jsx:15-112`.

**PDF export:** `generatePdfFromText` tries a **text-based jsPDF** export first (selectable Unicode text, embedded Noto Sans for Azerbaijani glyphs, A4 portrait, branded header/disclaimer/footer, page numbers) and **falls back to an image (html2canvas) PDF** on failure — `pdfUtils.js:714-721`. Files saved as `<docType>_<timestamp>.pdf`.

### Flow B — Risk Assessment (structured form)
**Inputs** (`RiskAssessmentForm.jsx:119-130`): work description (required), location, date (defaults to today), responsible person, worker count, up to **3** photos.
**AI call** (`generate-risk-assessment/index.ts`): model `claude-sonnet-4-6`, `max_tokens` 4096, system prompt demands **JSON only** with `workDetails`, `hazards[]` (≥5 hazards, each with likelihood/severity 1-5, risk score = L×S, risk level Low/Medium/High/Critical), `overallRiskLevel`, `summary` — lines 10-20. Server extracts the first `{...}` block and parses it — lines 29-33.
**Display:** `RiskAssessmentPreview` renders a color-coded hazard table + overall badge + sign-off grid — `RiskAssessmentForm.jsx:29-117`.
**PDF:** dedicated landscape A4 with a full risk-matrix table and color-coded risk levels — `pdfUtils.js:465-712`.

---

## 6. DOCUMENT TYPES

**Can produce TODAY (end-to-end):** `[confident]`
1. **Tikinti Hadisə Hesabatı** — Construction Incident Report (8 sections)
2. **Tikinti Yaxın-Qaçış Hesabatı** — Construction Near-Miss Report (8 sections)
3. **Tikinti Brifinq Qeydi** — Construction Toolbox Talk record (8 sections)
4. **Tikinti İş İcazəsi** — Construction Permit to Work (10 sections)
5. **Risk Qiymətləndirməsi** — Risk Assessment (separate JSON/table flow)

Labels: `src/lib/claude.js:3-8`; type list: `DocumentGenerator.jsx:10-15`; prompts: `_shared/systemPrompts.ts`.

**Merely intended / not built:** No other SƏTƏM document types are referenced anywhere. **not found.**

---

## 7. DATA MODEL

> Two tables defined in **separate, inconsistent places** — see the demo caveat in §9. Structure only.

**Table `public.documents`** — `supabase-setup.sql` (manual, "Run this in your Supabase SQL Editor"):
- `id uuid pk default gen_random_uuid()`
- `user_id uuid → auth.users(id) on delete cascade, not null`
- `document_type text not null`
- `input_text text not null`
- `generated_output text not null`
- `created_at timestamptz default now() not null`
- RLS: **enabled**. Policies: *"Users can read own documents"* (select, `auth.uid() = user_id`) and *"Users can insert own documents"* (insert, `with check auth.uid() = user_id`). **No update/delete policy.** — `supabase-setup.sql:12-23`

**Table `public.risk_assessments`** — `supabase/migrations/20240101000000_risk_assessments.sql`:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid → auth.users(id) on delete cascade, not null`
- `work_description text not null`
- `location text`, `date date`, `responsible_person text`, `worker_count integer`
- `generated_content jsonb`
- `created_at timestamptz default now() not null`
- RLS: **enabled**. Single policy *"Users can manage own risk assessments"* — `for all` with `using`+`with check auth.uid() = user_id`. — migration lines 13-19

**Storage buckets:** **not found** (photos are never uploaded to storage; sent inline as base64).

**Auth method/providers:** Supabase Auth, **email + password only** (`signInWithPassword`, `signUp`) — `Auth.jsx:20,23`. No OAuth/social/magic-link providers in code. Signup shows an email-confirmation message — `Auth.jsx:27`. `[confident]`

---

## 8. LOCALIZATION

**Output language: Azerbaijani (az-AZ), enforced.** `[confident]`
- Every prompt: *"Respond in Azerbaijani only."* — `_shared/systemPrompts.ts:11`
- Risk prompt explicitly Azerbaijani-context (Labour Code Ch. 33) — `generate-risk-assessment/index.ts:10`
- All UI strings, labels, error messages, and the PDF/preview chrome are in Azerbaijani — across all components and edge functions
- `index.html` sets `<html lang="az">` — `index.html:2`
- PDF dates use `toLocaleDateString('az-AZ')` and a Noto Sans font is embedded specifically because *"jsPDF built-in fonts do not reliably render Azerbaijani glyphs such as ə/ğ/ı"* — `pdfUtils.js:63-64`, with a runtime glyph self-check — `pdfUtils.js:65-68`

The UI **mode toggle** buttons are the only English labels ("Incident Report" / "Risk Assessment") — `DocumentGenerator.jsx:148,158`.

---

## 9. CURRENT STATE & DEMO

**Deployed?** **not found.** No deploy config (no `vercel.json`/`netlify.toml`/`supabase/config.toml`), no live URL anywhere in code or docs. A built `dist/` folder exists (dated Jun 10) but that only proves a local `vite build` was run, not a deployment. `[confident]`

**Live URL:** **not found.**

**Git state:** GitHub remote `https://github.com/faridguluzade53/safepermitai.git`; only 2 commits (`Initial SafePermit AI MVP`, `Add text-based PDF export`); current branch `backend-claude-security`. `[confident]`

**Exact steps to run the demo (local):** `[uncertain — verify: requires a live Supabase project + deployed edge functions, which the repo cannot provision]`
1. `npm install`
2. Create `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (copy from `.env.example`).
3. In Supabase: create the `documents` table (run `supabase-setup.sql`) **and** apply the `risk_assessments` migration.
4. Deploy both edge functions (`generate-document`, `generate-risk-assessment`) and set the secret: `supabase secrets set ANTHROPIC_API_KEY=…` (per `.env.example` comment).
5. `npm run dev` → open the Vite URL → sign up / log in → use the dashboard. Click a demo scenario chip (`DocumentGenerator.jsx:17-38`) for the fastest happy path.

**What works end-to-end today** (given a configured backend): auth → pick type/scenario or fill the risk form → optional photos → generate via Claude → styled preview → save to DB → download branded Azerbaijani PDF → revisit incident docs in history. `[confident, given backend configured]`

**Known bugs / limitations / risks (from code):**
- **AI generation cannot work without deployed Supabase Edge Functions + `ANTHROPIC_API_KEY` secret.** The frontend has no fallback path; absent config it returns Azerbaijani error messages. `[confident]`
- **Risk assessments are write-only in the UI:** saved to `risk_assessments` but the History tab queries only `documents`, so they never appear again. — `DocumentHistory.jsx:102-104` `[confident]`
- **Schema setup is fragmented/inconsistent:** `documents` lives in a root `supabase-setup.sql` (manual), `risk_assessments` in a proper migration. Easy to miss one when setting up. `[confident]`
- **`documents` table has no delete/update RLS policy** — no document management possible. `[confident]`
- **Dead prompt file:** `src/lib/systemPrompts.js` is an unused, slightly outdated duplicate of the edge-function prompts (missing the photo-analysis instruction). Risk of future confusion. `[confident]`
- **CORS is wide open** (`Access-Control-Allow-Origin: *`) on both edge functions — fine for a demo, not for production. — `generate-document/index.ts:7` `[confident]`
- **Auth confirmation/redirect:** signup expects email confirmation (`Auth.jsx:27`); no custom redirect handling in code — relies on Supabase project defaults. `[uncertain — verify]`

---

## 10. ROADMAP / TODOs

- Grep for `TODO|FIXME|HACK|XXX|roadmap|planned|coming soon` across `src/` and `supabase/`: **none found.** `[confident]`
- No roadmap/notes/planning markdown exists (the only `.md` is the default Vite README). **not found.**
- Implicit next-steps inferable from code gaps (not stated in repo): surface risk assessments in history; consolidate DB schema/migrations; add document editing & delete; persist photos to storage; tighten CORS; remove the dead `systemPrompts.js`.

---

## 11. BUSINESS DOCS

Pricing tiers, unit economics, customer research, market sizing, financial model: **not found.** No business/strategy documents of any kind in the repo. `[confident]`

---

## MVP in one breath
- **SafePermit AI** is a React 19 + Vite + Supabase web app that turns a plain Azerbaijani description (plus optional site photos) of a construction situation into a formal, signature-ready **HSE/SƏTƏM document draft**, generated by **Claude `claude-sonnet-4-6`** via Supabase Edge Functions. `[confident]`
- It produces **5 document types today** — Incident Report, Near-Miss, Toolbox Talk, Permit to Work, and a structured Risk Assessment — all in Azerbaijani, with hardcoded ISO 45001 / Azerbaijan Labour Code grounding (prompt-based, **no RAG/knowledge base**). `[confident]`
- Output renders as a styled on-screen preview and exports to a **branded, Unicode-correct PDF** (text-based jsPDF with image fallback), every doc stamped with an "AI draft — must be reviewed by a SƏTƏM officer" disclaimer. `[confident]`
- Auth (email/password), per-user persistence, and history are built on Supabase with RLS; the Anthropic key is kept **server-side only**. `[confident]`
- It is **not deployed (no live URL found)**, has **no business/pricing docs**, and a few rough edges (risk assessments never shown in history, fragmented DB setup, a dead duplicate prompt file). `[confident]`
