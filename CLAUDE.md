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
- `pnpm build` — runs `pnpm --filter @ocr-web/shared build`, then `tsc` → `dist/`; production start is `node dist/index.js`.
- `pnpm test` / `pnpm test:watch` — Vitest + Supertest. The single test file (`backend/tests/ocr.test.ts`) exercises `/api/ocr/extract` with a stub `OcrAdapter` injected via `createApp({ ocrController })`. The factory pattern is there specifically so tests can swap the Gemini SDK out — preserve it.
- `pnpm lint` — ESLint.

Frontend (`pnpm --filter frontend <cmd>` or run inside `frontend/`):
- `pnpm dev` — Vite dev server
- `pnpm build` — `tsc -b && vite build`
- `pnpm lint` — ESLint (`eslint .`)
- `pnpm preview` — preview prod build

Backend env lives in `backend/.env`:
- `GEMINI_API_KEY` — optional at boot (Zod `.optional()` in `env.ts`). Required for the **gemini** engine; the adapter throws on first request if missing. The local engine (`paddle` value in the UI / shared schema) runs entirely in the browser via Tesseract.js, so it works with no backend key — and in fact never hits the backend at all.
- `GROQ_API_KEY` — optional at boot. Required for the **groq** engine (Llama 4 Scout Vision via OpenAI-compatible `api.groq.com/openai/v1/chat/completions`). Free tier: 1000 RPD / 30 RPM — ~50× more headroom than Gemini free, so this is the recommended hosted engine for heavy batches.
- `GROQ_MODEL_ID` — defaults to `meta-llama/llama-4-scout-17b-16e-instruct`. Override only if Groq deprecates/renames the model.
- `ALLOWED_ORIGINS` — comma-separated CORS whitelist; defaults to `http://localhost:5173,http://localhost:4173`. Use `*` only in dev.
- `NODE_ENV` — `development` | `production` | `test` (default `development`).
- `PORT` — default `3001`.

The local engine (`engine === 'paddle'` in the persisted UI state) runs **entirely in the browser** via Tesseract.js — no server-side ONNX, no model download step, no Render OOM risk. The `paddle` enum value is kept for backwards compatibility with persisted client state (`textCache` keys) and the `OcrEngineSchema` in `@ocr-web/shared`; the backend rejects it with HTTP 410 (`OcrService.getAdapter` throws) so any direct API call with `engine=paddle` fails loudly.

Frontend reads `VITE_API_URL` (base URL only — do **not** include `/api`; trailing slashes are stripped by `shared/api.ts`). Defaults to `http://localhost:3001`.

`rules.json` at the repo root is tracked (project-level rule config — don't delete as housekeeping). `scratch/` is gitignored workspace for local experiments; treat files there as throwaway and don't rely on them.

Root `package.json` no longer pins any `onlyBuiltDependencies` — the previous entries (`sharp`, `onnxruntime-node`, `protobufjs`) were only required by the now-removed server-side Paddle engine. `backend/package.json` pins `packageManager: pnpm@10.33.0`; don't bump it ad hoc — it locks the workspace lockfile format.

## Architecture ("EstacionAR")

Clean Architecture, modular by feature. The single feature today is `ocr`.

### Backend flow (`backend/src/`)

`index.ts` is just the boot (`createApp().listen(env.PORT)`). The Express wiring lives in `app.ts` as a `createApp(opts)` factory — `opts.ocrController` lets tests inject a stub controller, `opts.enableGlobalLimiter: false` disables the IP limiter for test runs. Keep this seam; don't re-inline the wiring into `index.ts`.

Middleware order in `createApp`: `helmet()` → `requestId` → `metricsMiddleware` → CORS (origin-callback against `env.ALLOWED_ORIGINS`, strips trailing slashes before matching) → `express.json({ limit: '100kb' })` → `globalLimiter` (conditional) → `/health` + `/metrics` routes → `/api/ocr` → `errorHandler` (last). `trust proxy` is set to 1 for Render/Vercel.

Per-feature layering under `features/<feature>/`:

`router` (per-route middlewares: `ocrLimiter` + `uploadImage.single`) → `controller` (HTTP shape; parses `engine` field with `ExtractRequestSchema`, throws `HttpError`/delegates to `next(err)`) → `service` (picks adapter per `OcrEngine`, lazily constructs the chosen one; accepts override map for DI) → `adapter` (`GeminiOcrAdapter` + `GroqOcrAdapter`; the `paddle` engine moved to the browser) → `schema` (Zod contracts re-exported from `@ocr-web/shared`).

**Server-side engine: only Gemini.** The `OcrEngineSchema` enum still includes `'paddle'` for backwards-compat with persisted client state, but the backend rejects `engine === 'paddle'` with HTTP 410 in `OcrService.getAdapter`. The local engine runs **entirely in the browser** via Tesseract.js (`frontend/src/lib/tesseractAdapter.ts`):
- `GeminiOcrAdapter` — calls `@google/genai` with the pinned model, `temperature: 0`, `topP: 0.1`, `thinkingBudget: 1024`, **90 s timeout** (`GEMINI_TIMEOUT_MS = 90_000` in `ocr.service.ts`; previously 60 s but dense pages with many highlights legitimately took ~50 s and tripped premature timeouts). The timeout is implemented as a `Promise.race` against the SDK call. Uses `HIGHLIGHT_EXTRACTION_PROMPT` (chromatic filter) and is the **only** engine that respects `NO_HIGHLIGHT_SENTINEL`. Free tier 15 RPM / **20 RPD** per project (the Google dashboard says 1000 RPD but production logs confirm the real daily cap is 20; resets midnight Pacific).
- `GroqOcrAdapter` — calls Groq's OpenAI-compatible chat completions endpoint (`api.groq.com/openai/v1/chat/completions`) with `meta-llama/llama-4-scout-17b-16e-instruct` (configurable via `GROQ_MODEL_ID`). Uses `FULL_PAGE_EXTRACTION_PROMPT` because Groq is stricter than Gemini on pale highlights and tends to return the no-text sentinel; full-page mode hits 96 % word recall vs Gemini ground truth on the same images (Gemini-strict prompt drops to 50 %). 60 s timeout via `AbortController`; explicit 429/5xx mapping. Free tier 30 RPM / 1000 RPD — recommended for batch workloads.
- `recognizeLocal` (browser) — **no highlight mask anymore.** Earlier versions HSV-masked highlighted regions to mirror Gemini's chromatic-filter, but that dropped legible non-highlighted text and hurt similarity scores. The current pipeline OCRs the **full page** directly via a cached Tesseract.js worker (Spanish + English traineddata, **`PSM.AUTO`** — handles two-column layouts, headers/footers, and indented blocks better than `SINGLE_BLOCK`, which was tuned for the dead mask-mode worldview; LSTM-only). For unknown orientation it tries **four cardinal rotations** (0°/180°/90° CW/270° CW) and picks the result with the highest Spanish trigram-density score; it early-exits if the first pass is clearly clean. Worker is module-level cached and auto-terminated after 5 min idle to free ~150 MB. There is no `highlightMaskCanvas.ts` — do not look for it.

**Sentinel contract is Gemini-only, not shared.** Only the Gemini adapter respects `NO_HIGHLIGHT_SENTINEL` (`"No se detectó texto resaltado en esta imagen."`), because only `HIGHLIGHT_EXTRACTION_PROMPT` instructs the model to emit that exact string when nothing is highlighted. Groq and Local use `FULL_PAGE_EXTRACTION_PROMPT` and transcribe everything — they never produce the sentinel. Frontend code that special-cases the sentinel must therefore gate on `engine === 'gemini'`, or it will silently break when other engines return free-form text.

Shared config in `backend/src/config/`:
- `env.ts` — Zod-validated env. `GEMINI_API_KEY` is `.optional()` at boot. The server only throws if a request hits the Gemini adapter without a key. The local engine never reaches the backend, so a missing key is fine if users always pick the local engine.
- `prompt.ts` — `HIGHLIGHT_EXTRACTION_PROMPT` (chromatic filter, used by Gemini) + `FULL_PAGE_EXTRACTION_PROMPT` (transcribe everything, used by Groq) + `NO_HIGHLIGHT_SENTINEL`. Tune prompts here, never the models.
- `logger.ts` — timestamped console wrapper; `info` gated by `NODE_ENV`. `withRequestId(id)` returns a scoped logger for per-request correlation.

Middlewares in `backend/src/middlewares/`:
- `upload.ts` — `uploadImage` multer instance: memory storage, 5 MB, 1 file max, `fileFilter` whitelists `jpeg|png|webp|gif|heic|heif`.
- `rateLimit.ts` — two limiters. `ocrLimiter` (25 req/min per IP, leaves headroom for Groq's 30 RPM ceiling while still tripping abuse before Gemini's 15 RPM) on `/api/ocr/*`; `globalLimiter` (300 req / 15 min per IP) app-wide.
- `errorHandler.ts` — terminal middleware. Maps `MulterError` (413 on `LIMIT_FILE_SIZE`, else 400), `HttpError`, Gemini rate-limit detection (429), and unknown → 500. Always returns `ExtractResponse`-shaped JSON.
- `requestId.ts` — assigns/propagates `X-Request-Id` header; attaches `req.requestId` for logger scoping.
- `metrics.ts` — in-process counters exposed at `GET /metrics` in Prometheus text format (`renderMetrics()`). `recordOcrSuccess()` / `recordOcrError(isRateLimit)` are called by the controller.

Health: `GET /health` returns `{ status: 'ok', timestamp }`. Use it for Render uptime pings.

### Frontend flow (`frontend/src/`)

Feature-Sliced-Design-lite. Layers:
- `features/ocr/components/` — presentation (Shadcn/Radix + Tailwind). `OcrDropzone` and `OcrWorkspace` are the two top-level states.
- `store/useOcrStore.ts` — Zustand store; owns queue, per-file status, global progress, abort controller, and the upload loops (`processAll` / `processOne` / `processSelected` / `retryAllErrors` / `cancel` / `clearAll` with undo). `MAX_FILES = 200` ceiling; `MAX_ATTEMPTS = 5`. Inter-file pause depends on engine: Gemini = 5000 ms (15 RPM ceiling), Groq = 2500 ms (30 RPM ceiling), Paddle = 0 (browser-local).
- **Persistence.** Wrapped with `zustand/middleware` `persist` (`name: 'ocr-web-state'`, `version: 4`, `localStorage`). `partialize` persists only `selectedEngine`, `fontSize`, and `textCache`. `textCache` is keyed by `${file.name}::${file.size}` so re-adding an already-OCR'd file rehydrates the result without another API call — do not bypass this cache when wiring new ingestion paths. If you change `textCache` shape, bump the persist `version`.
- **Prewarm pipeline.** While file *i* is in Gemini, file *i+1* is pre-compressed in parallel (`ensureCompressed` stores the resulting `File` on the queue entry). Keep this; losing it ~doubles wall-clock on batches.
- **Undo.** `clearAll` snapshots the queue + active id and keeps it for 12s before revoking preview URLs. `restoreCleared` rehydrates if called before expiry. If you remove files programmatically, use `removeFiles(ids)` so preview URLs are revoked.
- `shared/api.ts` — cross-cutting: `getApiBase` trailing-slash normalizer, `isRateLimitMessage`, `processOcr(file, name, engine, signal)` (the only place that builds the multipart request), re-exports `OcrEngine` type from `@ocr-web/shared`.
- Zod schemas live in the `@ocr-web/shared` workspace package (`packages/shared/src/index.ts`), imported by both backend and frontend. Single source of truth — do not re-declare in either side.
- `lib/imageDownscale.ts` — canvas-based resize to 1600px max dimension at JPEG q=0.85 before upload; skips small files.
- `components/ErrorBoundary.tsx` — wraps the whole app in `main.tsx`.
- `components/ui/` — Shadcn primitives (style `new-york`, base `zinc`, alias `@/*` → `src/*`, see `components.json` + `vite.config.ts`). `dialog.tsx` is the Radix-backed Dialog; `KawaiiModal` is a themed wrapper around it (ESC / focus trap / scroll lock handled by Radix).

Response parsing uses `ExtractResponseSchema.safeParse` — don't bypass Zod and don't duplicate the interface.

**Deps already in `frontend/package.json` — reach for these before inventing.** These were installed for specific cross-cutting needs; reuse them instead of pulling fresh libraries:
- `docx` + `jszip` — exporters (`lib/exporters.ts`). Use these to emit `.docx` per file and to bundle a batch into a single `.zip`. Do not add a second word-processing or zip lib.
- `sonner` — toast/notification surface. New non-blocking user feedback goes here, not into ad-hoc `<div>` banners.
- `react-window` — virtualized list. Required when iterating `files[]` in a scrollable list, since the queue can reach `MAX_FILES = 200`. Plain `.map()` over the queue will jank.
- `next-themes` — dark-mode provider. If asked for a theme toggle, wire through this; don't roll a custom `useEffect`-based one.
- `axios` is listed as a dep but the only HTTP path used today is `fetch` in `shared/api.ts`. Prefer `fetch` for consistency — pulling in `axios` for a new call is a smell.

### Orchestrator / rate-limit strategy (critical)

Gemini 2.5 Flash-Lite free-tier ceilings (per project, not per key):
- **15 RPM** / **250k TPM** / **20 RPD** (resets midnight Pacific). Google's dashboard advertises 1000 RPD but production logs show the real daily cap is 20 — plan around 20.

Backpressure is layered:
- **Client** (`useOcrStore.processAll`): 5 s pause between files, `AbortController` shared across the run, 5 retry attempts per file. Backoff is 15·n s on `RateLimit` (429/503/quota-regex matches) and 3·n s on generic errors.
- **Server** (`middlewares/rateLimit.ts`): `ocrLimiter` caps 25 req/min per IP on `/api/ocr/*` — between Gemini's 15 RPM (cliente legítimo trip Gemini antes que esto) and Groq's 30 RPM (cliente Groq tiene headroom). Abusivos chocan acá antes que con upstream.

Status machine per file: `idle → processing → success | error`. Retries between attempts surface via `infoMessage`; terminal failures surface via `errorMessage`. They are distinct fields — `resultText` is never overwritten by an error string.

When changing concurrency or intervals, keep these ceilings in mind — serial processing is a design constraint, not a code smell to "optimize".

## Gemini model policy (non-negotiable)

**Do not upgrade the Gemini model.** The codebase pins `gemini-2.5-flash-lite` (`backend/src/features/ocr/ocr.service.ts`). `.cursorrules` mandates staying on `gemini-2.5-flash` or the lightest current variant — never `pro` or any "smart" tier. The app processes 60+ images/batch on free-tier accounts; bumping the model breaks the RPM orchestrator.

Tune the **prompt** for accuracy, never the SDK model.

The current prompt is a chromatic-filter instruction: extract only text that is highlighted with marker/fluorescent pen, ignore everything else, fallback string `"No se detectó texto resaltado en esta imagen."` when nothing is highlighted. Preserve this contract when editing.

## Deployment

- **Backend** → Render.com web service. **Root directory must be empty (repo root), NOT `backend/`** — pnpm workspaces need to see `pnpm-workspace.yaml` at the root to resolve `@ocr-web/shared` (declared as `workspace:*`). Build `pnpm install && pnpm --filter backend build` — only `tsc` runs (no model download anymore; the Paddle ONNX engine was removed and replaced by browser-side Tesseract.js). Start `node backend/dist/index.js`. Env: `GEMINI_API_KEY` (optional but required if anyone selects the Gemini engine), `NODE_ENV=production`, `ALLOWED_ORIGINS=https://<your-vercel-url>`. Free tier sleeps after ~15 min idle — and now the worker process is small enough that it no longer hits the 512 MB OOM limit on cold start.
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
