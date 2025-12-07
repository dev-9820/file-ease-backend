require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// rate limit basic
app.use(rateLimit({ windowMs: 60*1000, max: 200 }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/secure_drive';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('MongoDB connected'))
  .catch(err=>{ console.error(err); process.exit(1); });

// Models & routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/user');

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use("/api/users", userRoutes);
// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=>console.log(`Server listening on ${PORT}`));
