# 🚀 Guía de Despliegue: OCR Web ("Sirviendo Apuntes")

Esta guía te explica cómo subir el proyecto a internet de forma gratuita usando **Vercel** para el frontend y **Render.com** para el backend.

---

## 1. Preparar el Backend (Render.com)

1. **Crear cuenta**: Registrate en [Render.com](https://render.com/).
2. **Nuevo Web Service**: Conectá tu repositorio de GitHub.
3. **Configuración**:
   - **Name**: `ocr-backend` (o el que quieras)
   - **Root Directory**: *(dejar vacío — usar la raíz del repo)*
   - **Environment**: `Node`
   - **Build Command**: `pnpm install && pnpm --filter backend build`
   - **Start Command**: `node backend/dist/index.js`

   > [!NOTE]
   > El motor offline (rotulado `paddle` en la UI) corre **100% en el navegador** dentro de un **PaddleOCR ONNX Web Worker** (`paddleocr` + `onnxruntime-web`, modelo `PP-OCRv6_small` con aceleración WebGPU y fallback automático a WASM) — no hay descarga de modelos ONNX en el servidor ni riesgo de OOM en Render. Si alguien envía `engine=paddle` al backend, devuelve `410 Gone`.

   > [!IMPORTANT]
   > Render **debe** correr desde la raíz del repo, no desde `backend/`. Este monorepo usa `pnpm workspaces` y `@ocr-web/shared` está declarado como `workspace:*`; si pnpm arranca dentro de `backend/` no ve el `pnpm-workspace.yaml` de la raíz y el install falla. El script `build` del backend ya compila `@ocr-web/shared` antes del `tsc`.

4. **Variables de Entorno (Environment Variables)**:
   - `GEMINI_API_KEY`: Clave de Google AI Studio. Necesaria si alguien selecciona el motor **Gemini** (`Gemini Flash-Lite / Flash` en cascada ligera; jamás usa modelos `Pro`). Sin ella, las peticiones con `engine=gemini` devuelven `503 Service Unavailable`.
   - `GEMINI_MODEL_ID` *(opcional)*: Default `gemini-3.5-flash-lite` (estrictamente variantes livianas `Flash-Lite` / `Flash`).
   - `GEMINI_FALLBACK_MODELS` *(opcional)*: Default `gemini-3.5-flash,gemini-2.5-flash-lite,gemini-2.5-flash`. Cascada automática ante errores `429`, `502`, `503`, `504` o timeouts.
   - `GEMINI_MAX_CONCURRENCY` *(opcional)*: Default `3`. Semáforo en servidor para limitar pedidos simultáneos hacia Gemini y cuidar el límite de RPM gratuito.
   - `GROQ_API_KEY`: Clave de [console.groq.com](https://console.groq.com/keys). Necesaria para el motor **Groq** (inferencia multimodal ultrarrápida en LPU, compatible con `qwen/qwen3.8-27b` y `Groq Llama 4 Scout`). Free tier generoso: **1000 RPD / 30 RPM**. Recomendada para lotes grandes.
   - `GROQ_MODEL_ID` *(opcional)*: Default `qwen/qwen3.8-27b` (o `meta-llama/llama-4-scout-17b-16e-instruct`).
   - `METRICS_TOKEN` *(opcional)*: Si se configura, `GET /metrics` exige `Authorization: Bearer <METRICS_TOKEN>`. En producción (`NODE_ENV=production`), si no se define `METRICS_TOKEN`, `/metrics` queda cerrado (`403`) por seguridad.
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: Lista separada por comas de orígenes autorizados. Ej: `https://tu-app.vercel.app,https://tudominio.com`. Si omitís, sólo aceptará `localhost`.
   - `PORT` *(opcional)*: Render lo setea automáticamente.

   > [!TIP]
   > Podés verificar el estado del servidor y qué motores tienen clave configurada consultando `GET /api/health` (o `GET /health`), que responde `{ status: "ok", timestamp, engines: { gemini: boolean, groq: boolean, local: true } }`.

---

## 2. Preparar el Frontend (Vercel)

1. **Crear cuenta**: Registrate en [Vercel.com](https://vercel.com/).
2. **Import Project**: Conectá tu repositorio.
3. **Configuración**:
   - **Framework Preset**: `Vite` (lo detectará solo)
   - **Root Directory**: `frontend`
   - **Install Command**: *(default — Vercel corre `pnpm install` y resuelve el workspace de la raíz)*
   - **Build Command**: *(default `pnpm run build` — el script ya compila `@ocr-web/shared` antes del `tsc -b && vite build`)*
4. **Variables de Entorno (Environment Variables)**:
   - `VITE_API_URL`: Pegá acá la URL que te dio Render (ej: `https://ocr-backend.onrender.com`). **IMPORTANTE**: No le pongas `/api` al final, solo la URL base. El cliente normaliza trailing slashes.

> [!WARNING]
> Después de desplegar el frontend, **volvé al backend en Render** y agregá tu URL de Vercel a `ALLOWED_ORIGINS`. Si no, CORS te va a bloquear.

---

## 3. Consideraciones de la Capa Gratuita

- **Render "Sleep"**: En el plan gratuito, si nadie usa la página por 15 minutos, el servidor se "duerme". Cuando entres la primera vez, puede tardar unos 30 segundos en arrancar.
- **Límites Gemini Flash-Lite / Flash free tier**:
  - **15 RPM** (requests per minute), protegido además por el semáforo de concurrencia del servidor (`GEMINI_MAX_CONCURRENCY=3`) y la cascada automática entre variantes `Flash-Lite` y `Flash`.
  - Pre-chequeo cromático en navegador (*Zero-Quota Waste*) para no enviar al servidor páginas sin resaltador cuando estás en modo `Solo resaltador` (con botón **"Intentar leer resaltado igual con IA"** si usaste un marcador pastel muy suave).
- **Límites Groq free tier** (`Qwen 3.8` / `Llama 4 Scout`):
  - **30 RPM** (requests per minute) y **1.000 RPD** (requests per day).
  - Reutilización de imágenes pre-comprimidas en el navegador para evitar doble compresión en lotes grandes.
- **Rate limits del backend**:
  - `/api/ocr/extract` → **25 requests por minuto por IP**.
  - Global → 300 requests cada 15 minutos por IP.
- **Tamaño máximo de imagen**: 5 MB por archivo (JPEG, PNG, WebP, HEIC/HEIF con validación de firma binaria `ftyp` real). El frontend redimensiona automáticamente antes de subir.

### Resumen de motores disponibles

| Motor   | Ejecución | Modelos | Cuota free          | Modos soportados          |
|---------|-----------|---------|---------------------|---------------------------|
| Gemini  | Cloud IA  | `Gemini Flash-Lite / Flash` (cascada ligera, sin `Pro`) | 15 RPM | Solo resaltador / Página entera |
| Groq    | Cloud LPU | `Qwen 3.8` / `Groq Llama 4 Scout` | **30 RPM / 1000 RPD** | Solo resaltador / Página entera |
| Local   | Browser   | `PaddleOCR ONNX Web Worker` (`PP-OCRv6_small` WebGPU/WASM) | **Ilimitado (sin cuota)** | Solo resaltador / Página entera |

¡Listo! Con esto ya tienen su herramienta de estudio online para usar desde cualquier lado. 🐼🐒✨
