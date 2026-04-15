import { Request, Response } from 'express';
import { OcrService } from './service';

const ocrService = new OcrService();

export const extractTextController = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No se proporcionó ninguna imagen." });
        }
        
        const text = await ocrService.extractHighlightedText(req.file.buffer, req.file.mimetype);
        return res.json({ success: true, text });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
};