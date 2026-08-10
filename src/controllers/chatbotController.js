const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ChatLog = require('../models/ChatLog');
const { askGroq } = require('../utils/groqClient');
const { notifyAdmin } = require('./notificationController');

const JWT_SECRET = 'mySuperSecretKey123'; // same as middleware/auth.js

const SYSTEM_PROMPT = `You are the Alfa9 support agent — a friendly, professional customer support assistant for Alfa9, an online gaming/betting platform (WinGo, K3, and 5D lottery-style games).

LANGUAGE: Always reply in the same language the user just wrote in. If they write in English, reply in English. If they write in Urdu or Roman Urdu (Urdu written in English letters), reply in casual Roman Urdu. Never switch language on your own — match the user's most recent message.

What you can help with:
- Explaining how the platform works: Deposit, Withdraw, VIP levels & EXP, the Safe (savings vault with daily interest), Wheel Spin (unlocked by daily deposits), Attendance Bonus, Betting Rebate, Invitation/Promotion (referral) program, and how WinGo/K3/5D betting works.
- General account questions, navigation help, and explaining platform rules.
- Being warm, concise, and clear — most users are on mobile and want quick answers.

DEPOSIT / WITHDRAWAL NOT RECEIVED: If a user says their deposit or withdrawal hasn't arrived / been credited, don't guess a cause or a timeline. Ask them to share a screenshot of the transaction (payment receipt / withdrawal request) so the team can check it — tell them they can attach it right here in the chat, or submit it via the Feedback page if the chat can't take attachments yet.

TEAM / SALARY / HIRING / JOB QUESTIONS: If someone asks about joining the team, salary, jobs, partnerships, or anything that needs a real human/admin (not something you can answer from the platform info above), don't try to answer it yourself — give them the official contact:
- Telegram: @Saifmarko (t.me/Saifmarko)
- WhatsApp: +92 316 3533206 (wa.me/923163533206)
Tell them to reach out there for that kind of query.

What you must NOT do:
- Never claim to see or change a specific user's real balance, deposits, withdrawals, or bet history — you don't have live access to their account. If asked, explain you can't view live account data and direct them to check the relevant page in the app (Account > Wallet, Account > Transaction, etc.) or to submit a Feedback ticket for account-specific issues.
- Never promise bonuses, refunds, or make up numbers/rates you're not sure of.
- Never encourage chasing losses or depositing more than someone can afford — if a user sounds distressed about losses, gently suggest taking a break and point them to Feedback/support.
- Keep replies short (2-4 sentences) unless the user asks for a detailed explanation.

If you don't know something specific to this platform and it isn't a team/salary/hiring question, say so plainly and suggest they use the Feedback page or the Telegram/WhatsApp contact above so the Alfa9 team can follow up.`;

function getUserIdFromToken(req) {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '').trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id;
  } catch {
    return null; // guest — chatbot works without login too
  }
}

// POST /api/chatbot/message   body: { message, sessionId, history? }
// No auth required — the self-service widget can be used by guests.
exports.sendMessage = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: 'Message is required' });
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const userId = getUserIdFromToken(req);

    let log = await ChatLog.findOne({ sessionId });
    if (!log) log = new ChatLog({ sessionId, userId, messages: [] });

    // Keep only the last 10 turns as context so requests stay small/fast
    const recentHistory = log.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));

    const groqMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentHistory,
      { role: 'user', content: message.trim() }
    ];

    const reply = await askGroq(groqMessages);

    log.messages.push({ role: 'user', content: message.trim() });
    log.messages.push({ role: 'assistant', content: reply });
    log.updatedAt = new Date();
    if (userId && !log.userId) log.userId = userId; // attach once they log in mid-chat
    await log.save();

    // Let admin know a user is chatting with the AI agent right now — shows
    // in the notification bell and points them at the new "AI Chats" tab.
    const who = userId ? `member ${userId.toString().slice(-6)}` : 'a guest';
    notifyAdmin(req.io, 'chat', `New message from ${who}: "${message.trim().slice(0, 80)}"`, 'AI Chat');

    res.json({ reply, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/chatbot/upload   multipart/form-data: { image }
// Used by the chat widget's "+" attach menu (screenshot / file). Public —
// guests can attach too, same as sendMessage. Returns a URL the frontend
// then shows in the chat bubble and sends along in a follow-up /message call.
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const url = `/uploads/screenshots/${req.file.filename}`;
    res.status(201).json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/chatbot/history/:sessionId — reload a widget conversation on page refresh
exports.getHistory = async (req, res) => {
  try {
    const log = await ChatLog.findOne({ sessionId: req.params.sessionId });
    res.json({ messages: log ? log.messages : [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/chatlogs — admin: review self-service conversations
exports.getAllChatLogs = async (req, res) => {
  try {
    const logs = await ChatLog.find().populate('userId', 'name email').sort({ updatedAt: -1 }).limit(100);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};