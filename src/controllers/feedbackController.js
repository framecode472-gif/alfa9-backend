const Feedback = require('../models/Feedback');

const VALID_TYPES = ['Bug Report', 'Suggestion', 'Payment Issue', 'Other'];

// POST /api/feedback/submit   multipart/form-data: { type, message, images (up to 3 files) }
// req.files comes from the `upload.array('images', 3)` multer middleware (routes/feedbackRoutes.js)
exports.submitFeedback = async (req, res) => {
  try {
    const { type, message } = req.body;

    if (!message || message.trim().length < 10) {
      return res.status(400).json({ message: 'Please describe the issue in more detail (min 10 characters)' });
    }
    const feedbackType = VALID_TYPES.includes(type) ? type : 'Other';
    const imageList = (req.files || []).map(f => `/uploads/screenshots/${f.filename}`); // max 3, matches Feedback.jsx

    const feedback = await Feedback.create({
      userId: req.user.id,
      type: feedbackType,
      message: message.trim(),
      images: imageList
    });

    res.status(201).json({ message: 'Feedback submitted — our team reviews within 24 hours', feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/feedback/my-feedback
exports.getMyFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/feedback   (admin: view all feedback, newest first, with user id/info)
exports.getAllFeedback = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ['open', 'reviewed', 'resolved'].includes(status)) filter.status = status;

    const feedback = await Feedback.find(filter)
      .populate('userId', 'name email phone') // so admin panel can show which user sent it
      .sort({ createdAt: -1 });

    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/feedback/:id/reply   body: { reply }   (admin: reply to a user's feedback)
exports.replyToFeedback = async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim()) return res.status(400).json({ message: 'Reply text is required' });

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

    feedback.adminReply = reply.trim();
    feedback.repliedAt = new Date();
    feedback.repliedBy = req.user.id; // admin auth middleware sets req.user (role='admin'), not req.admin
    feedback.status = 'resolved';
    await feedback.save();

    res.json({ message: 'Reply sent', feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
