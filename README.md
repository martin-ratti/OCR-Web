# 💗 OCR Web - Green & Pink 💚 (Fullstack Edition)

Evolución web del Extractor de Texto OCR de escritorio, migrado a una arquitectura moderna Fullstack impulsada por IA (Google Gemini API).

## 🚀 Stack Tecnológico
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand, Shadcn/ui.
- **Backend:** Node.js, Express 5, TypeScript, Multer, Zod.
- **AI Core:** \@google/genai\ (Visión Multimodal).
- **Package Manager:** pnpm.

## 🏛️ Arquitectura
Diseño modular (Clean Architecture). La compleja lógica de visión artificial con OpenCV (HSV) ha sido reemplazada por prompts multimodales avanzados usando Gemini 1.5, lo que reduce la carga de CPU, elimina dependencias binarias (Tesseract) y mejora la precisión en documentos mal iluminados.