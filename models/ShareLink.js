const mongoose = require('mongoose');

const shareLinkSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  file: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMeta', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }
});

// to auto-delete expired links
shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ShareLink', shareLinkSchema);
