# 🚀 Guía de Despliegue: OCR Web Premium

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
   > El motor offline (rotulado `paddle` en la UI) ahora corre **en el navegador** vía Tesseract.js — no hay descarga de modelos ONNX en el deploy. El backend solo expone Gemini; si alguien manda `engine=paddle` al endpoint igual, devuelve 410 Gone.

   > [!IMPORTANT]
   > Render **debe** correr desde la raíz del repo, no desde `backend/`. Este monorepo usa `pnpm workspaces` y `@ocr-web/shared` está declarado como `workspace:*`; si pnpm arranca dentro de `backend/` no ve el `pnpm-workspace.yaml` de la raíz y el install falla. El script `build` del backend ya compila `@ocr-web/shared` antes del `tsc`, así que no hace falta pasos extra.
4. **Variables de Entorno (Environment Variables)**:
   - `GEMINI_API_KEY`: Clave de Google AI Studio. Necesaria si alguien selecciona el motor **Gemini** (alta precisión, prompt de resaltado estricto). Sin ella, los requests con `engine=gemini` tiran 500. Free tier muy ajustado: **20 RPD** (no 1000 como dice el dashboard de Google — verificado por logs en producción).
   - `GROQ_API_KEY`: Clave de [console.groq.com](https://console.groq.com/keys). Necesaria si alguien selecciona el motor **Groq** (Llama 4 Scout Vision, prompt de página completa, ~96% recall vs Gemini ground-truth, ~10× más rápido). Free tier muy generoso: **1000 RPD / 30 RPM**. Recomendada para uso intensivo.
   - `GROQ_MODEL_ID` *(opcional)*: Default `meta-llama/llama-4-scout-17b-16e-instruct`. Override sólo si Groq deprecia o renombra el modelo.
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: Lista separada por comas de orígenes autorizados. Ej: `https://tu-app.vercel.app,https://tudominio.com`. Si omitís, sólo aceptará `localhost`.
   - `PORT` *(opcional)*: Render lo setea solo. No lo pongas salvo que sepas lo que hacés.

   > [!TIP]
   > El motor **Local** (rotulado `paddle` en la UI) corre 100% en el navegador vía Tesseract.js — no necesita ninguna key y nunca llega al backend. Sirve como fallback total si Gemini/Groq están caídos o agotaron quota.

> [!TIP]
> Una vez que termine de subir, Render te va a dar una URL (ej: `https://ocr-backend.onrender.com`). **Copiala**, la vas a necesitar para el frontend.

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
- **Límites Gemini 2.5 Flash-Lite free tier** (por proyecto, no por API key):
  - **15 RPM** (requests per minute)
  - **20 RPD** (requests per day — el dashboard de Google dice 1000 pero la realidad observada en producción son ~20 por día, resetea a medianoche Pacific Time)
- **Límites Groq free tier** (Llama 4 Scout):
  - **30 RPM** (requests per minute)
  - **1.000 RPD** (requests per day, resetea cada 24 hs)
  - ~50× más headroom que Gemini → motor recomendado para uso intensivo.
- **Rate limits del backend**:
  - `/api/ocr/extract` → **25 requests por minuto por IP** (deja headroom para Groq 30 RPM y aún corta abuso antes de que Gemini 15 RPM trip).
  - Global → 300 requests cada 15 minutos por IP.
  - Si alguien los pega, el cliente hace retry con backoff lineal automáticamente.
- **Tamaño máximo de imagen**: 5 MB por archivo, 1 archivo por request. El frontend además hace downscale a 1600px max antes de subir para aligerar.

### Calidad esperada por motor (bench 7 muestras vs Gemini ground-truth)

| Motor   | Word recall | Tiempo / imagen | Cuota free          | Prompt          |
|---------|-------------|-----------------|---------------------|-----------------|
| Gemini  | 1.000 (ref) | ~17 s           | 15 RPM / 20 RPD     | Sólo resaltado  |
| Groq    | **0.963**   | **~2.3 s**      | **30 RPM / 1000 RPD** | Página completa |
| Local   | 0.861       | ~28 s           | Sin cuota           | Página completa |

**Recomendación práctica**: configurar `GROQ_API_KEY` como motor principal, dejar `GEMINI_API_KEY` para resaltado fino esporádico, y el motor Local funciona siempre como fallback offline.

¡Listo! Con esto ya tienen su herramienta de estudio online para usar desde cualquier lado. 🐼🐒✨
