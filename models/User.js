const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  name: { type: String },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.verifyPassword = function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
