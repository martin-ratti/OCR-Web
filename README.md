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

`OCR Web` es una plataforma Fullstack de alto rendimiento diseñada para la extracción precisa de texto desde imágenes físicas o digitales. Surgida como la migración natural de una exitosa herramienta de escritorio en Python, esta plataforma reemplaza las complejas lógicas de pre-procesamiento manual (OpenCV HSV) y motores de reconocimiento heredados (Tesseract) por los avanzados modelos multimodales **Google Gemini API**. 

Esto significa una reducción extrema en la carga de la CPU, nulas dependencias binarias, y una precisión abrumadora incluso en documentos mal iluminados, mal escaneados o con ruido introducido por sombras. Todo el poder de la IA en una UI/UX moderna, fluida y amigable.

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
- 🧠 **Capa NLP/IA:** API `Google Gemini` (Visión Multimodal)
- 🛡️ **Validación / Procesamiento:** `Zod` para contratos y `Multer` para procesamiento óptico de buffers en memoria.

**Frontend:**
- ⚛️ **Framework UI:** React + Vite
- 🎨 **Estilado y Componentes:** Tailwind CSS, Shadcn/ui y Radix UI
- 🗃️ **Estado Global:** Zustand

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
- Una API Key válida de Google Gemini.

### 2. Preparación de Repositorio

Clona el repositorio e instala directamente las dependencias del Monorepo en la raíz:

```bash
pnpm install
```

### 3. Configuración de Entorno

Ingresa al directorio backend, genera el archivo de ambiente y pega tu Key:

```bash
cd backend
echo "GEMINI_API_KEY=tu_clave_aqui" > .env
```

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