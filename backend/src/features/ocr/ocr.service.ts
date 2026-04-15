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
    const prompt = `ERES UN FILTRO ÓPTICO CROMÁTICO ESTRICTO. Tu misión principal e inquebrantable es ignorar por completo el papel blanco y extraer ÚNICAMENTE el texto cruzado o pintado con marcador fluorescente.

REGLAS ABSOLUTAS (Si incumples alguna, fallarás irreparablemente):
1. NUNCA transcribas texto sobre papel blanco o gris. Debes ser un cirujano visual: si un párrafo no está pintado a color, IGNÓRALO por completo.
2. CORTE ABRUPTO: Si un párrafo o frase empieza pintada y la pintura se corta a la mitad, tu lectura también se corta ahí. Amputa todo lo blanco, aunque la frase quede incompleta.
3. RAZONAMIENTO OBLIGATORIO: Tu respuesta SIEMPRE debe comenzar con un bloque de análisis encerrado en etiquetas <ANALISIS> y </ANALISIS>. Dentro de él, tómate un momento para inspeccionar la geometría visual de la página y describe exactamente en una frase qué ves pintado y qué ves en blanco.
4. RESULTADO: Inmediatamente después de cerrar el tag </ANALISIS>, escribe o imprime "TEXTO FINAL:" y a continuación pega tu extracción. Si decidiste en el análisis que no hay nada resaltado, debajo de TEXTO FINAL: solo dirá "No se detectó texto resaltado en esta imagen.".
5. FORMATO: El TEXTO FINAL no debe tener asteriscos ni decoraciones, debe ser texto plano fusionando los saltos de línea (enters) que corten palabras debido al margen, dejando solo los verdaderos saltos de párrafo.
6. COMPENSACIÓN: Trata de rotar el texto mentalmente si la foto está de costado.`;

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
