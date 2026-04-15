import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ocrRouter from './features/ocr/ocr.router';

dotenv.config();
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/ocr', ocrRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Server] Escuchando en http://localhost:${PORT}`);
});