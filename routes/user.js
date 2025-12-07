const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.post("/find-by-email", async (req, res) => {
try {
const { email } = req.body;
if (!email) return res.status(400).json({ message: "Email is required" });


const user = await User.findOne({ email }).select("_id name email");
if (!user) return res.status(404).json({ message: "User not found" });


return res.json(user);
} catch (error) {
console.error(error);
res.status(500).json({ message: "Server error" });
}
});


module.exports = router;