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
    // 'admin' = a real human admin typed this directly in the AI Chats panel,
    // takes over from the AI for this conversation.
    role: { type: String, enum: ['user', 'assistant', 'admin'], required: true },
    content: { type: String, default: '' },
    // Base64 data URI of an attached screenshot, if any (see depositController
    // for why we store images as data URIs instead of disk paths — Railway
    // wipes local disk on every redeploy).
    imageUrl: { type: String, default: null },
    // Only meaningful for role:'user' messages — has admin/AI "read" this
    // yet? Flips true either when the delayed AI reply is generated, or
    // when admin opens this conversation in the panel. Drives the
    // Seen/Read indicator under the user's own sent messages.
    seen: { type: Boolean, default: false },
    at: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChatLogSchema.index({ sessionId: 1 });
ChatLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatLog', ChatLogSchema);