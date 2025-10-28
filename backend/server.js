require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const apiRoutes = require('./routes/api');
const PollingService = require('./services/pollingService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve profile images
app.use('/profile-images', express.static(path.join(__dirname, 'data/profile-images')));

// API Routes
app.use('/api', apiRoutes);

// WebSocket
io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('📴 Client disconnected:', socket.id);
  });
});

// 📱 Start server with async initialization
async function startServer() {
  try {
    // 📱 NOTE: Cache initialization happens in PollingService.start()
    // dealsCache and smsCache will be loaded when polling starts
    console.log('🚀 Starting server...');

    // Start polling (this will initialize caches internally)
    const pollingService = new PollingService(io);
    app.set('pollingService', pollingService);
    pollingService.start();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`\n🚀 Sweet TV Backend running on port ${PORT}`);
      console.log(`📡 WebSocket ready`);
      console.log(`🔄 Polling active\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
