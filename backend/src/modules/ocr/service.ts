import { GoogleGenAI } from '@google/genai';

export class OcrService {
    private ai: GoogleGenAI;

    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    }

    async extractHighlightedText(fileBuffer: Buffer, mimeType: string): Promise<string> {
        try {
            const prompt = "Actúa como un extractor de texto OCR avanzado. Analiza esta imagen y extrae ÚNICAMENTE el texto que está resaltado o marcado con colores (amarillo, verde, rosa, violeta, etc.). Ignora todo el texto normal que no esté resaltado. Devuelve solo el texto extraído, sin comentarios adicionales.";
            
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { data: fileBuffer.toString('base64'), mimeType } }
                        ]
                    }
                ]
            });

            return response.text || "No se encontró texto resaltado.";
        } catch (error) {
            console.error("[OcrService Error]:", error);
            throw new Error("Fallo en el procesamiento de IA. Verifica límites de tasa o API Key.");
        }
    }
}