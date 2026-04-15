import { Router } from "express";
import multer from "multer";
import { OcrController } from "./ocr.controller";

const router = Router();
const ocrController = new OcrController();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/extract", upload.single("image"), ocrController.extractText);

export default router;
