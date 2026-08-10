const mongoose = require('mongoose');

/**
 * Stores self-service chat widget conversations (Groq-powered support
 * agent) so admin can review what users are asking / where the bot
 * struggled. userId is null for guests chatting before login.
 */
const ChatLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sessionId: { type: String, required: true }, // groups messages into one conversation
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChatLogSchema.index({ sessionId: 1 });
ChatLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatLog', ChatLogSchema);
