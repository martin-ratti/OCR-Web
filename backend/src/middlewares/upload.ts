import multer from 'multer';

// Almacenamos en memoria para pasar el buffer directamente a Gemini (sin escribir a disco)
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit por seguridad
});