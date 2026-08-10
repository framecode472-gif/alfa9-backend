// Shared helpers for generating unique numeric identifiers (UID, referral
// codes). Used by authController at registration time and by userController
// to lazily backfill a UID for accounts created before this field existed.

async function generateUniqueUidForModel(UserModel) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const uid = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const exists = await UserModel.findOne({ uid }).select('_id');
    if (!exists) return uid;
  }
  return String(Date.now()).slice(-6);
}

async function generateUniqueReferralCodeForModel(UserModel) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000000 + Math.random() * 900000000)); // 9 digits
    const exists = await UserModel.findOne({ referralCode: code }).select('_id');
    if (!exists) return code;
  }
  return String(Date.now()).slice(-9);
}

module.exports = { generateUniqueUidForModel, generateUniqueReferralCodeForModel };