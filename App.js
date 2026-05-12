import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');
    const [filesList, setFilesList] = useState([]);

    // استبدل هذا بالرابط المحلي للـ Worker (http://localhost:8787) أو رابط النشر (your-worker.workers.dev)
    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:8787'
        : 'https://initialsafety.abubakar7355.workers.dev'; // تم التحديث ليتوافق مع اسم الـ Worker في wrangler.toml

    const onFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const fetchFiles = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/files-list`);
            setFilesList(response.data);
        } catch (error) {
            console.error('Error fetching files:', error);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const onUpload = async () => {
        if (!file) {
            setStatus('الرجاء اختيار ملف أولاً');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            setStatus('جاري الرفع...');
            const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setStatus(response.data.message);
            fetchFiles(); // تحديث القائمة بعد الرفع بنجاح
        } catch (error) {
            console.error(error);
            setStatus('حدث خطأ أثناء الرفع');
        }
    };

    return (
        <div style={{ padding: '50px', textAlign: 'center', direction: 'rtl' }}>
            <h1>نظام تنظيم الملفات الإدارية</h1>
            <div style={{ margin: '20px' }}>
                <input type="file" onChange={onFileChange} />
            </div>
            <button
                onClick={onUpload}
                style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#4CAF50', color: 'white', border: 'none' }}
            >
                رفع وتنظيم الملف
            </button>
            <p>{status}</p>

            <hr style={{ margin: '40px 0' }} />

            <h2>الملفات المنظمة حالياً</h2>
            {filesList.length === 0 && <p style={{ color: '#888' }}>لا توجد ملفات مرفوعة حالياً.</p>}
            <ul style={{ listStyle: 'none', padding: 0, textAlign: 'right' }}>
                {filesList.map((file, index) => (
                    <li key={file.id || index} style={{ marginBottom: '10px', backgroundColor: '#f4f4f4', padding: '10px', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span>**{file.original_name}**</span>
                            <br />
                            <small style={{ color: '#666' }}>تاريخ الرفع: {new Date(file.upload_date).toLocaleString('ar-EG')}</small>
                        </div>
                        <a href={`${API_BASE_URL}/download/${file.stored_name}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2196F3', textDecoration: 'none', flexShrink: 0 }}>
                            فتح / تحميل
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default App;