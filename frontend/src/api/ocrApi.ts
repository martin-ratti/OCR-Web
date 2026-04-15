import axios from 'axios';

export const uploadAndExtract = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await axios.post('http://localhost:3001/api/ocr/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (!response.data.success) throw new Error(response.data.error);
    return response.data.text;
};