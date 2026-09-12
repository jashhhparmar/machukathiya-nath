const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');
const User = require('../models/User');

router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const totalFamilies = await Family.countDocuments();
    const totalMembers = await Member.countDocuments();

    // Find this user's family (via linkedFamily or fallback to createdBy)
    const currentUser = await User.findById(req.session.userId).lean();
    let myFamily = null;
    if (currentUser && currentUser.linkedFamily) {
      myFamily = await Family.findById(currentUser.linkedFamily).lean();
    }
    if (!myFamily) {
      myFamily = await Family.findOne({ createdBy: req.session.userId }).lean();
    }

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
