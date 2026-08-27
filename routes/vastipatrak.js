const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');

// Helper to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build smart regexes to handle transliteration variations (e.g. Parmar <-> Paramar, Mistry <-> Mistri)
function getSearchRegexes(term) {
  const trimmed = term.trim();
  const regexes = [];

  // Direct exact/partial match
  regexes.push(new RegExp(escapeRegExp(trimmed), 'i'));

  // Phonetic/spelling variation for Parmar <-> Paramar
  if (/parmar/i.test(trimmed)) {
    regexes.push(new RegExp('paramar', 'i'));
  } else if (/paramar/i.test(trimmed)) {
    regexes.push(new RegExp('parmar', 'i'));
  }

  // Mistry <-> Mistri
  if (/mistry/i.test(trimmed)) {
    regexes.push(new RegExp('mistri', 'i'));
  } else if (/mistri/i.test(trimmed)) {
    regexes.push(new RegExp('mistry', 'i'));
  }

  // Generic optional vowel insertion between r and m (p[a]?r[a]?m[a]?r)
  const flexiblePattern = escapeRegExp(trimmed).replace(/r/gi, 'r[a]?');
  try {
    regexes.push(new RegExp(flexiblePattern, 'i'));
  } catch (e) {}

  return regexes;
}

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
      const searchRegexes = getSearchRegexes(search);
      const isNumeric = !isNaN(search) && search !== '';

      const memberFields = [
        'fullName', 'occupation', 'education', 'phone',
        'relation', 'membershipType', 'bloodGroup',
        'address.line1', 'address.suburb', 'address.city',
        'address.state', 'address.pincode'
      ];

      // Build member search conditions for all regex variations
      const memberOrConditions = [];
      searchRegexes.forEach(regex => {
        memberFields.forEach(field => {
          memberOrConditions.push({ [field]: regex });
        });
      });

      // Find matching members and populate family details
      const rawMatchedMembers = await Member.find({ $or: memberOrConditions })
        .populate('family')
        .lean();

      matchedMembers = rawMatchedMembers;
      matchedMembersCount = rawMatchedMembers.length;

      // Extract unique family IDs from matched members
      const memberFamilyIds = rawMatchedMembers
        .filter(m => m.family && m.family._id)
        .map(m => m.family._id);

      // Build family search query
      const familyOrConditions = [
        { _id: { $in: memberFamilyIds } }
      ];

      searchRegexes.forEach(regex => {
        familyOrConditions.push({ familyHead: regex });
        familyOrConditions.push({ village: regex });
        familyOrConditions.push({ mosal: regex });
      });

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
