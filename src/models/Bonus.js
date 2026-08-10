const mongoose = require('mongoose');

const BonusSchema = new mongoose.Schema({
  key: {
    type: String,
    enum: ['deposit', 'invite', 'attendance', 'rebate'],
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  desc: {
    type: String
  },
  enabled: {
    type: Boolean,
    default: true
  },
  value: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    enum: ['%', 'Rs'],
    required: true
  },
  cap: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Bonus', BonusSchema);
