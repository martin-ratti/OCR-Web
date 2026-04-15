import { Router } from "express";
import multer from "multer";
import { OcrController } from "./ocr.controller";

const router = Router();
const ocrController = new OcrController();

// Configuración de Multer: Almacenamos el archivo temporalmente en memoria como un Buffer
const storage = multer.memoryStorage();
// Limitamos a 5MB por imagen por seguridad
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware `upload.single('image')` intercepta la imagen subida
router.post("/extract", upload.single("image"), ocrController.extractText);

export default router;
