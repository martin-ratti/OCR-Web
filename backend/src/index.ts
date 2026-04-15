import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ocrRouter } from './modules/ocr/router';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/ocr', ocrRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(\[Server] Escuchando en http://localhost:\\);
});