const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');

router.get('/vastipatrak', requireLogin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const isNumeric = !isNaN(search) && search.trim() !== '';
      
      query = {
        $or: [
          { familyHead: searchRegex },
          { village: searchRegex },
          { gotra: searchRegex }
        ]
      };
      
      if (isNumeric) {
        query.$or.push({ vastipatrakNo: parseInt(search) });
      }
    }

    const totalFamilies = await Family.countDocuments(query);
    const totalPages = Math.ceil(totalFamilies / limit);

    const families = await Family.find(query).skip(skip).limit(limit).lean();

    // Fetch SELF member for each family
    for (let family of families) {
      const selfMember = await Member.findOne({ family: family._id, relation: 'SELF' }).lean();
      family.selfMember = selfMember;
    }

    res.render('vastipatrak', {
      title: 'Vastipatrak Directory',
      families,
      currentPage: page,
      totalPages,
      search,
      totalFamilies
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
