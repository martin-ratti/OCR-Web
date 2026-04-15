import { create } from 'zustand';
import { uploadAndExtract } from '../api/ocrApi';

interface OcrState {
    extractedText: string;
    isProcessing: boolean;
    error: string | null;
    processImage: (file: File) => Promise<void>;
}

export const useOcrStore = create<OcrState>((set) => ({
    extractedText: '',
    isProcessing: false,
    error: null,
    processImage: async (file: File) => {
        set({ isProcessing: true, error: null, extractedText: '' });
        try {
            const text = await uploadAndExtract(file);
            set({ extractedText: text, isProcessing: false });
        } catch (err: any) {
            set({ error: err.message || 'Error desconocido', isProcessing: false });
        }
    }
}));