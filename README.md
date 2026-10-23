<div align="center">
  <h1>✨ OCR Web Monorepo</h1>
  <p><strong>Evolución web del Extractor de Texto OCR de escritorio, migrado a una arquitectura moderna Fullstack impulsada por IA y WebGPU.</strong></p>
  <br />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
  <img src="https://img.shields.io/badge/WebGPU-005A9C?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU">
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

La app ofrece **dos modos de extracción** (**Solo resaltador** y **Página entera**) combinables con **tres motores de OCR seleccionables** desde la UI:

- 🌸 **Gemini Flash-Lite (Cascada IA)** (`gemini-3.5-flash-lite` con failover automático a `gemini-3.5-flash`, `gemini-2.5-flash-lite` y `gemini-2.5-flash`) — Visión multimodal de Google con `systemInstruction` optimizada, presupuesto de razonamiento acotado y pre-filtro cromático en cliente (*Zero-Quota Waste*) para no gastar cuota en hojas sin marcador.
- ⚡ **Groq Qwen 3.8** (`qwen/qwen3.8-27b`) — Visión multimodal vía endpoint OpenAI-compatible con inferencia LPU ultrarrápida. Soporta tanto extracción selectiva de resaltados como transcripción forense completa, con limpieza automática de etiquetas `<think>`.
- 💻 **Local PP-OCRv6 (WebGPU / WASM)** — Corre **100% en el navegador** dentro de un Web Worker dedicado usando `paddleocr` + `onnxruntime-web` (inspirado en `runonweb.ai`), cacheando los pesos ONNX (`PP-OCRv6_small`, ~31 MB) en `CacheStorage`. Sin cuota, sin red tras la primera carga, con balance de blancos adaptativo para hojas beige/luz cálida y overlay interactivo de regiones detectadas.

## 🏛 Arquitectura "EstacionAR"

El proyecto adopta el concepto arquitectónico estricto de Clean Architecture bautizado internamente como *"EstacionAR"*:

- **Clean Architecture Modular**: Tanto el frontend como el backend aíslan completamente cada *feature* en módulos auto-contenidos, promoviendo una escalabilidad robusta.
- **Flujo Backend (Node/Express)**: La lógica expuesta a través de la API cuenta con la separación de:
  `Router` ➡️ `Controller` ➡️ `Service` (gestión pura de Gemini/Groq AI, cascada anti-429 y reglas de negocio) ➡️ `Repository` / `Adapter`.
- **Flujo Frontend (React)**: Diseño inspirado en *Feature-Sliced Design* (FSD) simplificado. La capa de presentación visual (Shadcn/Tailwind) es agnóstica de los manejos asincrónicos, confiando su lógica al Store Global (`Zustand`), Web Workers dedicados y a la capa de Red (`fetch` nativo).
- **Tipado de Extremo a Extremo (E2E)**: Validaciones irrompibles con `Zod`, infiriendo y consumiendo los mismos esquemas lógicos en ambos extremos de la aplicación (`@ocr-web/shared`).
- **Post-Procesamiento Inteligente y Anti-Galimatías**: Reconstrucción de palabras cortadas por guiones de fin de línea (`cons-\ntitución`), eliminación de soft hyphens invisibles, filtro léxico español contra fragmentos corruptos y protección de viñetas, listas y notas al pie.

## 🛠 Stack Tecnológico

**Core & Herramientas:**
- 📦 **Gestor de Paquetes:** `pnpm` (Exclusivo por velocidad y estricto control de dependencias)
- 📝 **Lenguaje Base:** `TypeScript` E2E
- 🧪 **Testing:** `Vitest` + `Supertest` en Backend y Frontend (`pnpm test`)

**Backend:**
- ⚙️ **Runtime:** Node.js + Express 5
- 🧠 **Capa NLP/IA:** Adaptadores intercambiables — `GeminiOcrAdapter` (`@google/genai` con cadena de modelos Flash/Lite) y `GroqOcrAdapter` (REST OpenAI-compatible)
- 🛡️ **Validación / Seguridad:** `Zod` para contratos, `Multer` para buffers en memoria y verificación binaria de firmas de archivo (*Magic Bytes*: JPEG, PNG, WebP, GIF, HEIC).

**Frontend:**
- ⚛️ **Framework UI:** React + Vite
- 🎨 **Estilado y Componentes:** Tailwind CSS, Shadcn/ui y Radix UI
- 🌗 **Modo Oscuro:** `next-themes` con toggle accesible y paleta oscura de alto contraste en todo el workspace
- 🗃️ **Estado Global:** Zustand con persistencia y caché acotada segregada por motor y modo (`${engine}::${mode}::${filename}::${size}`)
- 🔤 **OCR en Navegador:** `paddleocr` + `onnxruntime-web` (PP-OCRv6 en Web Worker con aceleración WebGPU y fallback WASM), rotación automática y detector cromático de resaltador con balance de blancos local.

## 📂 Estructura del Proyecto

Al ser un ecosistema **Monorepo pnpm**, el core del código se divide en Workspaces enlazados logísticamente:

```text
📦 OCR-Web-Monorepo
 ┣ 📂 packages/shared/  # Contratos Zod E2E compartidos (@ocr-web/shared)
 ┣ 📂 backend/          # API (Node.js/Express) encapsulando el procesador de IA
 ┃ ┣ 📂 src/
 ┃ ┣ 📜 package.json
 ┃ ┗ 📜 .env
 ┣ 📂 frontend/         # SPA (React + WebGPU Worker) consumiendo contratos estrictos
 ┃ ┣ 📂 src/
 ┃ ┣ 📂 public/
 ┃ ┣ 📜 package.json
 ┃ ┗ 📜 vite.config.ts
 ┣ 📜 package.json      # Punto de entrada para scripts pnpm (Workspaces)
 ┣ 📜 .cursorrules      # Reglas arquitectónicas inter-sistemas para uso de la IA
 ┗ 📜 README.md         # Documentación Maestra (Tú estás aquí)
```

## 🚀 Instalación y Uso

> **Nota:** Este proyecto requiere estrictamente utilizar **pnpm** para la instalación. NPM o Yarn generarán conflictos en el Lockfile de los Workspaces.

### 1. Requisitos Previos
- Node.js (v20 o superior).
- pnpm instalado globalmente (`npm install -g pnpm`).
- *(Opcional)* API Key de [Google AI Studio](https://aistudio.google.com/) para el motor **Gemini**.
- *(Opcional)* API Key de [Groq Console](https://console.groq.com/keys) para el motor **Groq** (recomendado para lotes grandes en nube).
- *(Ninguna)* — el motor **Local PP-OCRv6** corre en el navegador (WebGPU/WASM) y no necesita keys ni backend.

### 2. Preparación de Repositorio

Clona el repositorio e instala directamente las dependencias del Monorepo en la raíz:

```bash
pnpm install
```

### 3. Configuración de Entorno

Ingresá al directorio backend, generá el archivo de ambiente y pegá las keys que quieras habilitar (todas son opcionales — sin ninguna igual funciona el motor Local):

```bash
cd backend
cat > .env <<EOF
GEMINI_API_KEY=tu_clave_de_google_ai_studio
GROQ_API_KEY=tu_clave_de_groq
EOF
```

Variables soportadas (todas con defaults razonables):

| Variable                 | Default                                                        | Descripción                                                                              |
|--------------------------|----------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `GEMINI_API_KEY`         | —                                                              | Necesaria si alguien selecciona el motor Gemini.                                         |
| `GEMINI_MODEL_ID`        | `gemini-3.5-flash-lite`                                        | Modelo primario ligero (nunca usar variantes `pro`).                                     |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.5-flash,gemini-2.5-flash-lite,gemini-2.5-flash`      | Cadena de respaldo automático ante 429/503 por modelo.                                   |
| `GROQ_API_KEY`           | —                                                              | Necesaria si alguien selecciona el motor Groq.                                           |
| `GROQ_MODEL_ID`          | `qwen/qwen3.8-27b`                                             | Modelo multimodal activo en Groq LPU.                                                    |
| `PORT`                   | `3001`                                                         | Puerto HTTP local.                                                                       |
| `NODE_ENV`               | `development`                                                  | `development` / `production` / `test`.                                                   |
| `ALLOWED_ORIGINS`        | `http://localhost:5173,http://localhost:4173`                  | CORS whitelist separada por comas. Usar `*` sólo en dev.                                 |

### 4. Lanzamiento

Levanta simultáneamente el Backend y Frontend interactuando con los workspaces (desde la raíz):

```bash
# Desde la raíz del monorepo:
pnpm dev

# Alternativa manual por instancias:
# En terminal 1:
cd backend && pnpm dev
# En terminal 2:
cd frontend && pnpm dev
```

### 5. Pruebas Automatizadas

Para ejecutar la suite completa de pruebas unitarias y de integración en todo el monorepo:

```bash
pnpm test
```
