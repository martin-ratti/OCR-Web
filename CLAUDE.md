# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a **pnpm workspace** monorepo (`backend/` + `frontend/`). Never use npm/yarn — it breaks the workspace lockfile.

From repo root:
- `pnpm install` — install all workspace deps
- `pnpm dev` — run backend + frontend concurrently via `concurrently`

Backend (`pnpm --filter backend <cmd>` or run inside `backend/`):
- `pnpm dev` — `ts-node-dev src/index.ts`, listens on `PORT` or `3001`
- `pnpm build` — `tsc` → `dist/`; production start is `node dist/index.js`
- No test runner wired up (script is a placeholder).

Frontend (`pnpm --filter frontend <cmd>` or run inside `frontend/`):
- `pnpm dev` — Vite dev server
- `pnpm build` — `tsc -b && vite build`
- `pnpm lint` — ESLint (`eslint .`)
- `pnpm preview` — preview prod build

Backend env lives in `backend/.env`:
- `GEMINI_API_KEY` — required; validated by Zod at boot, server exits if missing.
- `ALLOWED_ORIGINS` — comma-separated CORS whitelist; defaults to `http://localhost:5173,http://localhost:4173`. Use `*` only in dev.
- `NODE_ENV` — `development` | `production` | `test` (default `development`).
- `PORT` — default `3001`.

Frontend reads `VITE_API_URL` (base URL only — do **not** include `/api`; trailing slashes are stripped by `shared/api.ts`). Defaults to `http://localhost:3001`.

## Architecture ("EstacionAR")

Clean Architecture, modular by feature. The single feature today is `ocr`.

### Backend flow (`backend/src/`)

`index.ts` wires Express 5: `helmet()` → CORS (origin-callback against `env.ALLOWED_ORIGINS`) → `express.json({ limit: '100kb' })` → `globalLimiter` → routes → `errorHandler` (last). `trust proxy` is set to 1 for Render/Vercel.

Per-feature layering under `features/<feature>/`:

`router` (per-route middlewares: `ocrLimiter` + `uploadImage.single`) → `controller` (HTTP shape; throws `HttpError`/delegates to `next(err)`) → `service` (orchestrates `OcrAdapter`) → `adapter` (`GeminiOcrAdapter`, the only thing that touches the SDK — swap this for tests) → `schema` (Zod contracts).

Shared config in `backend/src/config/`:
- `env.ts` — Zod-validated env. Fails fast at boot if `GEMINI_API_KEY` missing.
- `prompt.ts` — `HIGHLIGHT_EXTRACTION_PROMPT` + `NO_HIGHLIGHT_SENTINEL`. Tune prompt here, never the model.
- `logger.ts` — timestamped console wrapper; `info` gated by `NODE_ENV`.

Middlewares in `backend/src/middlewares/`:
- `upload.ts` — `uploadImage` multer instance: memory storage, 5 MB, 1 file max, `fileFilter` whitelists `jpeg|png|webp|gif|heic|heif`.
- `rateLimit.ts` — two limiters. `ocrLimiter` (12 req/min per IP, aligned to Gemini's 15 RPM) on `/api/ocr/*`; `globalLimiter` (300 req / 15 min per IP) app-wide.
- `errorHandler.ts` — terminal middleware. Maps `MulterError` (413 on `LIMIT_FILE_SIZE`, else 400), `HttpError`, Gemini rate-limit detection (429), and unknown → 500. Always returns `ExtractResponse`-shaped JSON.

### Frontend flow (`frontend/src/`)

Feature-Sliced-Design-lite. Layers:
- `features/ocr/components/` — presentation (Shadcn/Radix + Tailwind). `OcrDropzone` and `OcrWorkspace` are the two top-level states.
- `store/useOcrStore.ts` — Zustand store; owns queue, per-file status, global progress, abort controller, and the upload loop (`processAll` / `processOne` / `cancel`).
- `shared/` — cross-cutting: `schema.ts` (Zod `ExtractResponseSchema`, mirrored with backend), `api.ts` (`getApiBase` trailing-slash normalizer, `isRateLimitMessage`).
- `lib/imageDownscale.ts` — canvas-based resize to 1600px max dimension at JPEG q=0.85 before upload; skips small files.
- `components/ErrorBoundary.tsx` — wraps the whole app in `main.tsx`.
- `components/ui/` — Shadcn primitives (style `new-york`, base `zinc`, alias `@/*` → `src/*`, see `components.json` + `vite.config.ts`). `dialog.tsx` is the Radix-backed Dialog; `KawaiiModal` is a themed wrapper around it (ESC / focus trap / scroll lock handled by Radix).

Response parsing uses `ExtractResponseSchema.safeParse` — don't bypass Zod and don't duplicate the interface.

### Orchestrator / rate-limit strategy (critical)

Gemini 2.5 Flash-Lite free-tier ceilings (per project, not per key):
- **15 RPM** / **250k TPM** / **1000 RPD** (resets midnight Pacific).

Backpressure is layered:
- **Client** (`useOcrStore.processAll`): 5 s pause between files, `AbortController` shared across the run, 5 retry attempts per file. Backoff is 15·n s on `RateLimit` (429/503/quota-regex matches) and 3·n s on generic errors.
- **Server** (`middlewares/rateLimit.ts`): `ocrLimiter` caps 12 req/min per IP on `/api/ocr/*` — deliberately below Gemini's 15 RPM so abusive clients trip the server before the Gemini quota does.

Status machine per file: `idle → processing → success | error`. Retries between attempts surface via `infoMessage`; terminal failures surface via `errorMessage`. They are distinct fields — `resultText` is never overwritten by an error string.

When changing concurrency or intervals, keep these ceilings in mind — serial processing is a design constraint, not a code smell to "optimize".

## Gemini model policy (non-negotiable)

**Do not upgrade the Gemini model.** The codebase pins `gemini-2.5-flash-lite` (`backend/src/features/ocr/ocr.service.ts`). `.cursorrules` mandates staying on `gemini-2.5-flash` or the lightest current variant — never `pro` or any "smart" tier. The app processes 60+ images/batch on free-tier accounts; bumping the model breaks the RPM orchestrator.

Tune the **prompt** for accuracy, never the SDK model.

The current prompt is a chromatic-filter instruction: extract only text that is highlighted with marker/fluorescent pen, ignore everything else, fallback string `"No se detectó texto resaltado en esta imagen."` when nothing is highlighted. Preserve this contract when editing.

## Deployment

- **Backend** → Render.com web service. Root `backend`, build `pnpm install && pnpm build`, start `node dist/index.js`. Env: `GEMINI_API_KEY`, `NODE_ENV=production`, `ALLOWED_ORIGINS=https://<your-vercel-url>`. Free tier sleeps after ~15 min idle.
- **Frontend** → Vercel. Root `frontend`, Vite preset. Env: `VITE_API_URL` = Render URL, no trailing `/api`.
- **CORS whitelist gotcha:** after deploying the frontend, update `ALLOWED_ORIGINS` on the backend with the Vercel URL or every request will be blocked.

See `DEPLOY.md` for details.

## Working conventions from `.cursorrules`

Two rules are enforced by the project owner and should be honored in substantive changes:

1. **Plan before big code.** Before generating a new feature or a large refactor, emit a numbered plan (files to create/modify, component choices) and ask `"¿Procedo con la implementación de este plan?"` before writing code.
2. **Post-delivery checklist.** After delivering a solution, append:
   > - [ ] Arquitectura (Clean Architecture / Modular)
   > - [ ] Tipado Estricto (TypeScript + Zod)
   > - [ ] Manejo de Errores y Límites (Rate limiting/Multer)
   > - [ ] Ecosistema (pnpm, Shadcn/ui aplicado)

New UI components should default to Shadcn/ui (`pnpm dlx shadcn@latest add <name>` from `frontend/`). Types must be E2E via Zod: define schemas in the backend feature's `*.schema.ts` and infer on both sides rather than duplicating interfaces.
