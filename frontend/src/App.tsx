import React from 'react';
import { useOcrStore } from './store/ocrStore';

export default function App() {
    const { processImage, isProcessing, extractedText, error } = useOcrStore();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processImage(file);
    };

    return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
            <h1>💗 OCR Web - Green & Pink 💚</h1>
            <p>Sube tu imagen con texto resaltado y la IA extraerá solo lo importante.</p>
            
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={isProcessing} />
            
            {isProcessing && <p>⏳ Procesando con Gemini Vision API...</p>}
            {error && <p style={{ color: 'red' }}>❌ Error: {error}</p>}
            
            {extractedText && (
                <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
                    <h3>Texto Extraído:</h3>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{extractedText}</pre>
                </div>
            )}
        </div>
    );
}