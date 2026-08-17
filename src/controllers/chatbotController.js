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

SCREENSHOTS / ATTACHMENTS: The chat widget lets users attach a screenshot directly (there's a "+" attach button right in the chat). When a message in this conversation includes "[The user attached a payment screenshot with this message.]", that means an image has ALREADY been received and saved — do not ask them to send it again and do not ask if they have a screenshot. Instead, confidently acknowledge it and reassure them it's being worked on, e.g. (Roman Urdu) "Aapka issue dekh liya hai, iss par kaam chal raha hai, thodi der mein hal ho jayega" or (English) "I can see your screenshot — this is already being looked into and will be resolved shortly." Only ask for a screenshot the FIRST time, before one has been attached in this conversation.

DEPOSIT NOT RECEIVED (no screenshot yet): Ask them to attach a screenshot of the payment receipt using the attach button right here in the chat so the team can check it — don't guess a cause or a timeline yet.

WITHDRAWAL NOT RECEIVED YET: This is usually just normal bank/wallet processing time, not a real problem — say so plainly and calmly (Roman Urdu) "Withdrawal bank transaction mein thoda time le sakta hai, generally kuch der mein aa jata hai" or (English) "Bank/wallet transfers can take a little time to reflect — it usually comes through shortly." Don't tell them to attach a screenshot for this one unless they say it's been unusually long (several hours) — in that case ask for a screenshot of the withdrawal request so the team can check it.

IF THE USER SAYS IT'S STILL URGENT / NOT RESOLVED: After you've acknowledged their screenshot or explained the normal processing time, if they push back saying it's urgent or still not fixed, offer the direct contact so a real person can step in immediately: "Agar yeh urgent hai to Telegram (@the_john_David) pe seedha contact kar sakte hain." Don't lead with this on the first message about an issue — offer it as the next step only if they indicate it's still a problem.

TEAM / SALARY / HIRING / JOB QUESTIONS: If someone asks about joining the team, salary, jobs, partnerships, or anything that needs a real human/admin (not something you can answer from the platform info above), don't try to answer it yourself — immediately give them the official contact, nothing else:
- Telegram: @the_john_David (t.me/the_john_David)
- WhatsApp: +92 328 2287821 (wa.me/923282287821)
Tell them to reach out there for that kind of query. Keep this reply short — just the contact info and a one-line pointer, no lengthy explanation.

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

// ===== DELAYED AI REPLY =====
// WHY A DELAY AT ALL: replying in under a second makes it obvious it's a
// bot and feels impersonal. Waiting a random 2–3 minutes before the AI
// actually answers feels like a real support agent picking up the
// conversation, and gives a real admin a genuine window to jump in and
// reply personally instead — see adminReply below. If an admin does reply
// first, this function backs off instead of piling an AI answer on top.
//
// NOTE ON RELIABILITY: this uses a plain setTimeout, which lives only in
// this server process's memory. If Railway restarts the service in that
// 2–3 minute window (a deploy, a crash), that one pending reply is lost —
// acceptable for this scale, but worth knowing. A stuck/never-replied
// message will still show up for the admin to answer manually at any time.
async function processAiReply(sessionId, io) {
  try {
    const log = await ChatLog.findOne({ sessionId });
    if (!log) return;

    const lastUnseenUser = [...log.messages].reverse().find((m) => m.role === 'user' && !m.seen);
    if (!lastUnseenUser) return; // nothing new to reply to (already handled)

    const lastAdminMsg = [...log.messages].reverse().find((m) => m.role === 'admin');
    if (lastAdminMsg && lastAdminMsg.at > lastUnseenUser.at) {
      // A real admin already replied after this message — they've taken
      // over this conversation. Just mark it seen, skip the AI reply.
      log.messages.forEach((m) => { if (m.role === 'user') m.seen = true; });
      await log.save();
      io?.to(`chat:${sessionId}`).emit('chatSeen', { sessionId });
      return;
    }

    // Groq only understands 'user'/'assistant' roles — fold any admin
    // messages into 'assistant' so the AI sees the full conversation.
    const recentHistory = log.messages.slice(-20).map((m) => ({
      role: m.role === 'admin' ? 'assistant' : m.role,
      content: m.imageUrl
        ? `${m.content || ''}${m.content ? ' ' : ''}[The user attached a payment screenshot with this message.]`.trim()
        : m.content
    }));

    const groqMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...recentHistory];

    let reply;
    try {
      reply = await askGroq(groqMessages);
    } catch (e) {
      reply = "Sorry, I'm having trouble connecting right now — please try again in a moment, or reach out on Telegram (@the_john_David) if it's urgent.";
    }

    // The agent has now "read" everything up to this point.
    log.messages.forEach((m) => { if (m.role === 'user') m.seen = true; });
    log.messages.push({ role: 'assistant', content: reply, seen: true, at: new Date() });
    log.updatedAt = new Date();
    await log.save();

    const savedMsg = log.messages[log.messages.length - 1];
    io?.to(`chat:${sessionId}`).emit('chatMessage', { sessionId, message: savedMsg });
    io?.to('admin-chats').emit('chatUpdated', { sessionId });
  } catch (error) {
    console.error('processAiReply error:', error.message);
  }
}

// POST /api/chatbot/message   body: { message, sessionId, imageUrl? }
// No auth required — the self-service widget can be used by guests.
// Saves the message immediately and responds fast; the actual reply is
// generated later by processAiReply (see the delay note above) and
// delivered over socket.io — this endpoint does NOT return a reply anymore.
exports.sendMessage = async (req, res) => {
  try {
    const { message, sessionId, imageUrl } = req.body;
    const trimmed = (message || '').trim();
    if (!trimmed && !imageUrl) return res.status(400).json({ message: 'Message is required' });
    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const userId = getUserIdFromToken(req);

    let log = await ChatLog.findOne({ sessionId });
    if (!log) log = new ChatLog({ sessionId, userId, messages: [] });

    log.messages.push({ role: 'user', content: trimmed, imageUrl: imageUrl || null, seen: false, at: new Date() });
    log.updatedAt = new Date();
    if (userId && !log.userId) log.userId = userId; // attach once they log in mid-chat
    await log.save();

    // Let admin know a user is chatting right now — shows in the
    // notification bell and points them at the AI Chats tab.
    const who = userId ? `member ${userId.toString().slice(-6)}` : 'a guest';
    const preview = trimmed ? trimmed.slice(0, 80) : '(sent a screenshot)';
    notifyAdmin(req.io, 'chat', `New message from ${who}: "${preview}"`, 'AI Chat');
    req.io?.to('admin-chats').emit('chatUpdated', { sessionId });

    const delayMs = (120 + Math.random() * 60) * 1000; // 2–3 minutes
    setTimeout(() => processAiReply(sessionId, req.io), delayMs);

    res.status(202).json({ queued: true, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/chatbot/upload   multipart/form-data: { image }
// Used by the chat widget's "+" attach menu (screenshot / file). Public —
// guests can attach too, same as sendMessage.
//
// WHY A BASE64 DATA URI, NOT A DISK PATH: same reasoning as deposit
// screenshots (see depositController) — Railway wipes the local
// filesystem on every redeploy, so a saved file path 404s later. The
// `upload` middleware already uses memoryStorage (no disk write) for this
// exact reason; we just need to turn the buffer into a permanent data URI
// here instead of a path.
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    res.status(201).json({ url: dataUri });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/chatbot/history/:sessionId — reload a widget conversation on page refresh / reopen
exports.getHistory = async (req, res) => {
  try {
    const log = await ChatLog.findOne({ sessionId: req.params.sessionId });
    res.json({ messages: log ? log.messages : [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/chatbot/admin/all — admin: review self-service conversations
exports.getAllChatLogs = async (req, res) => {
  try {
    const logs = await ChatLog.find().populate('userId', 'name email').sort({ updatedAt: -1 }).limit(100);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/chatbot/admin/:sessionId/reply — admin sends a real reply,
// taking over from the AI for this conversation. Delivered instantly
// (no delay — this is a genuine human already at the keyboard).
exports.adminReply = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: 'Message is required' });

    const log = await ChatLog.findOne({ sessionId });
    if (!log) return res.status(404).json({ message: 'Conversation not found' });

    log.messages.forEach((m) => { if (m.role === 'user') m.seen = true; });
    log.messages.push({ role: 'admin', content: message.trim(), seen: true, at: new Date() });
    log.updatedAt = new Date();
    await log.save();

    const savedMsg = log.messages[log.messages.length - 1];
    req.io?.to(`chat:${sessionId}`).emit('chatMessage', { sessionId, message: savedMsg });
    req.io?.to('admin-chats').emit('chatUpdated', { sessionId });

    res.json({ message: savedMsg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/chatbot/admin/:sessionId/seen — admin opened this conversation
// in the panel; mark every user message as read so their "Seen" tick shows.
exports.markChatSeen = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const log = await ChatLog.findOne({ sessionId });
    if (!log) return res.status(404).json({ message: 'Conversation not found' });

    let changed = false;
    log.messages.forEach((m) => { if (m.role === 'user' && !m.seen) { m.seen = true; changed = true; } });
    if (changed) {
      await log.save();
      req.io?.to(`chat:${sessionId}`).emit('chatSeen', { sessionId });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};