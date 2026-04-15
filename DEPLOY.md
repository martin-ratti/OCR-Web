# 🚀 Guía de Despliegue: OCR Web Premium

Esta guía te explica cómo subir el proyecto a internet de forma gratuita usando **Vercel** para el frontend y **Render.com** para el backend.

---

## 1. Preparar el Backend (Render.com)

1. **Crear cuenta**: Registrate en [Render.com](https://render.com/).
2. **Nuevo Web Service**: Conectá tu repositorio de GitHub.
3. **Configuración**:
   - **Name**: `ocr-backend` (o el que quieras)
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `node dist/index.js`
4. **Variables de Entorno (Environment Variables)**:
   - `GEMINI_API_KEY`: Tu clave de Google AI Studio.
   - `NODE_ENV`: `production`

> [!TIP]
> Una vez que termine de subir, Render te va a dar una URL (ej: `https://ocr-backend.onrender.com`). **Copiala**, la vas a necesitar para el frontend.

---

## 2. Preparar el Frontend (Vercel)

1. **Crear cuenta**: Registrate en [Vercel.com](https://vercel.com/).
2. **Import Project**: Conectá tu repositorio.
3. **Configuración**:
   - **Framework Preset**: `Vite` (lo detectará solo)
   - **Root Directory**: `frontend`
4. **Variables de Entorno (Environment Variables)**:
   - `VITE_API_URL`: Pegá acá la URL que te dio Render (ej: `https://ocr-backend.onrender.com`). **IMPORTANTE**: No le pongas `/api` al final, solo la URL base.

---

## 3. Consideraciones de la Capa Gratuita

- **Render "Sleep"**: En el plan gratuito, si nadie usa la página por 15 minutos, el servidor se "duerme". Cuando entres la primera vez, puede tardar unos 30 segundos en arrancar. ¡No te asustes, después vuela!
- **RPM de Gemini**: Seguimos limitados por la cuota de Google, el sistema manejará las esperas automáticamente si tu novia sube muchas fotos.

¡Listo! Con esto ya tienen su herramienta de estudio online para usar desde cualquier lado. 🐼🐒✨
