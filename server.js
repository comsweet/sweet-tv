const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Adversus API-uppgifter - HÄMTAS FRÅN ENVIRONMENT VARIABLES
const ADVERSUS_CONFIG = {
    baseUrl: 'https://api.adversus.dk/v1',
    username: process.env.ADVERSUS_USERNAME || 'your_username_here',
    password: process.env.ADVERSUS_PASSWORD || 'your_password_here'
};

// Middleware
app.use(cors());
app.use(express.json());

// Servera static files från public mappen
app.use(express.static(path.join(__dirname, 'public')));

// Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    console.log('✅ Health check');
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Adversus Dashboard v2.0'
    });
});

// API Proxy - fångar alla /api/v1/* requests
app.use('/api/v1', async (req, res) => {
    const adversusUrl = `${ADVERSUS_CONFIG.baseUrl}${req.path}`;
    
    console.log(`📡 Proxying to: ${adversusUrl}`);
    console.log(`📋 Query:`, req.query);
    
    try {
        const response = await axios({
            method: req.method,
            url: adversusUrl,
            data: req.body,
            params: req.query,
            auth: {
                username: ADVERSUS_CONFIG.username,
                password: ADVERSUS_CONFIG.password
            },
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log(`✅ Success: ${response.status} - ${Array.isArray(response.data) ? response.data.length + ' items' : 'OK'}`);
        
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ API Error:', error.message);
        
        const status = error.response?.status || 500;
        const errorData = {
            error: error.message,
            details: error.response?.data || 'No details available'
        };
        
        res.status(status).json(errorData);
    }
});

// Admin-sida (ren statisk HTML)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback för SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Starta servern
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 Adversus Dashboard Server');
    console.log('='.repeat(60));
    console.log(`📍 Port: ${PORT}`);
    console.log(`💚 Health: /health`);
    console.log(`🔧 API Proxy: /api/v1/*`);
    console.log('='.repeat(60) + '\n');
});
