const multer = require('multer');

// ===== WHY MEMORY STORAGE, NOT DISK =====
// Railway (like most container hosts) wipes the local filesystem on every
// redeploy/restart. Screenshots saved with diskStorage were disappearing
// after the very next deploy, leaving old Deposit records pointing at a
// file that no longer exists (404 "Route not found"). Storing the image
// bytes straight into MongoDB alongside the deposit record means the
// screenshot survives redeploys forever, exactly like the rest of the
// deposit data. See depositController.createDeposit for where the buffer
// gets turned into a base64 data URI and saved.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed for payment screenshots'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  // Kept well under MongoDB's 16MB document limit once base64-encoded
  // (base64 adds ~33% size), so an 8MB screenshot -> ~10.7MB encoded is safe.
  limits: { fileSize: 8 * 1024 * 1024 }
});

module.exports = upload;