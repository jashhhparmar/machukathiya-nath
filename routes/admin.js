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

module.exports = router;
