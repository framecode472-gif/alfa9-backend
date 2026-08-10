const mongoose = require('mongoose');

/**
 * Tracks a user's claim of any Activity-page reward:
 * spin wheel, attendance streak, win streak, lucky 10 days,
 * new member deposit bonus, super jackpot, aviator award, etc.
 */
const ActivityClaimSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityType: {
    type: String,
    enum: [
      'spin_wheel', 'attendance', 'win_streak', 'lucky_10_days',
      'new_member_deposit', 'super_jackpot', 'aviator_award',
      'betting_rebate', 'invitation_bonus', 'vip_rewards',
      'creative_video', 'additional_rewards',
      'activity_award_mission' // ActivityAward.jsx daily missions
    ],
    required: true
  },
  refIndex: {
    type: Number // generic index: mission #, invitation milestone #, etc.
  },
  amount: {
    type: Number,
    default: 0
  },
  streakDay: {
    type: Number // for attendance / win-streak style activities
  },
  claimDate: {
    type: String // "YYYY-MM-DD" — lets daily-reset activities check "already claimed today" with a simple equality match
  },
  claimedAt: {
    type: Date,
    default: Date.now
  }
});

// One claim per user per activity per day (attendance-style activities)
ActivityClaimSchema.index({ userId: 1, activityType: 1, claimedAt: 1 });
// One claim per user per mission/milestone per day (activity_award_mission, betting_rebate)
ActivityClaimSchema.index({ userId: 1, activityType: 1, refIndex: 1, claimDate: 1 });
// One claim per user per invitation milestone, ever (invitation_bonus)
ActivityClaimSchema.index({ userId: 1, activityType: 1, refIndex: 1 }, { unique: false });

module.exports = mongoose.model('ActivityClaim', ActivityClaimSchema);
