const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  file: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMeta', required: true },
  grantee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }
});

// TTL index: if expiresAt set, Mongo will delete the document once time passes.
permissionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Permission', permissionSchema);
