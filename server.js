const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { 
  startScreenshotMonitoring, 
  stopScreenshotMonitoring, 
  getExistingScreenshots,
  askAI 
} = require('./ask-ai');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active watchers and chat history
let globalWatcher = null;
let connectedClients = new Set();
let currentQuestionType = 'single';

// Function to broadcast to all clients
function broadcastToAll(event, data) {
  connectedClients.forEach(socketId => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  });
}

// Function to start global monitoring
function startGlobalMonitoring() {
  if (globalWatcher) {
    console.log('⚠️ Monitoring already active');
    return;
  }
  
  console.log('🔍 Starting global screenshot monitoring...');
  
  globalWatcher = startScreenshotMonitoring(currentQuestionType, (type, message, data) => {
    const logData = {
      type,
      message,
      timestamp: new Date().toLocaleString('id-ID')
    };
    
    if (data) {
      logData.screenshotResult = data;
    }
    
    // Broadcast to all connected clients
    broadcastToAll('log', logData);
    
    // If it's a result, also send as screenshot-result
    if (type === 'result' && data) {
      broadcastToAll('screenshot-result', {
        ...data,
        timestamp: new Date().toLocaleString('id-ID')
      });
    }
  });
  
  if (globalWatcher) {
    console.log('✅ Global monitoring started');
    broadcastToAll('monitoring-status', { active: true });
  }
}

// Function to stop global monitoring
function stopGlobalMonitoring() {
  if (globalWatcher) {
    stopScreenshotMonitoring(globalWatcher);
    globalWatcher = null;
    console.log('🛑 Global monitoring stopped');
    broadcastToAll('monitoring-status', { active: false });
  }
}

// Function to update question type for all monitoring
function updateQuestionType(newType) {
  currentQuestionType = newType;
  
  // Restart monitoring with new question type if active
  if (globalWatcher) {
    console.log(`🔄 Updating question type to: ${newType}`);
    stopGlobalMonitoring();
    setTimeout(() => {
      startGlobalMonitoring();
    }, 1000);
  }
}

// Start monitoring automatically when server starts
setTimeout(() => {
  console.log('🚀 Auto-starting screenshot monitoring...');
  startGlobalMonitoring();
}, 2000);

// Socket connection handling
io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);
  connectedClients.add(socket.id);
  
  // Send current monitoring status
  socket.emit('monitoring-status', { active: !!globalWatcher });
  
  // Send existing screenshots on connection
  try {
    const existingScreenshots = getExistingScreenshots();
    socket.emit('existing-screenshots', existingScreenshots);
    socket.emit('log', { 
      type: 'info', 
      message: `📁 Ditemukan ${existingScreenshots.length} screenshot existing`,
      timestamp: new Date().toLocaleString('id-ID')
    });
  } catch (error) {
    socket.emit('log', { 
      type: 'error', 
      message: `❌ Error loading existing screenshots: ${error.message}`,
      timestamp: new Date().toLocaleString('id-ID')
    });
  }
  
  // Send welcome message
  socket.emit('log', { 
    type: 'success', 
    message: '🎉 Terhubung ke AI Screenshot Monitor! Monitoring otomatis sudah aktif.',
    timestamp: new Date().toLocaleString('id-ID')
  });
  
  // Handle question type change
  socket.on('change-question-type', (data) => {
    try {
      const { questionType } = data;
      console.log(`📝 Question type changed to: ${questionType}`);
      
      updateQuestionType(questionType);
      
      broadcastToAll('log', { 
        type: 'info', 
        message: `📝 Jenis pertanyaan diubah ke: ${questionType === 'multiple' ? 'Jawaban Multiple' : 'Jawaban Single'}`,
        timestamp: new Date().toLocaleString('id-ID')
      });
      
    } catch (error) {
      socket.emit('log', { 
        type: 'error', 
        message: `❌ Error changing question type: ${error.message}`,
        timestamp: new Date().toLocaleString('id-ID')
      });
    }
  });
  
  // Handle manual restart (if needed)
  socket.on('restart-monitoring', () => {
    try {
      console.log('🔄 Manual restart requested');
      socket.emit('log', { 
        type: 'info', 
        message: '🔄 Restart monitoring...',
        timestamp: new Date().toLocaleString('id-ID')
      });
      
      stopGlobalMonitoring();
      setTimeout(() => {
        startGlobalMonitoring();
      }, 2000);
      
    } catch (error) {
      socket.emit('log', { 
        type: 'error', 
        message: `❌ Error restarting monitoring: ${error.message}`,
        timestamp: new Date().toLocaleString('id-ID')
      });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('📱 Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
    
    // If no more clients connected, optionally stop monitoring
    // (Comment out if you want monitoring to continue even without clients)
    /*
    if (connectedClients.size === 0) {
      console.log('📵 No clients connected, stopping monitoring...');
      stopGlobalMonitoring();
    }
    */
  });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  stopGlobalMonitoring();
  server.close(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  stopGlobalMonitoring();
  server.close(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('📁 Auto screenshot monitoring will start in 2 seconds...');
});