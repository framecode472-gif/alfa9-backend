const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    unique: true,
    sparse: true // allows multiple docs with no email (phone-only accounts)
  },
  password: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String,
    unique: true,
    sparse: true
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  coins: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['active', 'blocked'], 
    default: 'active' 
  },
  // ===== SAFE / FUND PASSWORD (for Account/Safe page) =====
  fundPassword: {
    type: String, // bcrypt-hashed 6-digit PIN, separate from login password
    default: null
  },
  // ===== SAFE (interest-bearing vault, Account/Safe page) =====
  safe: {
    balance: { type: Number, default: 0 },             // principal currently parked in the safe
    generatedRevenue: { type: Number, default: 0 },     // interest earned since last transfer (paid out + reset on next transfer)
    accumulatedRevenue: { type: Number, default: 0 },   // lifetime interest earned, never resets
    lastCalcAt: { type: Date, default: Date.now }        // last time interest was accrued (lazy accrual, see utils/safeInterest.js)
  },

  // ===== VIP (see VipTier model + vipController) =====
  vip: {
    exp: { type: Number, default: 0 },              // lifetime EXP (Bet Rs100 = 1 EXP)
    level: { type: Number, default: 0 },             // cached current level, 0 = no VIP yet
    levelSince: { type: Date, default: Date.now },    // when current level was reached — starts the 30-day maintenance clock + the "1 level per day" gate
    maintenanceExpStart: { type: Number, default: 0 }, // exp snapshot at levelSince, so progress = exp - maintenanceExpStart
    levelUpClaimed: [{ type: Number }],               // levels whose one-time level-up bonus has been claimed
    lastMonthlyClaim: { type: String, default: null } // "YYYY-MM" of the last month monthly reward was claimed
  },
  // ===== UNIQUE NUMERIC UID (shown on Account page) =====
  // Previously the frontend derived this by slicing the Mongo _id, which is
  // hex (0-9a-f) — so it could show letters like "a81e9b" instead of pure
  // digits, and wasn't guaranteed unique on its own once truncated. This is
  // a real 6-digit numeric id, generated once at registration and checked
  // for collisions (see authController.generateUniqueUid).
  uid: {
    type: String,
    unique: true,
    sparse: true
  },
  // ===== SAVED WITHDRAWAL ACCOUNTS (Account/Withdraw.jsx) =====
  // Previously stored only in the browser's localStorage under a
  // non-user-scoped key, so every account logged into on the same browser/
  // device saw the SAME saved Easypaisa/JazzCash number — a real bug where
  // a new account appeared to already have someone else's wallet attached.
  // Now persisted per-user on the backend.
  withdrawAccounts: {
    Easypaisa: { name: { type: String, default: null }, number: { type: String, default: null } },
    JazzCash: { name: { type: String, default: null }, number: { type: String, default: null } }
  },
  // ===== REFERRAL FIELDS (NEW) =====
  referralCode: { 
    type: String, 
    unique: true,
    sparse: true // allows null values
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  referralCount: { 
    type: Number, 
    default: 0 
  },
  // ===== REFERRAL SPIN WHEEL =====
  // Separate from the deposit-based wheel (user.spin below) — every time
  // someone this user referred gets an APPROVED deposit, this user earns
  // +1 spin here (see grantReferralSpin in utils/spinRewards.js, hooked
  // into depositController.approveDeposit / adminController.approveDepositAdmin).
  referralSpinsAvailable: {
    type: Number,
    default: 0
  },
  // Lifetime count of times this user has won the top Rs1000 referral-spin
  // prize — capped at 2 ever, and only reachable at all once referralCount
  // reaches 20+. See pickReferralPrize in utils/spinRewards.js.
  referral1000Wins: {
    type: Number,
    default: 0
  },
  uplineChain: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // [L1 direct upline, L2, ... up to L6] — powers Promotion/SubordinateData tier filters
  // ===== ACTIVITY (Attendance streak — Activity/subpages/AttendanceBonus.jsx) =====
  activity: {
    attendanceStreak: { type: Number, default: 0 },        // 1-7, cycles back to 1 after day 7
    attendanceCollectedDays: [{ type: Number }],            // days collected in the CURRENT 7-day cycle
    lastAttendanceDate: { type: String, default: null }     // "YYYY-MM-DD" — a gap resets the streak
  },
  // ===== WAGERING / TURNOVER REQUIREMENT (gates withdrawals) =====
  // "Need to bet before you can withdraw" rule: every approved deposit adds
  // its amount to `required` (1x rollover). Every bet a user places adds its
  // stake to `completed`. A withdrawal is only allowed once
  // completed >= required. Admin can override `required` directly from the
  // admin panel (Users tab) to raise/lower/clear a specific user's
  // requirement — e.g. to deliberately delay someone's withdrawal.
  wagering: {
    required: { type: Number, default: 0 },   // total turnover (Rs) needed before next withdrawal
    completed: { type: Number, default: 0 },  // turnover done so far towards `required`
    note: { type: String, default: null },    // optional admin note, e.g. why it was changed
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null }
  },
  // ===== SPIN WHEEL (Spin.jsx — daily deposit-tier spins, resets every day) =====
  spin: {
    dailyDepositTotal: { type: Number, default: 0 },  // today's cumulative approved deposits, resets daily
    totalSpinsToday: { type: Number, default: 0 },     // cumulative spins unlocked today per SPIN_TIERS
    spinsUsedToday: { type: Number, default: 0 },
    totalWonToday: { type: Number, default: 0 },        // hard-capped at SPIN_DAILY_WIN_CAP, see utils/spinRewards.js
    lastResetDate: { type: String, default: null }      // "YYYY-MM-DD", drives the daily reset
  },
  // ==================================
  // ===== SINGLE-DEVICE SESSION (only one active login at a time) =====
  // Every successful login/register generates a new random sessionId and
  // stores it here, AND stamps it into that login's JWT as `sid`. The auth
  // middleware compares the token's `sid` against this field on every
  // request — if they don't match, it means someone logged in again
  // elsewhere (different browser/device) since this token was issued, so
  // this older session gets rejected and the app force-logs the user out.
  sessionId: {
    type: String,
    default: null
  },
  // ===== FORGOT PASSWORD OTP =====
  // A short-lived 4-digit code emailed to the user when they request a
  // password reset. Cleared immediately after a successful reset (or once
  // expired, it's simply ignored/overwritten by the next request).
  resetOtp: { type: String, default: null },
  resetOtpExpires: { type: Date, default: null },

  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('User', UserSchema);