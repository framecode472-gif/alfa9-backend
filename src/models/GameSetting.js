const mongoose = require('mongoose');

const GameSettingSchema = new mongoose.Schema({
  gameName: { 
    type: String, 
    enum: ['wingo', 'k3', '5d', 'boom'], 
    unique: true, 
    required: true 
  },
  profitPercentage: { 
    type: Number, 
    default: 70, 
    min: 0, 
    max: 100 
  },
  lossPercentage: { 
    type: Number, 
    default: 30, 
    min: 0, 
    max: 100 
  },
  minBet: { type: Number, default: 1 },
  maxBet: { type: Number, default: 100000 },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  maintenance: {
    type: Boolean,
    default: false
  },
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('GameSetting', GameSettingSchema);