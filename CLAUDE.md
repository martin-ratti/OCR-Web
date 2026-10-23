# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a **pnpm workspace** monorepo (`backend/` + `frontend/` + `packages/shared/`). Never use npm/yarn — it breaks the workspace lockfile. The `@ocr-web/shared` package must be built (`pnpm build:shared`) before backend/frontend can resolve its compiled output.

From repo root:
- `pnpm install` — install all workspace deps
- `pnpm build:shared` — compile `@ocr-web/shared` (`packages/shared/src/index.ts` → `dist/` via `tsc -p tsconfig.json`). Backend/frontend import the compiled output, so this must be fresh before their own dev/build runs.
- `pnpm dev` — runs `pnpm build:shared` first, then starts backend + frontend together via `concurrently`. You don't need to build shared manually before `pnpm dev`.
- `pnpm build` — chained build: shared → backend → frontend.
- `pnpm test` — runs `pnpm build:shared` and then executes both backend and frontend test suites in Vitest.

Backend (`pnpm --filter backend <cmd>` or run inside `backend/`):
- `pnpm dev` — `ts-node-dev src/index.ts`, listens on `PORT` or `3001`
- `pnpm build` — runs `pnpm --filter @ocr-web/shared build`, then `tsc` → `dist/`; production start is `node dist/index.js`.
- `pnpm test` / `pnpm test:watch` — Vitest + Supertest (`backend/tests/ocr.test.ts`). Exercises `/api/ocr/extract` with stub adapters (`gemini`, `groq`, `paddle`), dual mode (`highlight` | `full`), model cascade on 429/503, output sanitization (`<think>`), error sanitization, and magic byte validation.
- `pnpm lint` — ESLint.

Frontend (`pnpm --filter frontend <cmd>` or run inside `frontend/`):
- `pnpm dev` — Vite dev server
- `pnpm build` — `tsc -b && vite build`
- `pnpm test` — Vitest run (`useOcrStore.test.ts`, `textFormatters.test.ts`, `highlightDetector.test.ts`)
- `pnpm lint` — ESLint (`eslint .`)
- `pnpm preview` — preview prod build

Environment variables (`backend/.env`):
- `GEMINI_API_KEY` — optional at boot (Zod `.optional()` in `env.ts`). Required for the **gemini** engine; the adapter throws on first request if missing.
- `GEMINI_MODEL_ID` — defaults to `gemini-3.5-flash-lite` (never configure `pro` tiers).
- `GEMINI_FALLBACK_MODELS` — comma-separated Flash/Lite fallback cascade on 429/503; defaults to `gemini-3.5-flash,gemini-2.5-flash-lite,gemini-2.5-flash` (any `pro` entry is automatically filtered out).
- `GROQ_API_KEY` — optional at boot. Required for the **groq** engine. Free tier: 1000 RPD / 30 RPM — recommended hosted engine for heavy fast batches.
- `GROQ_MODEL_ID` — defaults to `qwen/qwen3.8-27b` (Alibaba Qwen multimodal vision with fast LPU inference).
- `ALLOWED_ORIGINS` — comma-separated CORS whitelist; defaults to `http://localhost:5173,http://localhost:4173`. Use `*` only in dev.
- `NODE_ENV` — `development` | `production` | `test` (default `development`).
- `PORT` — default `3001`.

The local engine (`engine === 'paddle'` in UI state) runs **entirely in the browser** inside a dedicated Web Worker (`frontend/src/lib/paddleOcr.worker.ts` + `paddleAdapter.ts`) powered by `paddleocr` + `onnxruntime-web` (**PP-OCRv6_small** ONNX weights cached in `CacheStorage`, WebGPU with automatic WASM fallback) — no server-side ONNX, no Render OOM risk. The backend rejects `engine=paddle` with HTTP 410 (`OcrService.getAdapter` throws) unless explicitly overridden via DI in tests.

Frontend reads `VITE_API_URL` (base URL only — do **not** include `/api`; trailing slashes are stripped by `shared/api.ts`). Defaults to `http://localhost:3001`.

`rules.json` at the repo root is tracked (project-level rule config — don't delete as housekeeping). `scratch/` is gitignored workspace for local experiments; treat files there as throwaway and don't rely on them.

Root `package.json` no longer pins any `onlyBuiltDependencies` — the previous entries (`sharp`, `onnxruntime-node`, `protobufjs`) were only required by the now-removed server-side Paddle engine. `backend/package.json` pins `packageManager: pnpm@10.33.0`; don't bump it ad hoc — it locks the workspace lockfile format.

## Architecture ("EstacionAR")

Clean Architecture, modular by feature. The single feature today is `ocr`.

### Backend flow (`backend/src/`)

`index.ts` is just the boot (`createApp().listen(env.PORT)`). The Express wiring lives in `app.ts` as a `createApp(opts)` factory — `opts.ocrController` lets tests inject a stub controller, `opts.enableGlobalLimiter: false` disables the IP limiter for test runs. Keep this seam; don't re-inline the wiring into `index.ts`.

Middleware order in `createApp`: `helmet()` → `requestId` → `metricsMiddleware` → CORS (origin-callback against `env.ALLOWED_ORIGINS`, strips trailing slashes before matching) → `express.json({ limit: '100kb' })` → `globalLimiter` (conditional) → `/health` + `/metrics` routes → `/api/ocr` → `errorHandler` (last). `trust proxy` is set to 1 for Render/Vercel.

Per-feature layering under `features/<feature>/`:

`router` (per-route middlewares: `ocrLimiter` + `uploadImage.single`) → `controller` (HTTP shape; parses `engine` and `mode` fields with `ExtractRequestSchema`, throws `HttpError`/delegates to `next(err)`) → `service` (picks adapter per `OcrEngine`, lazily constructs the chosen one; accepts override map for DI) → `adapter` (`GeminiOcrAdapter` + `GroqOcrAdapter`; the `paddle` engine runs in the browser) → `schema` (Zod contracts re-exported from `@ocr-web/shared`).

Adapters & Dual Mode (`mode: 'highlight' | 'full'`):
- `GeminiOcrAdapter` — calls `@google/genai` starting with `gemini-3.5-flash-lite` and automatically cascading across `GEMINI_FALLBACK_MODELS` on 429/503/404. Uses `systemInstruction` (enabling implicit prompt caching), `temperature: 0`, `topP: 0.1`, `thinkingBudget: 256` (`highlight`) or `0` (`full`), `maxOutputTokens: 2048`, **90 s timeout**.
- `GroqOcrAdapter` — calls Groq's OpenAI-compatible chat completions endpoint (`api.groq.com/openai/v1/chat/completions`) with `qwen/qwen3.8-27b`, system+user message split, `max_tokens: 2048`, 45 s timeout via `AbortController`, and `sanitizeModelOutput` (strips `<think>...</think>` reasoning blocks and fences).
- `recognizeLocal` (browser) — runs PP-OCRv6 inside `paddleOcr.worker.ts` (WebGPU → WASM fallback, `maxSideLength: 1536`, automatic 4-rotation recovery when lexical coherence is low, adaptive paper-white chromatic highlight filter via `highlightDetector.ts`, and Spanish anti-gibberish filtering). Auto-terminates after 5 min idle.
- `hasValidImageMagicBytes` (`backend/src/middlewares/upload.ts`) — validates binary magic signatures (JPEG, PNG, WebP, GIF, HEIC) to block corrupt or spoofed payloads before passing buffers to OCR services.

**Shared sentinel contract (`NO_HIGHLIGHT_SENTINEL`).** Defined in `@ocr-web/shared` (`"No se detectó texto resaltado en esta imagen."`). Emitted across all three engines when `mode === 'highlight'` and a page has no highlighter marks (including client-side precheck `checkBlobHasHighlight` before hitting cloud APIs). Exporters (`collectDoneItems`) exclude sentinel pages automatically so Word/ZIP outputs stay clean.

Shared config in `backend/src/config/`:
- `env.ts` — Zod-validated env. `GEMINI_API_KEY` and `GROQ_API_KEY` are `.optional()` at boot.
- `prompt.ts` — token-optimized `HIGHLIGHT_EXTRACTION_PROMPT` and `FULL_PAGE_EXTRACTION_PROMPT` (~320 tokens each) + `NO_HIGHLIGHT_SENTINEL`. Tune prompts here, never upgrade to `pro` models.
- `logger.ts` — timestamped console wrapper; `info` gated by `NODE_ENV`. `withRequestId(id)` returns a scoped logger for per-request correlation.

Middlewares in `backend/src/middlewares/`:
- `upload.ts` — `uploadImage` multer instance: memory storage, 5 MB, 1 file max, `fileFilter` whitelists `jpeg|png|webp|gif|heic|heif`. Exports `hasValidImageMagicBytes` for binary magic byte verification.
- `rateLimit.ts` — two limiters. `ocrLimiter` (25 req/min per IP) on `/api/ocr/*`; `globalLimiter` (300 req / 15 min per IP) app-wide.
- `errorHandler.ts` — terminal middleware. Maps `MulterError` (413 on `LIMIT_FILE_SIZE`, else 400), `HttpError`, rate-limit detection (429), and unknown → 500. Always returns `ExtractResponse`-shaped JSON.
- `requestId.ts` — assigns/propagates `X-Request-Id` header; attaches `req.requestId` for logger scoping.
- `metrics.ts` — in-process counters exposed at `GET /metrics` in Prometheus text format (`renderMetrics()`).

Health: `GET /health` returns `{ status: 'ok', timestamp }`. Use it for Render uptime pings.

### Frontend flow (`frontend/src/`)

Feature-Sliced-Design-lite. Layers:
- `features/ocr/components/` — presentation (Shadcn/Radix + Tailwind, full light/dark support). `OcrDropzone` and `OcrWorkspace` are the two top-level states.
- `store/useOcrStore.ts` — Zustand store; owns queue, `extractionMode` (`'highlight' | 'full'`), `quotaSavedCount`, per-file status/boxes/rotation, global progress, abort controller, and upload loops. `MAX_FILES = 200` ceiling. Zero-Quota Waste precheck skips network calls on unhighlighted pages when `mode === 'highlight'`.
- **Persistence.** Wrapped with `zustand/middleware` `persist` (`name: 'ocr-web-state'`, `version: 5`, resilient `safeLocalStorage` wrapper). `partialize` persists `selectedEngine`, `extractionMode`, `fontSize`, and bounded `textCache` (LRU max 250 entries) keyed by `${selectedEngine}::${extractionMode}::${file.name}::${file.size}`.
- **Prewarm pipeline.** While file *i* is in Gemini/Groq, file *i+1* is pre-compressed in parallel (`ensureCompressed`). Keep this; losing it ~doubles wall-clock on batches.
- **Undo.** `clearAll` snapshots the queue + active id and keeps it for 12s before revoking preview URLs.
- `lib/highlightDetector.ts` — adaptive paper-white estimation (`estimatePaperWhite`), pixel chromatic classification (`classifyBalancedPixel`), box fill + thick marker underline detection (`isBoxHighlighted`), and fast whole-page chromatic precheck (`checkBlobHasHighlight`).
- `lib/textFormatters.ts` — `cleanOcrText` strips `<think>` blocks/fences, reconstructs hyphenated words across line breaks, merges soft linebreaks within paragraphs while protecting lists/articles/footnotes, and provides Spanish lexical coherence filters (`isPlausibleSpanishLine`, `scoreTextCoherence`).
- `lib/imageDownscale.ts` — EXIF-aware (`imageOrientation: 'from-image'`) canvas resize capping cloud images to `1536px` (minimizes vision tile tokens) and local OCR to `1760px`, preferring `image/webp` with JPEG fallback.
- `shared/api.ts` — `processOcr(file, name, engine, mode, signal)` multipart builder + error matchers.
- Zod schemas live in `@ocr-web/shared` (`packages/shared/src/index.ts`), single source of truth.

**Deps already in `frontend/package.json` — reach for these before inventing:**
- `paddleocr` + `onnxruntime-web` — browser PP-OCRv6 inference in `paddleOcr.worker.ts`.
- `docx` + `jszip` — exporters (`lib/exporters.ts`).
- `sonner` — toast/notification surface.
- `react-window` — virtualized list in `QueueSidebar` above 20 items.
- `next-themes` — dark-mode provider via `ThemeToggle.tsx`.
- `vitest` — unit testing (`pnpm test`).

## Gemini model policy (non-negotiable)

**Never use `pro` Gemini variants.** Stay strictly on `flash-lite` / `flash` variants (`gemini-3.5-flash-lite` primary with Flash/Lite fallback cascade). `.cursorrules` mandates never upgrading to `pro` or "smart" tiers because batch workloads run on free-tier accounts with tight RPM/RPD caps.

## Deployment

- **Backend** → Render.com web service. **Root directory must be empty (repo root), NOT `backend/`** — pnpm workspaces need `pnpm-workspace.yaml` at the root to resolve `@ocr-web/shared`. Build `pnpm install && pnpm --filter backend build`. Start `node backend/dist/index.js`.
- **Frontend** → Vercel. Root `frontend`, Vite preset. Env: `VITE_API_URL` = Render URL, no trailing `/api`.
- **CORS whitelist gotcha:** after deploying the frontend, update `ALLOWED_ORIGINS` on the backend with the Vercel URL.

See `DEPLOY.md` for the authoritative deploy instructions — if this section and `DEPLOY.md` ever disagree, `DEPLOY.md` wins.

## Working conventions from `.cursorrules`

1. **Plan before big code.** Before generating a new feature or a large refactor, emit a numbered plan (files to create/modify, component choices) and ask `"¿Procedo con la implementación de este plan?"` before writing code.
2. **Post-delivery checklist.** After delivering a solution, append:
   > - [ ] Arquitectura (Clean Architecture / Modular)
   > - [ ] Tipado Estricto (TypeScript + Zod)
   > - [ ] Manejo de Errores y Límites (Rate limiting/Multer)
   > - [ ] Ecosistema (pnpm, Shadcn/ui aplicado)

New UI components should default to Shadcn/ui (`pnpm dlx shadcn@latest add <name>` from `frontend/`). Types must be E2E via Zod in `@ocr-web/shared`.
