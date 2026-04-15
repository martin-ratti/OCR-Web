import { Request, Response, NextFunction } from "express";
import { OcrService } from "./ocr.service";
import { IExtractResponse } from "./ocr.schema";

export class OcrController {
  private ocrService: OcrService;

  constructor() {
    this.ocrService = new OcrService();
  }

  /**
   * Controlador para el endpoint encargado de recibir Form Data y enviarlo a Gemini
   */
  public extractText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Multer almacena la imagen en memoria en req.file
      if (!req.file) {
        res.status(400).json({
          status: "error",
          text: "",
          warnings: ["No se subió ninguna imagen. Asegúrate de enviar Form-Data con el campo 'image'."]
        } as IExtractResponse);
        return;
      }

      console.log(`[OCR Controller] Procesando archivo: ${req.file.originalname} (${req.file.mimetype}) - ${req.file.size} bytes`);

      const textResult = await this.ocrService.extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype
      );

      const responseBody: IExtractResponse = {
        status: "success",
        text: textResult
      };

      res.status(200).json(responseBody);
    } catch (error: any) {
      console.error("[OCR Controller] Falló extracción:", error.message);
      
      const isRateLimit = error.status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(error.message);
      const statusCode = isRateLimit ? 429 : 500;

      res.status(statusCode).json({
        status: "error",
        text: "",
        warnings: [error.message || "Error desconocido en el motor OCR"]
      } as IExtractResponse);
    }
  };
}
