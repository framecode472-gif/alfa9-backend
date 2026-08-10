const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./src/routes/authRoutes');
// (old instant-play gameController/gameRoutes removed — superseded by game-round)
const adminRoutes = require('./src/routes/adminRoutes');
const depositRoutes = require('./src/routes/depositRoutes');
const withdrawRoutes = require('./src/routes/withdrawRoutes');
const giftRoutes = require('./src/routes/giftRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const userRoutes = require('./src/routes/userRoutes');

// Phase 1 — Game Engine (round-based WinGo/K3/5D) — controllers are stubs for now
const gameRoundRoutes = require('./src/routes/gameRoundRoutes');

// Phase 3/4 — everything else that's pending — controllers are stubs for now
const activityRoutes = require('./src/routes/activityRoutes');
const otpRoutes = require('./src/routes/otpRoutes');
const feedbackRoutes = require('./src/routes/feedbackRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const vipRoutes = require('./src/routes/vipRoutes');
const gameStatsRoutes = require('./src/routes/gameStatsRoutes');
const safeRoutes = require('./src/routes/safeRoutes');
const promotionRoutes = require('./src/routes/promotionRoutes');
const spinRoutes = require('./src/routes/spinRoutes');
const chatbotRoutes = require('./src/routes/chatbotRoutes');

const app = express();
const server = http.createServer(app);

// ===== GLOBAL CRASH GUARDS =====
// Node kills the ENTIRE process by default on any uncaught exception or
// unhandled promise rejection — meaning one bad request anywhere (a typo, a
// missing await, a null reference) took the whole server down for every
// single user, requiring a manual `npm start` every time. These two
// handlers log the error and keep the server running instead. This is the
// standard resilience pattern for a live Node service — one failed request
// should never be able to kill service for everyone else.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled promise rejection (server kept running):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught exception (server kept running):', err);
});

const io = socketIo(server, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('🟢 Client connected:', socket.id);
  socket.on('disconnect', () => console.log('🔴 Client disconnected:', socket.id));
});

// Serve uploaded payment screenshots (e.g. /uploads/screenshots/xxx.jpg)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test route
app.get('/', (req, res) => res.send('🚀 Alfa-9 Backend is running!'));

// Use routes
app.use('/api/auth', authRoutes);
// (old instant-play /api/game route removed — superseded by /api/game-round, the real round-based engine)
app.use('/api/admin', adminRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/gift', giftRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/user', userRoutes); // was imported but never mounted — fixed

// Phase 1 — Game Engine
app.use('/api/game-round', gameRoundRoutes);

// Phase 3/4 — pending features (stub controllers, all return 501 for now)
app.use('/api/activity', activityRoutes);
app.use('/api', otpRoutes); // Settings.jsx calls /api/send-otp + /api/verify-otp directly
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/vip', vipRoutes);
app.use('/api/game-stats', gameStatsRoutes);
app.use('/api/safe', safeRoutes);
app.use('/api/promotion', promotionRoutes);
app.use('/api/spin', spinRoutes);
app.use('/api/chatbot', chatbotRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const { startRoundScheduler } = require('./src/jobs/roundScheduler');
    startRoundScheduler();
  })
  .catch(err => console.error('❌ MongoDB error:', err.message));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));