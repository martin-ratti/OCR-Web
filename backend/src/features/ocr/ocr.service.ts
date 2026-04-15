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
    const prompt = `ERES UN FILTRO ÓPTICO CROMÁTICO. Tu misión principal es extraer ÚNICAMENTE el texto que haya sido resaltado con marcador fluorescente.

REGLAS ABSOLUTAS:
1. FILTRO DE PÁRRAFOS: Analiza cada párrafo como un "bloque". Si un bloque entero es papel blanco puro sin color, IGNÓRALO por completo. JAMÁS transcribas párrafos que no estén resaltados.
2. LECTURA TOLERANTE: Si un párrafo sí está resaltado a color, transcríbelo completo de principio a fin de la marca. Ignora si el trazo del marcador es imperfecto, si hay espacios blancos naturales entre líneas, o si el color pierde fuerza al borde de la página. No cortes la lectura a la mitad por culpa de un mal trazado del fibrón.
3. RAZONAMIENTO OBLIGATORIO: Tu respuesta SIEMPRE debe comenzar con un bloque de análisis encerrado en etiquetas <ANALISIS> y </ANALISIS>. Dentro de él, indica qué párrafos ves pintados y cuáles en blanco.
4. RESULTADO: Después de </ANALISIS>, escribe "TEXTO FINAL:" y a continuación pega tu extracción. Si no hay nada resaltado, debajo de TEXTO FINAL: solo dirá "No se detectó texto resaltado en esta imagen.".
5. FORMATO NATURAL: El TEXTO FINAL debe ser plano. Fusiona los saltos de línea (enters) que corten palabras en la orilla derecha, dejando solo los saltos que separen párrafos. Sin asteriscos ni adornos de markdown.
6. COMPENSACIÓN: Evalúa la rotación del texto y endereza la lectura si la foto está de costado.`;

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

      // El SDK oficial de @google/genai expone 'text' como un atributo directo.
      let rawText = response.text ? response.text.trim() : "";
      
      // Limpiamos el Chain of Thought oculto del usuario
      if (rawText.includes("TEXTO FINAL:")) {
        rawText = rawText.split("TEXTO FINAL:")[1];
      } else if (rawText.includes("</ANALISIS>")) {
        rawText = rawText.split("</ANALISIS>")[1];
      }
      return rawText.trim();
    } catch (error: any) {
      console.error("[OcrService Error]:", error);
      throw new Error(`Google GenAI falló al procesar la imagen: ${error?.message || "Error desconocido"}`);
    }
  }
}
