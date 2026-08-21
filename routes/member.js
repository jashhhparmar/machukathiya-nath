const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');
const { upload } = require('../config/cloudinary');

// ─── Helper: check family ownership ──────────────────────────────────────────
function isOwner(family, userId) {
  return family.createdBy && family.createdBy.toString() === userId.toString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD MEMBER
// ═══════════════════════════════════════════════════════════════════════════════

// GET /family/:id/add-member — show the add member form
router.get('/family/:id/add-member', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    if (!isOwner(family, req.session.userId)) {
      return res.status(403).send('You are not allowed to add members to this family.');
    }

    res.render('add-member', { title: 'Add Family Member', family, errors: [], data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /family/:id/add-member — save new member (with optional photo)
router.post('/family/:id/add-member', requireLogin, upload.single('profilePhoto'), async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    if (!isOwner(family, req.session.userId)) {
      return res.status(403).send('Not allowed.');
    }

    const {
      fullName, relation, gender, maritalStatus,
      dateOfBirth, bloodGroup, phone, occupation,
      education, membershipType,
      addressLine1, city, state, pincode
    } = req.body;

    if (!fullName || !relation || !gender || !maritalStatus) {
      return res.render('add-member', {
        title: 'Add Family Member',
        family,
        errors: [{ msg: 'Full Name, Relation, Gender and Marital Status are required.' }],
        data: req.body
      });
    }

    const memberData = {
      family: family._id,
      fullName: fullName.toUpperCase(),
      relation: relation.toUpperCase(),
      gender,
      maritalStatus,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      bloodGroup: bloodGroup || '',
      phone,
      occupation: occupation ? occupation.toUpperCase() : '',
      education: education || '',
      membershipType: membershipType || 'Non Members',
      address: {
        line1: addressLine1 || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: 'India'
      }
    };

    // If a photo was uploaded to Cloudinary, save the URL
    if (req.file && req.file.path) {
      memberData.profilePhoto = req.file.path;
    }

    const member = new Member(memberData);
    await member.save();

    // Increment totalMembers on the family
    await Family.findByIdAndUpdate(family._id, { $inc: { totalMembers: 1 } });

    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT MEMBER
// ═══════════════════════════════════════════════════════════════════════════════

// GET /family/:id/member/:memberId/edit — show edit form
router.get('/family/:id/member/:memberId/edit', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    if (!isOwner(family, req.session.userId)) {
      return res.status(403).send('You are not allowed to edit members of this family.');
    }

    const member = await Member.findById(req.params.memberId).lean();
    if (!member) return res.status(404).send('Member not found');

    if (member.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    res.render('edit-member', { title: 'Edit Member', family, member, errors: [], data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /family/:id/member/:memberId/edit — update member (with optional photo)
router.post('/family/:id/member/:memberId/edit', requireLogin, upload.single('profilePhoto'), async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    if (!isOwner(family, req.session.userId)) {
      return res.status(403).send('Not allowed.');
    }

    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).send('Member not found');

    if (member.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    const {
      fullName, relation, gender, maritalStatus,
      dateOfBirth, bloodGroup, phone, occupation,
      education, membershipType,
      addressLine1, city, state, pincode
    } = req.body;

    if (!fullName || !relation || !gender || !maritalStatus) {
      return res.render('edit-member', {
        title: 'Edit Member',
        family,
        member: member.toObject(),
        errors: [{ msg: 'Full Name, Relation, Gender and Marital Status are required.' }],
        data: req.body
      });
    }

    // Update the member fields
    member.fullName = fullName.toUpperCase();
    member.relation = relation.toUpperCase();
    member.gender = gender;
    member.maritalStatus = maritalStatus;
    member.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    member.bloodGroup = bloodGroup || '';
    member.phone = phone || '';
    member.occupation = occupation ? occupation.toUpperCase() : '';
    member.education = education || '';
    member.membershipType = membershipType || 'Non Members';
    member.address = {
      line1: addressLine1 || '',
      city: city || '',
      state: state || '',
      pincode: pincode || '',
      country: 'India'
    };

    // If a new photo was uploaded to Cloudinary, update the URL
    if (req.file && req.file.path) {
      member.profilePhoto = req.file.path;
    }

    await member.save();

    // If this member is SELF, also update the family head name and the user's fullName
    if (member.relation === 'SELF') {
      await Family.findByIdAndUpdate(family._id, { familyHead: fullName.toUpperCase() });
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.session.userId, { fullName: fullName.toUpperCase(), phone: phone || '' });
    }

    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
