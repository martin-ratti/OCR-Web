<div align="center">
  <h1>✨ OCR Web Monorepo</h1>
  <p><strong>Evolución web del Extractor de Texto OCR de escritorio, migrado a una arquitectura moderna Fullstack impulsada por IA.</strong></p>
  <br />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <br />
</div>

<br />

## 📑 Tabla de Contenidos

- [Sobre el Proyecto](#-sobre-el-proyecto)
- [Arquitectura "EstacionAR"](#-arquitectura-estacionar)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalación y Uso](#-instalación-y-uso)

<br />

## 🚀 Sobre el Proyecto

`OCR Web` es una plataforma Fullstack de alto rendimiento diseñada para la extracción precisa de texto desde imágenes físicas o digitales. Surgida como la migración natural de una exitosa herramienta de escritorio en Python.

La app ofrece **tres motores de OCR seleccionables** desde la UI:

- 🌸 **Gemini** (`gemini-2.5-flash-lite`) — Visión multimodal de Google. Prompt de **resaltado estricto**: extrae únicamente el texto pintado con marcador. Alta precisión, free tier muy ajustado (~20 RPD).
- ⚡ **Groq Llama 4 Scout** (`meta-llama/llama-4-scout-17b-16e-instruct`) — Visión vía endpoint OpenAI-compatible. Prompt de **página completa**: transcribe todo el texto. ~96% word recall vs Gemini, **~10× más rápido**, free tier **1000 RPD / 30 RPM** (50× más que Gemini). Motor recomendado para uso intensivo.
- 💻 **Local (Tesseract.js)** — Corre 100% en el navegador (WASM + traineddata `spa` + `eng`). Sin cuota, sin red, sin backend. ~86% word recall. Fallback total si las APIs hosted se caen o agotan quota.

## 🏛 Arquitectura "EstacionAR"

El proyecto adopta el concepto arquitectónico estricto de Clean Architecture bautizado internamente como *"EstacionAR"*:

- **Clean Architecture Modular**: Tanto el frontend como el backend aíslan completamente cada *feature* en módulos auto-contenidos, promoviendo una escalabilidad robusta.
- **Flujo Backend (Node/Express)**: La lógica expuesta a través de la API cuenta con la separación de:
  `Router` ➡️ `Controller` ➡️ `Service` (gestión pura de Gemini AI y de reglas de negocio) ➡️ `Repository` / `Adapter`.
- **Flujo Frontend (React)**: Diseño inspirado en *Feature-Sliced Design* (FSD) simplificado. La capa de presentación visual (Shadcn/Tailwind) es agnóstica de los manejos asincrónicos, confiando su lógica al Store Global (`Zustand`) y a la capa de Red.
- **Tipado de Extremo a Extremo (E2E)**: Validaciones irrompibles con `Zod`, infiriendo y consumiendo los mismos esquemas lógicos en ambos extremos de la aplicación.

## 🛠 Stack Tecnológico

**Core & Herramientas:**
- 📦 **Gestor de Paquetes:** `pnpm` (Exclusivo por velocidad y estricto control de dependencias)
- 📝 **Lenguaje Base:** `TypeScript` E2E

**Backend:**
- ⚙️ **Runtime:** Node.js + Express 5
- 🧠 **Capa NLP/IA:** Adaptadores intercambiables — `GeminiOcrAdapter` (`@google/genai`) y `GroqOcrAdapter` (REST OpenAI-compatible)
- 🛡️ **Validación / Procesamiento:** `Zod` para contratos y `Multer` para procesamiento óptico de buffers en memoria.

**Frontend:**
- ⚛️ **Framework UI:** React + Vite
- 🎨 **Estilado y Componentes:** Tailwind CSS, Shadcn/ui y Radix UI
- 🗃️ **Estado Global:** Zustand
- 🔤 **OCR Offline:** `tesseract.js` (WASM) — motor local sin cuota, full-page con 4 rotaciones + scoring trigrama español.

## 📂 Estructura del Proyecto

Al ser un ecosistema **Monorepo NPM**, el core del código se divide en Workspaces enlazados logísticamente:

```text
📦 OCR-Web-Monorepo
 ┣ 📂 backend/         # API (Node.js/Express) encapsulando el procesador de IA
 ┃ ┣ 📂 src/
 ┃ ┣ 📜 package.json
 ┃ ┗ 📜 .env
 ┣ 📂 frontend/        # SPA (React) consumiendo los contratos API estrictos
 ┃ ┣ 📂 src/
 ┃ ┣ 📂 public/
 ┃ ┣ 📜 package.json
 ┃ ┗ 📜 vite.config.ts
 ┣ 📜 package.json     # Punto de entrada para scripts pnpm (Workspaces)
 ┣ 📜 .cursorrules     # Reglas arquitectónicas inter-sistemas para uso de la IA
 ┗ 📜 README.md        # Documentación Maestra (Tú estás aquí)
```

## 🚀 Instalación y Uso

> **Nota:** Este proyecto requiere estrictamente utilizar **pnpm** para la instalación. NPM o Yarn generarán conflictos en el Lockfile de los Workspaces.

### 1. Requisitos Previos
- Node.js (v20 o superior).
- pnpm instalado globalmente (`npm install -g pnpm`).
- *(Opcional)* API Key de [Google AI Studio](https://aistudio.google.com/) para el motor **Gemini**.
- *(Opcional)* API Key de [Groq Console](https://console.groq.com/keys) para el motor **Groq** (recomendado — 50× más cuota que Gemini free).
- *(Ninguna)* — el motor **Local** corre en el navegador y no necesita keys; alcanza para usar la app sin configurar nada del backend.

### 2. Preparación de Repositorio

Clona el repositorio e instala directamente las dependencias del Monorepo en la raíz:

```bash
pnpm install
```

### 3. Configuración de Entorno

Ingresá al directorio backend, generá el archivo de ambiente y pegá las keys que quieras habilitar (todas son opcionales — pero sin ninguna sólo funciona el motor Local):

```bash
cd backend
cat > .env <<EOF
GEMINI_API_KEY=tu_clave_de_google_ai_studio
GROQ_API_KEY=tu_clave_de_groq
EOF
```

Variables soportadas (todas con defaults razonables):

| Variable          | Default                                          | Descripción                                                                              |
|-------------------|--------------------------------------------------|------------------------------------------------------------------------------------------|
| `GEMINI_API_KEY`  | —                                                | Necesaria si alguien selecciona el motor Gemini.                                         |
| `GROQ_API_KEY`    | —                                                | Necesaria si alguien selecciona el motor Groq.                                           |
| `GROQ_MODEL_ID`   | `meta-llama/llama-4-scout-17b-16e-instruct`      | Sobreescribir sólo si Groq deprecia o renombra el modelo.                                |
| `PORT`            | `3001`                                           | Puerto HTTP local.                                                                       |
| `NODE_ENV`        | `development`                                    | `development` / `production` / `test`.                                                   |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:4173`    | CORS whitelist separada por comas. Usar `*` sólo en dev.                                 |

### 4. Lanzamiento

Levanta simultáneamente el Backend y Frontend interactuando con los workspaces (desde la raíz):

```bash
# Si cuentas con un target en tu package raíz configurado:
pnpm dev

# Alternativa manual por instancias:
# En terminal 1:
cd backend && pnpm dev
# En terminal 2:
cd frontend && pnpm dev
```