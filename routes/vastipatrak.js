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
    const search = (req.query.search || '').trim();

    let familyQuery = {};
    let matchedMembers = [];
    let matchedMembersCount = 0;

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const isNumeric = !isNaN(search) && search !== '';

      // 1. Search across Member collection (fullName, occupation, education, phone, suburb, city, etc.)
      const memberSearchQuery = {
        $or: [
          { fullName: searchRegex },
          { occupation: searchRegex },
          { education: searchRegex },
          { phone: searchRegex },
          { relation: searchRegex },
          { membershipType: searchRegex },
          { bloodGroup: searchRegex },
          { 'address.line1': searchRegex },
          { 'address.suburb': searchRegex },
          { 'address.city': searchRegex },
          { 'address.state': searchRegex },
          { 'address.pincode': searchRegex }
        ]
      };

      // Find matching members and populate family details
      const rawMatchedMembers = await Member.find(memberSearchQuery)
        .populate('family')
        .lean();

      matchedMembers = rawMatchedMembers;
      matchedMembersCount = rawMatchedMembers.length;

      // Extract unique family IDs from matched members
      const memberFamilyIds = rawMatchedMembers
        .filter(m => m.family && m.family._id)
        .map(m => m.family._id);

      // 2. Build family search query (matching family fields OR member's family ID)
      const familyOrConditions = [
        { familyHead: searchRegex },
        { village: searchRegex },
        { mosal: searchRegex },
        { _id: { $in: memberFamilyIds } }
      ];

      if (isNumeric) {
        familyOrConditions.push({ vastipatrakNo: parseInt(search) });
      }

      familyQuery = { $or: familyOrConditions };
    }

    const totalFamilies = await Family.countDocuments(familyQuery);
    const totalPages = Math.ceil(totalFamilies / limit) || 1;

    const families = await Family.find(familyQuery)
      .sort({ vastipatrakNo: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Fetch SELF member for each family card
    for (let family of families) {
      const selfMember = await Member.findOne({ family: family._id, relation: 'SELF' }).lean();
      family.selfMember = selfMember;
    }

    res.render('vastipatrak', {
      title: 'Vastipatrak Directory & Search',
      families,
      matchedMembers,
      matchedMembersCount,
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
