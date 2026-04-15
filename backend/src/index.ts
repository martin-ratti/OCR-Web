import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ocrRouter from './features/ocr/ocr.router';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/ocr', ocrRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    // Aquí estaba el error por falta de comillas invertidas (backticks)
    console.log(`[Server] Escuchando en http://localhost:${PORT}`);
});