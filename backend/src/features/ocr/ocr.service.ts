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

  public async extractTextFromBuffer(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const prompt = `ERES UN SISTEMA DE FILTRADO CROMÁTICO.
Tu ÚNICA misión es extraer ÚNICAMENTE el texto que está RESALTADO con marcador (fluorescente).

INSTRUCCIONES DE VISIÓN:
1. El texto que NO esté resaltado es INVISIBLE para vos. No lo transcribas bajo ninguna circunstancia.
2. Solo si una palabra tiene color encima, debes leerla.
3. Mantén la estructura de párrafos solo de la parte resaltada.
4. Ignora pies de página, números de página o encabezados si no están pintados.
5. No agregues comentarios, análisis ni explicaciones. 
6. Si la imagen está en blanco o no tiene resaltador, responde: "No se detectó texto resaltado en esta imagen."`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-1.5-flash-lite",
        contents: [
          prompt,
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } }
        ],
        config: {
          temperature: 0.1,
        }
      });

      let rawText = response.text ? response.text.trim() : "";
      return rawText;
    } catch (error: any) {
      console.error("[OcrService Error]:", error);
      throw error;
    }
  }
}
