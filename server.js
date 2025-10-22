const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

// Adversus API-uppgifter - HÄMTAS FRÅN ENVIRONMENT VARIABLES
const ADVERSUS_CONFIG = {
  baseUrl: 'https://api.adversus.dk/v1',
  username: process.env.ADVERSUS_USERNAME || 'your_username_here',
  password: process.env.ADVERSUS_PASSWORD || 'your_password_here'
};

// ------- Keep-alive agenter (färre sockets, stabilare) -------
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });

// ------- Global enkel kö: serialisera API-anrop -------
let queue = Promise.resolve();
const QUEUE_DELAY_MS = 250;     // spacing mellan proxade anrop
const MAX_PROXY_RETRIES = 4;    // 429-retry i proxyn
const BASE_BACKOFF_MS = 800;    // backoff-bas i proxyn

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

// ------------- API Proxy (serialiserad via kö) -------------
app.use('/api/v1', async (req, res) => {
  queue = queue.then(async () => {
    const adversusUrl = `${ADVERSUS_CONFIG.baseUrl}${req.path}`;
    console.log(`📡 Proxy→ ${adversusUrl}`, req.query || '');

    let attempt = 0;
    while (true) {
      attempt++;
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
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,          // ↑ 120s timeout (var 30s)
          httpAgent,
          httpsAgent,
          validateStatus: () => true
        });

        // 429 från Adversus → backoff och försök igen
        if (response.status === 429 && attempt <= MAX_PROXY_RETRIES) {
          const retryAfter = Number(response.headers?.['retry-after']) || 0;
          const wait = retryAfter ? retryAfter * 1000 : BASE_BACKOFF_MS * attempt;
          console.warn(`🔁 429 från Adversus, backoff ${wait} ms (försök ${attempt})`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }

        // Returnera responsen som den är (inkl. 4xx/5xx)
        res.status(response.status).json(response.data);
        break;
      } catch (error) {
        // Axios-transportfel/timeout => 502 (så vi ser att det är proxyn)
        console.error('❌ Proxy transport error:', error.message);
        res.status(502).json({
          error: 'proxy_transport_error',
          details: error.message || 'No details'
        });
        break;
      }
    }
  })
  .catch(err => {
    console.error('❌ Proxy queue error:', err);
    try { res.status(500).json({ error: 'proxy_queue_error', details: String(err) }); }
    catch {}
  })
  .finally(async () => {
    // spacing mellan jobben – viktigt för att undvika "too many active requests"
    await new Promise(r => setTimeout(r, QUEUE_DELAY_MS));
  });
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
  console.log(`🔧 API Proxy: /api/v1/* (queued, keep-alive, 120s timeout)`);
  console.log('='.repeat(60) + '\n');
});
