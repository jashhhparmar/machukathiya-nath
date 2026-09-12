const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const User = require('../models/User');
const { upload } = require('../config/cloudinary');

// Middleware to ensure user is logged in and is an Admin
async function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    req.session.errorMessage = 'Please login to access admin settings.';
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.userId).lean();
    if (!user || user.role !== 'admin') {
      return res.status(403).send(`
        <div style="text-align:center;padding:100px;font-family:sans-serif;">
          <h1 style="color:#dc3545;">403 Access Denied</h1>
          <p>Only site administrators can change the site logo or access admin settings.</p>
          <a href="/dashboard" style="color:#046957;font-weight:bold;">← Return to Dashboard</a>
        </div>
      `);
    }
    req.adminUser = user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
}

// GET /admin/logo — Render logo management page
router.get('/admin/logo', requireAdmin, async (req, res) => {
  try {
    const logoSetting = await Setting.findOne({ key: 'siteLogo' }).lean();
    const currentLogo = logoSetting ? logoSetting.value : '/images/logo.png';

    res.render('admin-logo', {
      title: 'Logo Settings (Admin Only)',
      currentLogo,
      success: req.session.successMessage || null,
      error: req.session.errorMessage || null
    });
    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /admin/logo — Update site logo (file upload or image URL)
router.post('/admin/logo', requireAdmin, upload.single('logoFile'), async (req, res) => {
  try {
    let logoUrl = null;

    if (req.file && req.file.path) {
      logoUrl = req.file.path;
    } else if (req.body.logoUrl && req.body.logoUrl.trim() !== '') {
      logoUrl = req.body.logoUrl.trim();
    }

    if (!logoUrl) {
      req.session.errorMessage = 'Please select a logo image file or enter a valid Image URL.';
      return res.redirect('/admin/logo');
    }

    await Setting.findOneAndUpdate(
      { key: 'siteLogo' },
      { value: logoUrl, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    req.session.successMessage = 'Site logo has been updated successfully!';
    res.redirect('/admin/logo');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to update logo: ' + err.message;
    res.redirect('/admin/logo');
  }
});

// POST /admin/reset-logo — Reset logo to default
router.post('/admin/reset-logo', requireAdmin, async (req, res) => {
  try {
    await Setting.findOneAndUpdate(
      { key: 'siteLogo' },
      { value: '/images/logo.png', updatedAt: new Date() },
      { upsert: true, new: true }
    );
    req.session.successMessage = 'Site logo reset to default logo.';
    res.redirect('/admin/logo');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: DELETE ENTIRE FAMILY (and all its members)
// ═══════════════════════════════════════════════════════════════════════════════
const Family = require('../models/Family');
const Member = require('../models/Member');

router.post('/admin/family/:id/delete', requireAdmin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family) {
      req.session.errorMessage = 'Family not found.';
      return res.redirect('/vastipatrak');
    }

    // ── REVOKE ACCESS for all linked users in this family ──
    const membersWithUsers = await Member.find({ family: family._id, linkedUser: { $ne: null } }).lean();
    for (const m of membersWithUsers) {
      await User.findByIdAndUpdate(m.linkedUser, {
        approvalStatus: 'rejected',
        rejectionReason: 'Family deleted from Vastipatrak by admin.',
        linkedFamily: null,
        linkedMember: null
      });
    }

    // Delete all members belonging to this family
    await Member.deleteMany({ family: family._id });

    // Delete the family itself
    await Family.findByIdAndDelete(family._id);

    req.session.successMessage = `Family "${family.familyHead}" (Vastipatrak #${family.vastipatrakNo}) and all its members have been deleted.`;
    res.redirect('/vastipatrak');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to delete family: ' + err.message;
    res.redirect('/vastipatrak');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: DELETE INDIVIDUAL MEMBER
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/admin/family/:id/member/:memberId/delete', requireAdmin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family) {
      req.session.errorMessage = 'Family not found.';
      return res.redirect('/vastipatrak');
    }

    const member = await Member.findById(req.params.memberId);
    if (!member) {
      req.session.errorMessage = 'Member not found.';
      return res.redirect(`/family/${family._id}`);
    }

    if (member.family.toString() !== family._id.toString()) {
      req.session.errorMessage = 'This member does not belong to this family.';
      return res.redirect(`/family/${family._id}`);
    }

    // ── REVOKE ACCESS if member has a linked User account ──
    if (member.linkedUser) {
      await User.findByIdAndUpdate(member.linkedUser, {
        approvalStatus: 'rejected',
        rejectionReason: 'Removed from Vastipatrak by admin.',
        linkedFamily: null,
        linkedMember: null
      });
    }

    await Member.findByIdAndDelete(member._id);

    // Decrement totalMembers on the family
    await Family.findByIdAndUpdate(family._id, { $inc: { totalMembers: -1 } });

    req.session.successMessage = `Member "${member.fullName}" has been deleted from the family.`;
    res.redirect(`/family/${family._id}`);
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to delete member: ' + err.message;
    res.redirect(`/family/${req.params.id}`);
  }
});
const { sendApprovalEmail, sendRejectionEmail } = require('../config/mailer');

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: MEMBER APPROVAL DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/approvals — show pending, approved, rejected users
router.get('/admin/approvals', requireAdmin, async (req, res) => {
  try {
    // Get all users grouped by approval status
    const pendingUserDocs = await User.find({ approvalStatus: 'pending', role: { $ne: 'admin' } }).sort({ createdAt: -1 }).lean();
    const approvedUserDocs = await User.find({ approvalStatus: 'approved' }).sort({ createdAt: -1 }).lean();
    const rejectedUsers = await User.find({ approvalStatus: 'rejected' }).sort({ createdAt: -1 }).lean();

    // For approved users, check if their linked member still exists in Vastipatrak
    const approvedUsers = [];
    for (const au of approvedUserDocs) {
      let inVastipatrak = false;
      if (au.linkedMember) {
        const memberExists = await Member.findById(au.linkedMember).lean();
        inVastipatrak = !!memberExists;
      } else {
        // Check by createdBy (old users without linkedMember)
        const familyExists = await Family.findOne({ createdBy: au._id }).lean();
        inVastipatrak = !!familyExists;
      }
      approvedUsers.push({ ...au, inVastipatrak });
    }

    // For pending users, also fetch their family + member data
    const pendingUsers = [];
    for (const u of pendingUserDocs) {
      const family = await Family.findOne({ createdBy: u._id }).lean();
      const member = family ? await Member.findOne({ family: family._id, relation: 'SELF' }).lean() : null;
      pendingUsers.push({ user: u, family, member });
    }

    res.render('admin-approvals', {
      title: 'Member Approvals',
      pendingUsers,
      approvedUsers,
      rejectedUsers,
      success: req.session.successMessage || null,
      error: req.session.errorMessage || null
    });
    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /admin/approvals/:userId/approve — approve a pending user
router.post('/admin/approvals/:userId/approve', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      req.session.errorMessage = 'User not found.';
      return res.redirect('/admin/approvals');
    }

    if (user.approvalStatus !== 'pending') {
      req.session.errorMessage = 'This user is not in pending status.';
      return res.redirect('/admin/approvals');
    }

    user.approvalStatus = 'approved';
    user.rejectionReason = null;
    await user.save();

    // Send approval email to user
    try {
      await sendApprovalEmail(user.email, user.fullName);
    } catch (emailErr) {
      console.error('[ADMIN] Failed to send approval email:', emailErr.message);
    }

    req.session.successMessage = `${user.fullName} has been approved! They have been notified via email.`;
    res.redirect('/admin/approvals');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to approve user: ' + err.message;
    res.redirect('/admin/approvals');
  }
});

// POST /admin/approvals/:userId/reject — reject a pending user
router.post('/admin/approvals/:userId/reject', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      req.session.errorMessage = 'User not found.';
      return res.redirect('/admin/approvals');
    }

    if (user.approvalStatus !== 'pending') {
      req.session.errorMessage = 'This user is not in pending status.';
      return res.redirect('/admin/approvals');
    }

    const reason = req.body.rejectionReason || null;
    user.approvalStatus = 'rejected';
    user.rejectionReason = reason;
    await user.save();

    // Send rejection email to user
    try {
      await sendRejectionEmail(user.email, user.fullName, reason);
    } catch (emailErr) {
      console.error('[ADMIN] Failed to send rejection email:', emailErr.message);
    }

    req.session.successMessage = `${user.fullName}'s registration has been rejected.`;
    res.redirect('/admin/approvals');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to reject user: ' + err.message;
    res.redirect('/admin/approvals');
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// POST /admin/users/:userId/make-admin — Promote user to admin
router.post('/admin/users/:userId/make-admin', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      req.session.errorMessage = 'User not found.';
      return res.redirect('/admin/approvals');
    }
    user.role = 'admin';
    await user.save();
    req.session.successMessage = `${user.fullName} has been promoted to Admin.`;
    res.redirect('/admin/approvals');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to promote user: ' + err.message;
    res.redirect('/admin/approvals');
  }
});

// POST /admin/users/:userId/remove-admin — Demote admin to member
router.post('/admin/users/:userId/remove-admin', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      req.session.errorMessage = 'User not found.';
      return res.redirect('/admin/approvals');
    }
    // Prevent removing yourself from admin
    if (user._id.toString() === req.session.userId) {
      req.session.errorMessage = 'You cannot remove your own admin role.';
      return res.redirect('/admin/approvals');
    }
    user.role = 'member';
    await user.save();
    req.session.successMessage = `${user.fullName} has been demoted to Member.`;
    res.redirect('/admin/approvals');
  } catch (err) {
    console.error(err);
    req.session.errorMessage = 'Failed to demote user: ' + err.message;
    res.redirect('/admin/approvals');
  }
});

module.exports = router;
