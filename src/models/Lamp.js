const mongoose = require('mongoose');

const lampSchema = new mongoose.Schema({
  gw_id: { type: String, required: true },
  node_id: { type: String, required: true, unique: true },
  lamp_state: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
  lamp_dim: { type: Number, min: 0, max: 100, default: 0 },
  lux: { type: Number, default: 0 },
  current_a: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

lampSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Lamp', lampSchema);