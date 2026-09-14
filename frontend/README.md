# ⚛️ Frontend — OCR Web

Aplicación web SPA desarrollada con React 19, TypeScript y Vite, siguiendo principios de Clean Architecture y Feature-Sliced Design simplificado.

## 🛠️ Stack Tecnológico

- **Framework:** React 19 + TypeScript
- **Bundler:** Vite 8 + Rolldown
- **Estilos:** Tailwind CSS + Shadcn/ui + Radix UI
- **Estado Global:** Zustand con persistencia en `localStorage`
- **OCR Offline:** Tesseract.js (WASM, `spa` + `eng`, `PSM.AUTO`)
- **Modo Oscuro:** `next-themes` con toggle accesible (`ThemeToggle`)
- **Testing:** Vitest (`useOcrStore.test.ts`, `textFormatters.test.ts`)
- **Exportación:** `docx` (.docx formateado) y `jszip` (.zip de archivos .txt)

## 📂 Estructura

```text
frontend/src/
 ┣ components/              # Componentes compartidos (Headers, ThemeToggle, ErrorBoundary)
 ┃ ┗ ui/                    # Primitivas Shadcn/Radix (Button, Dialog, Select, Tooltip, etc.)
 ┣ features/ocr/            # Módulo principal OCR
 ┃ ┗ components/            # Workspace, Dropzone, Editor, Viewer, Toolbars
 ┣ lib/                     # Utilidades ópticas, formateadores y exportadores
 ┃ ┣ addFilesFeedback.ts    # Toasts y métricas de carga
 ┃ ┣ exporters.ts           # Generador DOCX y ZIP
 ┃ ┣ imageDownscale.ts      # Reducción previa en canvas (1600px máx)
 ┃ ┣ tesseractAdapter.ts    # Motor local en Web Worker
 ┃ ┣ textFormatters.ts      # Reconstrucción silábica y limpieza forense
 ┃ ┗ utils.ts               # cn() para Tailwind
 ┣ shared/                  # Capa de red tipada (`api.ts`)
 ┗ store/                   # Store Zustand (`useOcrStore.ts`)
```

## 🚀 Scripts Disponibles

```bash
# Iniciar servidor de desarrollo (http://localhost:5173)
pnpm dev

# Compilar para producción (TypeScript + Vite)
pnpm build

# Ejecutar suite de pruebas unitarias
pnpm test

# Ejecutar linter
pnpm lint

# Vista previa de la compilación de producción
pnpm preview
```

## ⌨️ Atajos de Teclado

- `Ctrl + Enter` / `Cmd + Enter`: Iniciar procesamiento de toda la cola ("¡DALAAAA!").
- `Esc`: Cancelar el procesamiento en curso o cerrar modales.
- `Ctrl + F` / `Cmd + F`: Abrir buscador y reemplazo en el editor de texto extraído.
- `Ctrl + S` / `Cmd + S`: Descargar el apunte activo en `.txt`.
- `Flecha Arriba` / `Flecha Abajo`: Navegar entre archivos de la cola.
