const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if(!email || !password) return res.status(400).json({ error: 'email and password required' });
    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({ error: 'email already used' });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = await User.create({ email, name, passwordHash: hash });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch(err) { next(err); }
});

// login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if(!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await User.findOne({ email });
    if(!user) return res.status(400).json({ error: 'invalid credentials' });
    const ok = await user.verifyPassword(password);
    if(!ok) return res.status(400).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch(err) { next(err); }
});

module.exports = router;
