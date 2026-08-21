const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');

router.get('/family/:id', requireLogin, async (req, res) => {
  try {
    const familyId = req.params.id;
    const family = await Family.findById(familyId).lean();
    if (!family) {
      return res.status(404).send('Family not found');
    }

    const members = await Member.find({ family: familyId }).lean();
    
    // Sort members: SELF first, WIFE second, then others
    members.sort((a, b) => {
      const order = { 'SELF': 1, 'WIFE': 2, 'SON': 3, 'DAUGHTER': 4 };
      const valA = order[a.relation] || 99;
      const valB = order[b.relation] || 99;
      return valA - valB;
    });

    res.render('family-detail', {
      title: `Family Details - ${family.familyHead}`,
      family,
      members
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
