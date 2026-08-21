const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');

router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const totalFamilies = await Family.countDocuments();
    const totalMembers = await Member.countDocuments();

    // Find this user's own family (the one they created)
    const myFamily = await Family.findOne({ createdBy: req.session.userId }).lean();

    res.render('dashboard', {
      title: 'Dashboard',
      totalFamilies,
      totalMembers,
      myFamily
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
