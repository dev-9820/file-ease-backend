const mongoose = require('mongoose');

const fileMetaSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String },
  size: { type: Number }, // bytes
  uploadDate: { type: Date, default: Date.now },
  gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },
});

module.exports = mongoose.model('FileMeta', fileMetaSchema);
