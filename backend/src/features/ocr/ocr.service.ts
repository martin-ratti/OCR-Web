import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

export class OcrService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      apiVersion: "v1"
    });
  }

  /**
   * Extrae texto de una imagen utilizando Google Gemini Vision.
   * La lógica multimodal reemplaza completamente y con mayor exactitud
   * la detección HSV y Tesseract implementada en la versión Python.
   * 
   * @param imageBuffer El formato de memoria subido desde multer.
   * @param mimeType El tipo mime (ej: image/png).
   * @returns El texto extraído en formato Markdown limpio.
   */
  public async extractTextFromBuffer(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const prompt = `Actúa como un experto en OCR especializado en documentos académicos.
Tu tarea es extraer el texto resaltado con marcador (fluorescente) de la imagen.

INSTRUCCIONES:
1. Extrae únicamente el texto que tiene color de resaltador por encima.
2. Mantén la estructura original de párrafos del texto resaltado.
3. Ignora anotaciones al margen o pies de página a menos que estén resaltados.
4. Si hay palabras cortadas al final de una línea por la orilla de la página, júntalas correctamente.
5. No incluyas explicaciones, encabezados como "Extracción:" o análisis adicionales. Solo devuelve el texto limpio.
6. Si no hay texto resaltado, responde exactamente: "No se detectó texto resaltado en esta imagen."`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [
          prompt,
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } }
        ],
        config: {
          temperature: 0.1, // Baja temperatura para ceñirse estrictamente al texto original
        }
      });

      // El SDK oficial de @google/genai expone 'text' como un atributo directo.
      let rawText = response.text ? response.text.trim() : "";
      
      // El prompt ahora es directo, así que devolvemos el texto tal cual (limpio de espacios)
      return rawText;
    } catch (error: any) {
      console.error("[OcrService Error]:", error);
      // Propagamos el error de forma que el controlador pueda detectar el status 429 si existe
      throw error;
    }
  }
}
