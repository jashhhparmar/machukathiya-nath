const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const Family = require('../models/Family');
const Member = require('../models/Member');
const User = require('../models/User');
const { upload } = require('../config/cloudinary');

// ─── Helper: check family ownership ──────────────────────────────────────────
function isOwner(family, userId) {
  return family.createdBy && family.createdBy.toString() === userId.toString();
}

// ─── Helper: check if user belongs to this family (linked to any member) ─────
async function isFamilyMember(familyId, userId) {
  const currentUser = await User.findById(userId).lean();
  if (!currentUser || !currentUser.linkedFamily) return false;
  return currentUser.linkedFamily.toString() === familyId.toString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD MEMBER (family owner, any family member, or admin)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /family/:id/add-member — show the add member form
router.get('/family/:id/add-member', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const belongsToFamily = await isFamilyMember(family._id, req.session.userId);

    if (!isOwner(family, req.session.userId) && !belongsToFamily && !isAdmin) {
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

    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const belongsToFamily = await isFamilyMember(family._id, req.session.userId);

    if (!isOwner(family, req.session.userId) && !belongsToFamily && !isAdmin) {
      return res.status(403).send('Not allowed.');
    }

    const {
      fullName, relation, gender, maritalStatus,
      dateOfBirth, bloodGroup, phone, email, occupation,
      education, membershipType,
      addressLine1, suburb, city, state, pincode
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
      email: email ? email.toLowerCase().trim() : '',
      occupation: occupation ? occupation.toUpperCase() : '',
      education: education || '',
      membershipType: membershipType || 'Non Members',
      address: {
        line1: addressLine1 || '',
        suburb: suburb || '',
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
    
    // Auto-link if a user with this email already exists
    if (memberData.email) {
      const existingUser = await User.findOne({ email: memberData.email });
      if (existingUser) {
        member.linkedUser = existingUser._id;
        existingUser.linkedMember = member._id;
        existingUser.linkedFamily = family._id;
        // Re-approve if they were previously rejected
        if (existingUser.approvalStatus === 'rejected') {
          existingUser.approvalStatus = 'approved';
          existingUser.rejectionReason = '';
        }
        await existingUser.save();
      }
    }

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
// EDIT MEMBER (family owner, any family member, or admin)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /family/:id/member/:memberId/edit — show edit form
router.get('/family/:id/member/:memberId/edit', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    const member = await Member.findById(req.params.memberId).lean();
    if (!member) return res.status(404).send('Member not found');

    if (member.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    // Allow: family owner, any member of same family, or admin
    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const belongsToFamily = await isFamilyMember(family._id, req.session.userId);

    if (!isOwner(family, req.session.userId) && !belongsToFamily && !isAdmin) {
      return res.status(403).send('You are not allowed to edit this member.');
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

    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).send('Member not found');

    if (member.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    // Allow: family owner, any member of same family, or admin
    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const belongsToFamily = await isFamilyMember(family._id, req.session.userId);

    if (!isOwner(family, req.session.userId) && !belongsToFamily && !isAdmin) {
      return res.status(403).send('Not allowed.');
    }

    const {
      fullName, relation, gender, maritalStatus,
      dateOfBirth, bloodGroup, phone, email, occupation,
      education, membershipType,
      addressLine1, suburb, city, state, pincode
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
    member.email = email ? email.toLowerCase().trim() : '';
    member.occupation = occupation ? occupation.toUpperCase() : '';
    member.education = education || '';
    member.membershipType = membershipType || 'Non Members';
    member.address = {
      line1: addressLine1 || '',
      suburb: suburb || '',
      city: city || '',
      state: state || '',
      pincode: pincode || '',
      country: 'India'
    };

    // If a new photo was uploaded to Cloudinary, update the URL
    if (req.file && req.file.path) {
      member.profilePhoto = req.file.path;
    }

    // Auto-link if a user with this email already exists and member not yet linked
    if (member.email && (!member.linkedUser)) {
      const existingUser = await User.findOne({ email: member.email });
      if (existingUser) {
        member.linkedUser = existingUser._id;
        existingUser.linkedMember = member._id;
        existingUser.linkedFamily = family._id;
        // Re-approve if they were previously rejected
        if (existingUser.approvalStatus === 'rejected') {
          existingUser.approvalStatus = 'approved';
          existingUser.rejectionReason = '';
        }
        await existingUser.save();
      }
    }

    await member.save();

    // If this member is SELF, also update the family head name
    if (member.relation === 'SELF') {
      await Family.findByIdAndUpdate(family._id, { familyHead: fullName.toUpperCase() });
    }

    // If this member has a linked user, keep their User fields in sync
    if (member.linkedUser) {
      const updateFields = {};
      if (email) updateFields.email = email.toLowerCase().trim();
      if (fullName) updateFields.fullName = fullName.toUpperCase();
      if (phone) updateFields.phone = phone;
      if (Object.keys(updateFields).length > 0) {
        await User.findByIdAndUpdate(member.linkedUser, updateFields);
      }
    }

    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE FAMILY HEAD (any family member can change who is the head)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/family/:id/member/:memberId/make-head', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family) return res.status(404).send('Family not found');

    // Check permission: must be family owner, family member, or admin
    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const belongsToFamily = await isFamilyMember(family._id, req.session.userId);

    if (!isOwner(family, req.session.userId) && !belongsToFamily && !isAdmin) {
      return res.status(403).send('You are not allowed to change the family head.');
    }

    const newHead = await Member.findById(req.params.memberId);
    if (!newHead) return res.status(404).send('Member not found');

    if (newHead.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    // Already the head? No action needed
    if (newHead.relation === 'SELF') {
      return res.redirect(`/family/${family._id}`);
    }

    // Find the current head (SELF) and demote them
    const currentHead = await Member.findOne({ family: family._id, relation: 'SELF' });
    if (currentHead) {
      currentHead.relation = 'MEMBER';
      await currentHead.save();
    }

    // Promote the new member to head
    newHead.relation = 'SELF';
    await newHead.save();

    // Update the family's familyHead name
    family.familyHead = newHead.fullName;
    await family.save();

    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE MEMBER (family owner or admin only — not regular family members)
// When a member is deleted, revoke their linked user's access.
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/family/:id/member/:memberId/delete', requireLogin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id).lean();
    if (!family) return res.status(404).send('Family not found');

    // Check: must be family owner OR admin (NOT regular family members)
    const currentUser = await User.findById(req.session.userId).lean();
    const isAdmin = currentUser && currentUser.role === 'admin';

    if (!isOwner(family, req.session.userId) && !isAdmin) {
      return res.status(403).send('You are not allowed to delete members of this family.');
    }

    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).send('Member not found');

    if (member.family.toString() !== family._id.toString()) {
      return res.status(403).send('This member does not belong to this family.');
    }

    // Prevent deleting the SELF member (family head) — they must delete the whole family
    if (member.relation === 'SELF' && !isAdmin) {
      return res.status(403).send('Cannot delete the family head. Contact admin to remove the entire family.');
    }

    // ── REVOKE ACCESS: If member has a linked User account, block them ──
    if (member.linkedUser) {
      await User.findByIdAndUpdate(member.linkedUser, {
        approvalStatus: 'rejected',
        rejectionReason: 'Removed from Vastipatrak by admin/family owner.',
        linkedFamily: null,
        linkedMember: null
      });
    }

    await Member.findByIdAndDelete(member._id);

    // Decrement totalMembers on the family
    await Family.findByIdAndUpdate(family._id, { $inc: { totalMembers: -1 } });

    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
