# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a **pnpm workspace** monorepo (`backend/` + `frontend/` + `packages/shared/`). Never use npm/yarn — it breaks the workspace lockfile. The `@ocr-web/shared` package must be built (`pnpm build:shared`) before backend/frontend can resolve its compiled output.

From repo root:
- `pnpm install` — install all workspace deps
- `pnpm build:shared` — compile `@ocr-web/shared` (`packages/shared/src/index.ts` → `dist/` via `tsc -p tsconfig.json`). Backend/frontend import the compiled output, so this must be fresh before their own dev/build runs.
- `pnpm dev` — runs `pnpm build:shared` first, then starts backend + frontend together via `concurrently`. You don't need to build shared manually before `pnpm dev`.
- `pnpm build` — chained build: shared → backend → frontend.

Backend (`pnpm --filter backend <cmd>` or run inside `backend/`):
- `pnpm dev` — `ts-node-dev src/index.ts`, listens on `PORT` or `3001`
- `pnpm build` — runs `pnpm --filter @ocr-web/shared build` first, then `tsc` → `dist/`; production start is `node dist/index.js`
- `pnpm test` / `pnpm test:watch` — Vitest + Supertest. The single test file (`backend/tests/ocr.test.ts`) exercises `/api/ocr/extract` with a stub `OcrAdapter` injected via `createApp({ ocrController })`. The factory pattern is there specifically so tests can swap the Gemini SDK out — preserve it.
- `pnpm lint` — ESLint.

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

`rules.json` at the repo root is tracked (project-level rule config — don't delete as housekeeping). `scratch/` is gitignored workspace for local experiments; treat files there as throwaway and don't rely on them.

Root `package.json` pins `pnpm.onlyBuiltDependencies: ["sharp"]` — sharp needs a native postinstall and pnpm blocks build scripts by default. If install fails with a sharp-missing error on a new machine, that list is the reason you're looking at.

## Architecture ("EstacionAR")

Clean Architecture, modular by feature. The single feature today is `ocr`.

### Backend flow (`backend/src/`)

`index.ts` is just the boot (`createApp().listen(env.PORT)`). The Express wiring lives in `app.ts` as a `createApp(opts)` factory — `opts.ocrController` lets tests inject a stub controller, `opts.enableGlobalLimiter: false` disables the IP limiter for test runs. Keep this seam; don't re-inline the wiring into `index.ts`.

Middleware order in `createApp`: `helmet()` → `requestId` → `metricsMiddleware` → CORS (origin-callback against `env.ALLOWED_ORIGINS`, strips trailing slashes before matching) → `express.json({ limit: '100kb' })` → `globalLimiter` (conditional) → `/health` + `/metrics` routes → `/api/ocr` → `errorHandler` (last). `trust proxy` is set to 1 for Render/Vercel.

Per-feature layering under `features/<feature>/`:

`router` (per-route middlewares: `ocrLimiter` + `uploadImage.single`) → `controller` (HTTP shape; parses `engine` field with `ExtractRequestSchema`, throws `HttpError`/delegates to `next(err)`) → `service` (picks adapter per `OcrEngine`, lazily constructs the chosen one; accepts override map for DI) → `adapter` (`GeminiOcrAdapter` or `TesseractOcrAdapter`) → `schema` (Zod contracts re-exported from `@ocr-web/shared`).

**Dual OCR engine.** Requests carry an `engine` form field (`'gemini'` default, or `'tesseract'`). `OcrService` lazily constructs and memoizes whichever adapter the request asks for:
- `GeminiOcrAdapter` — calls `@google/genai` with the pinned model, `temperature: 0`, `topP: 0.1`, `thinkingBudget: 1024`, 60s timeout (raced against SDK).
- `TesseractOcrAdapter` — fully local: `sharp` auto-orients, runs a tesseract.js `osd` worker to detect 90°-multiple rotation, then `highlightMask.ts` builds an HSV-band mask (yellow/green fluo + pink/salmon pastel) and rasterizes only the highlighted regions at 300 DPI. If coverage is below `MIN_HIGHLIGHT_COVERAGE` (0.2%), returns `NO_HIGHLIGHT_SENTINEL` without calling OCR. Recognition runs `spa+eng` LSTM with per-word/line confidence filters; if confidence < 55, retries with a 180° flip. Workers are cached in `node_modules/.cache/tesseract` and reused across requests (module-level promises).

**Highlight contract is shared.** Both adapters must respect `NO_HIGHLIGHT_SENTINEL` (`"No se detectó texto resaltado en esta imagen."`). The Tesseract mask exists so the local engine matches the Gemini prompt's chromatic-filter semantics — if you change the prompt to look at non-highlighted text, you must also relax `highlightMask.ts` or the two engines will diverge silently.

Shared config in `backend/src/config/`:
- `env.ts` — Zod-validated env. `GEMINI_API_KEY` is **optional** at boot; the server only throws if a request actually hits the Gemini adapter without a key. Tesseract works with no key. (The older CLAUDE.md text said "fails fast at boot" — that's no longer true since the Tesseract engine landed.)
- `prompt.ts` — `HIGHLIGHT_EXTRACTION_PROMPT` + `NO_HIGHLIGHT_SENTINEL`. Tune prompt here, never the model.
- `logger.ts` — timestamped console wrapper; `info` gated by `NODE_ENV`. `withRequestId(id)` returns a scoped logger for per-request correlation.

Middlewares in `backend/src/middlewares/`:
- `upload.ts` — `uploadImage` multer instance: memory storage, 5 MB, 1 file max, `fileFilter` whitelists `jpeg|png|webp|gif|heic|heif`.
- `rateLimit.ts` — two limiters. `ocrLimiter` (12 req/min per IP, aligned to Gemini's 15 RPM) on `/api/ocr/*`; `globalLimiter` (300 req / 15 min per IP) app-wide.
- `errorHandler.ts` — terminal middleware. Maps `MulterError` (413 on `LIMIT_FILE_SIZE`, else 400), `HttpError`, Gemini rate-limit detection (429), and unknown → 500. Always returns `ExtractResponse`-shaped JSON.
- `requestId.ts` — assigns/propagates `X-Request-Id` header; attaches `req.requestId` for logger scoping.
- `metrics.ts` — in-process counters exposed at `GET /metrics` in Prometheus text format (`renderMetrics()`). `recordOcrSuccess()` / `recordOcrError(isRateLimit)` are called by the controller.

Health: `GET /health` returns `{ status: 'ok', timestamp }`. Use it for Render uptime pings.

### Frontend flow (`frontend/src/`)

Feature-Sliced-Design-lite. Layers:
- `features/ocr/components/` — presentation (Shadcn/Radix + Tailwind). `OcrDropzone` and `OcrWorkspace` are the two top-level states.
- `store/useOcrStore.ts` — Zustand store; owns queue, per-file status, global progress, abort controller, and the upload loops (`processAll` / `processOne` / `processSelected` / `retryAllErrors` / `cancel` / `clearAll` with undo). `MAX_FILES = 200` ceiling; `INTER_FILE_DELAY_MS = 5000`; `MAX_ATTEMPTS = 5`.
- **Persistence.** Wrapped with `zustand/middleware` `persist` (`name: 'ocr-web-state'`, `version: 2`, `localStorage`). `partialize` persists only `selectedEngine`, `fontSize`, and `textCache`. `textCache` is keyed by `${file.name}::${file.size}` so re-adding an already-OCR'd file rehydrates the result without another API call — do not bypass this cache when wiring new ingestion paths. If you change `textCache` shape, bump the persist `version`.
- **Prewarm pipeline.** While file *i* is in Gemini, file *i+1* is pre-compressed in parallel (`ensureCompressed` stores the resulting `File` on the queue entry). Keep this; losing it ~doubles wall-clock on batches.
- **Undo.** `clearAll` snapshots the queue + active id and keeps it for 12s before revoking preview URLs. `restoreCleared` rehydrates if called before expiry. If you remove files programmatically, use `removeFiles(ids)` so preview URLs are revoked.
- `shared/api.ts` — cross-cutting: `getApiBase` trailing-slash normalizer, `isRateLimitMessage`, `processOcr(file, name, engine, signal)` (the only place that builds the multipart request), re-exports `OcrEngine` type from `@ocr-web/shared`.
- Zod schemas live in the `@ocr-web/shared` workspace package (`packages/shared/src/index.ts`), imported by both backend and frontend. Single source of truth — do not re-declare in either side.
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

- **Backend** → Render.com web service. **Root directory must be empty (repo root), NOT `backend/`** — pnpm workspaces need to see `pnpm-workspace.yaml` at the root to resolve `@ocr-web/shared` (declared as `workspace:*`). Build `pnpm install && pnpm --filter backend build`, start `node backend/dist/index.js`. Env: `GEMINI_API_KEY` (optional but required for the Gemini engine), `NODE_ENV=production`, `ALLOWED_ORIGINS=https://<your-vercel-url>`. Free tier sleeps after ~15 min idle.
- **Frontend** → Vercel. Root `frontend`, Vite preset (default install + build — Vercel runs `pnpm install` from repo root and resolves the workspace). Env: `VITE_API_URL` = Render URL, no trailing `/api`.
- **CORS whitelist gotcha:** after deploying the frontend, update `ALLOWED_ORIGINS` on the backend with the Vercel URL or every request will be blocked.

See `DEPLOY.md` for the authoritative deploy instructions — if this section and `DEPLOY.md` ever disagree, `DEPLOY.md` wins.

## Working conventions from `.cursorrules`

Two rules are enforced by the project owner and should be honored in substantive changes:

1. **Plan before big code.** Before generating a new feature or a large refactor, emit a numbered plan (files to create/modify, component choices) and ask `"¿Procedo con la implementación de este plan?"` before writing code.
2. **Post-delivery checklist.** After delivering a solution, append:
   > - [ ] Arquitectura (Clean Architecture / Modular)
   > - [ ] Tipado Estricto (TypeScript + Zod)
   > - [ ] Manejo de Errores y Límites (Rate limiting/Multer)
   > - [ ] Ecosistema (pnpm, Shadcn/ui aplicado)

New UI components should default to Shadcn/ui (`pnpm dlx shadcn@latest add <name>` from `frontend/`). Types must be E2E via Zod: define schemas in the backend feature's `*.schema.ts` and infer on both sides rather than duplicating interfaces.
