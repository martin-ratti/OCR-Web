import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

export class OcrService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || ""
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
    const prompt = `ERES UN FILTRO ÓPTICO ESTRICTO. Tu única función es extraer el texto que se encuentra físicamente pintado o resaltado con un marcador fluorescente de color (ej. naranja, verde, amarillo) en el documento.

REGLAS ABSOLUTAS (Si incumples alguna, fallarás irreparablemente):
1. ESCANEO POR PALABRA: ESTÁ ESTRICTAMENTE PROHIBIDO transcribir letras o palabras que estén sobre un fondo de papel blanco normal. Solo puedes extraer LAS PALABRAS EXACTAS que tienen una capa de color encima o por debajo.
2. CORTE ABRUPTO: Si un párrafo empieza pintado a color y, de repente, la tinta brillante se corta, TU LECTURA DEBE CORTARSE EN ESA MISMA PALABRA y no leer el resto de la frase ni del párrafo. Tu deber es amputar toda palabra en fondo blanco, aunque la oración quede gramaticalmente incompleta.
3. Si tras tu escaneo visual concluyes que NO existía ningún trazo de color fosforescente sobre el papel, tu única y exclusiva respuesta debe ser: "No se detectó texto resaltado en esta imagen."
4. TEXTO PLANO NATURAL: Transcribe el texto extraído sin asteriscos, sin markdown y sin cabeceras. Fusiona los saltos de línea (enters) que ensucian los párrafos al llegar al margen derecho lógico de la hoja, de modo que cada párrafo sea un bloque continuo y fácil de leer.
5. COMPENSACIÓN DE ROTACIÓN: Si la imagen fue tomada de costado (apaisada), rota mentalmente la perspectiva antes de extraer el texto para que la lectura sea coherente e impecable.

Inicia tu escaneo cromático ahora:`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          prompt,
          { inlineData: { data: imageBuffer.toString("base64"), mimeType } }
        ],
        config: {
          temperature: 0.1, // Baja temperatura para ceñirse estrictamente al texto original
        }
      });

      // El SDK oficial de @google/genai expone 'text' como un atributo directo (getter), no como función.
      return response.text ? response.text.trim() : "";
    } catch (error: any) {
      console.error("[OcrService Error]:", error);
      throw new Error(`Google GenAI falló al procesar la imagen: ${error?.message || "Error desconocido"}`);
    }
  }
}
