import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ocrRouter from './features/ocr/ocr.router';

dotenv.config();
const app = express();
app.use(cors({
  origin: '*', // En producción podrías limitarlo a tu dominio de Vercel
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Endpoint de salud para Render/Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/ocr', ocrRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    // Aquí estaba el error por falta de comillas invertidas (backticks)
    console.log(`[Server] Escuchando en http://localhost:${PORT}`);
});