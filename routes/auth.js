const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Family = require('../models/Family');
const Member = require('../models/Member');
const { sendOTPEmail, sendAdminNotificationEmail } = require('../config/mailer');

// GET /signup
router.get('/signup', (req, res) => {
  // If there's pending signup data in session, pre-fill the form
  const pendingData = req.session.pendingSignup || {};
  res.render('signup', { title: 'Sign Up', errors: [], data: pendingData });
});

// POST /signup — validates and stores data in session, then checks for family matches
router.post('/signup', [
  body('fullName').notEmpty().withMessage('Full Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('village').notEmpty().withMessage('Village is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('gender').notEmpty().withMessage('Gender is required'),
  body('maritalStatus').notEmpty().withMessage('Marital status is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('signup', { title: 'Sign Up', errors: errors.array(), data: req.body });
  }

  try {
    // Check if email already exists before redirecting to T&C
    const existing = await User.findOne({ email: req.body.email });
    if (existing) {
      return res.render('signup', {
        title: 'Sign Up',
        errors: [{ msg: 'This email is already registered. Please login.' }],
        data: req.body
      });
    }

    // Store validated form data in session (NOT in database yet)
    req.session.pendingSignup = req.body;

    // ── MATCHING ALGORITHM: Check if this person exists in any family ──
    // Search by name OR by email (email match = strong signal)
    const nameRegex = new RegExp('^' + req.body.fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const emailLower = req.body.email ? req.body.email.toLowerCase().trim() : '';
    
    let matchingMembers;
    if (emailLower) {
      matchingMembers = await Member.find({
        $or: [{ fullName: nameRegex }, { email: emailLower }]
      }).populate('family').lean();
    } else {
      matchingMembers = await Member.find({ fullName: nameRegex }).populate('family').lean();
    }

    const qualifiedMatches = [];
    for (const member of matchingMembers) {
      // Skip members that already have a linked user account
      if (member.linkedUser) continue;

      let score = 0;
      const totalChecks = 5;

      // Check email match (strong signal)
      if (emailLower && member.email && emailLower === member.email.toLowerCase().trim()) {
        score += 2; // Email match counts double
      }
      // Check phone match
      if (req.body.phone && member.phone && req.body.phone.replace(/\s/g, '') === member.phone.replace(/\s/g, '')) {
        score++;
      }
      // Check DOB match
      if (req.body.dateOfBirth && member.dateOfBirth) {
        const inputDOB = new Date(req.body.dateOfBirth).toISOString().split('T')[0];
        const memberDOB = new Date(member.dateOfBirth).toISOString().split('T')[0];
        if (inputDOB === memberDOB) score++;
      }
      // Check gender match
      if (req.body.gender && member.gender && req.body.gender === member.gender) {
        score++;
      }
      // Check village match (from family)
      if (req.body.village && member.family && member.family.village) {
        if (req.body.village.trim().toUpperCase() === member.family.village.trim().toUpperCase()) {
          score++;
        }
      }

      // Need at least 2/5 matches (email match alone = 2 = qualifies)
      if (score >= 2) {
        qualifiedMatches.push({
          member,
          family: member.family,
          score: Math.min(score, totalChecks),
          totalChecks
        });
      }
    }

    // If matches found, show the choose page
    if (qualifiedMatches.length > 0) {
      req.session.familyMatches = qualifiedMatches.map(m => ({
        memberId: m.member._id.toString(),
        memberName: m.member.fullName,
        memberRelation: m.member.relation,
        memberPhone: m.member.phone,
        memberGender: m.member.gender,
        memberDOB: m.member.dateOfBirth,
        familyId: m.family._id.toString(),
        familyHead: m.family.familyHead,
        familyVillage: m.family.village,
        familyVastipatrakNo: m.family.vastipatrakNo,
        familyTotalMembers: m.family.totalMembers,
        score: m.score,
        totalChecks: m.totalChecks
      }));
      return res.redirect('/signup-choose');
    }

    // No matches — proceed to Terms & Conditions
    req.session.familyMatches = null;
    res.redirect('/terms-and-conditions');

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// GET /terms-and-conditions
router.get('/terms-and-conditions', (req, res) => {
  // Only accessible if there's pending signup data
  if (!req.session.pendingSignup) {
    return res.redirect('/signup');
  }
  res.render('terms-and-conditions', { title: 'Terms & Conditions', errors: [] });
});

// POST /terms-and-conditions — user accepted, now create User + Family + Member
router.post('/terms-and-conditions', async (req, res) => {
  // Check if pending data exists
  if (!req.session.pendingSignup) {
    return res.redirect('/signup');
  }

  // Check if checkbox was checked
  if (!req.body.agreeTerms) {
    return res.render('terms-and-conditions', {
      title: 'Terms & Conditions',
      errors: [{ msg: 'You must accept the Terms and Conditions to proceed.' }]
    });
  }

  try {
    const {
      fullName, email, password, phone,
      village, mosal, occupation, education,
      gender, maritalStatus, dateOfBirth, bloodGroup,
      addressLine1, suburb, city, state, pincode
    } = req.session.pendingSignup;

    // 1. Create User (first user = admin + auto-approved)
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;
    const role = isFirstUser ? 'admin' : 'member';
    const approvalStatus = isFirstUser ? 'approved' : 'pending';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ fullName, email, password: hashedPassword, phone, role, approvalStatus });
    await user.save();

    // 2. Auto-generate Vastipatrak number (last + 1, starting from 1)
    const lastFamily = await Family.findOne().sort({ vastipatrakNo: -1 });
    const vastipatrakNo = lastFamily ? lastFamily.vastipatrakNo + 1 : 1;

    // 3. Create Family
    const family = new Family({
      vastipatrakNo,
      familyHead: fullName.toUpperCase(),
      village: village.toUpperCase(),
      mosal: mosal ? mosal.toUpperCase() : '',
      totalMembers: 1,
      createdBy: user._id
    });
    await family.save();

    // 4. Create Member (the person who signed up = SELF)
    const member = new Member({
      family: family._id,
      fullName: fullName.toUpperCase(),
      relation: 'SELF',
      gender,
      maritalStatus,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      bloodGroup: bloodGroup || '',
      phone,
      email: email ? email.toLowerCase().trim() : '',
      occupation: occupation ? occupation.toUpperCase() : '',
      education: education || '',
      membershipType: 'Life Member',
      linkedUser: user._id,
      address: {
        line1: addressLine1 || '',
        suburb: suburb || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: 'India'
      }
    });
    await member.save();

    // 5. Link user to family and member
    user.linkedFamily = family._id;
    user.linkedMember = member._id;
    await user.save();

    // 6. Clear pending signup data
    delete req.session.pendingSignup;
    delete req.session.familyMatches;

    // 7. If first user (admin), auto-login; otherwise show pending page
    if (isFirstUser) {
      req.session.userId = user._id;
      req.session.familyId = family._id;
      return res.redirect('/dashboard');
    }

    // 8. Send email notification to admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendAdminNotificationEmail(adminEmail, {
          fullName, email, phone, village, mosal,
          gender, maritalStatus, occupation, education
        });
      }
    } catch (emailErr) {
      console.error('[SIGNUP] Failed to send admin notification email:', emailErr.message);
    }

    // 9. Redirect to pending approval page
    res.render('signup-pending', {
      title: 'Registration Submitted',
      applicantName: fullName
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// ═══════════════════════════════════════════════════════════════
// FAMILY JOIN FLOW — Choose to join existing family or create new
// ═══════════════════════════════════════════════════════════════

// GET /signup-choose — Show matched families
router.get('/signup-choose', (req, res) => {
  if (!req.session.pendingSignup || !req.session.familyMatches) {
    return res.redirect('/signup');
  }
  res.render('signup-choose', {
    title: 'Join Existing Family?',
    matches: req.session.familyMatches,
    applicantName: req.session.pendingSignup.fullName
  });
});

// POST /signup-join — Join an existing family (creates User only, links to existing Member)
router.post('/signup-join', async (req, res) => {
  if (!req.session.pendingSignup || !req.session.familyMatches) {
    return res.redirect('/signup');
  }

  const { memberId, familyId } = req.body;
  if (!memberId || !familyId) {
    return res.redirect('/signup-choose');
  }

  try {
    const { fullName, email, password, phone } = req.session.pendingSignup;

    // Verify the family and member exist
    const family = await Family.findById(familyId);
    const member = await Member.findById(memberId);
    if (!family || !member) {
      return res.redirect('/signup-choose');
    }

    // Check member isn't already linked to another user
    if (member.linkedUser) {
      req.session.errorMessage = 'This member profile is already linked to another account.';
      return res.redirect('/signup-choose');
    }

    // Create User account (pending approval)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({
      fullName,
      email,
      password: hashedPassword,
      phone,
      role: 'member',
      approvalStatus: 'pending',
      linkedFamily: family._id,
      linkedMember: member._id
    });
    await user.save();

    // Link member back to user
    member.linkedUser = user._id;
    await member.save();

    // Clear session data
    delete req.session.pendingSignup;
    delete req.session.familyMatches;

    // Send admin notification
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendAdminNotificationEmail(adminEmail, {
          fullName, email, phone,
          village: family.village,
          mosal: family.mosal,
          gender: member.gender,
          maritalStatus: member.maritalStatus,
          occupation: member.occupation,
          education: member.education,
          joinType: `Joining ${family.familyHead}'s family (VP #${String(family.vastipatrakNo).padStart(4, '0')})`
        });
      }
    } catch (emailErr) {
      console.error('[SIGNUP-JOIN] Failed to send admin notification email:', emailErr.message);
    }

    res.render('signup-pending', {
      title: 'Registration Submitted',
      applicantName: fullName
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// POST /signup-create-new — User chose to create new family despite matches
router.post('/signup-create-new', (req, res) => {
  if (!req.session.pendingSignup) {
    return res.redirect('/signup');
  }
  // Clear matches and proceed to T&C
  req.session.familyMatches = null;
  res.redirect('/terms-and-conditions');
});

// GET /login
router.get('/login', (req, res) => {
  const errorMessage = req.session.errorMessage;
  const successMessage = req.session.successMessage;
  req.session.errorMessage = null;
  req.session.successMessage = null;
  res.render('login', {
    title: 'Login',
    errors: errorMessage ? [{ msg: errorMessage }] : [],
    success: successMessage || null,
    data: {}
  });
});

// POST /login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', { title: 'Login', errors: errors.array(), data: req.body });
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('login', {
        title: 'Login',
        errors: [{ msg: 'Invalid email or password' }],
        data: req.body
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', {
        title: 'Login',
        errors: [{ msg: 'Invalid email or password' }],
        data: req.body
      });
    }

    // Check approval status before allowing login
    // Existing users without approvalStatus are treated as approved
    const status = user.approvalStatus || 'approved';

    if (status === 'pending') {
      return res.render('login', {
        title: 'Login',
        errors: [{ msg: 'Your account is awaiting admin approval. You will receive an email once approved.' }],
        data: req.body,
        success: null
      });
    }

    if (status === 'rejected') {
      return res.render('login', {
        title: 'Login',
        errors: [{ msg: 'Your registration was not approved. Please contact the admin for more information.' }],
        data: req.body,
        success: null
      });
    }

    req.session.userId = user._id;
    res.redirect('/dashboard');

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ============================================================
// FORGOT PASSWORD FLOW
// ============================================================

// GET /forgot-password
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Forgot Password', errors: [], data: {}, success: null });
});

// POST /forgot-password — generate OTP and send email
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please enter a valid email address')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('forgot-password', { title: 'Forgot Password', errors: errors.array(), data: req.body, success: null });
  }

  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('forgot-password', {
        title: 'Forgot Password',
        errors: [{ msg: 'No account found with this email address.' }],
        data: req.body,
        success: null
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash OTP before storing
    const hashedOTP = await bcrypt.hash(otp, 10);

    // Save hashed OTP and expiry (10 minutes) to user
    user.resetOTP = hashedOTP;
    user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send OTP email
    await sendOTPEmail(email, otp);

    // Store email in session for the next steps
    req.session.resetEmail = email;

    // Redirect to OTP verification page
    res.render('verify-otp', {
      title: 'Verify OTP',
      errors: [],
      email: email
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('forgot-password', {
      title: 'Forgot Password',
      errors: [{ msg: 'Failed to send OTP. Please try again later.' }],
      data: req.body,
      success: null
    });
  }
});

// GET /verify-otp
router.get('/verify-otp', (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('verify-otp', {
    title: 'Verify OTP',
    errors: [],
    email: req.session.resetEmail
  });
});

// POST /verify-otp — validate the OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const sessionEmail = email || req.session.resetEmail;

  if (!sessionEmail) {
    return res.redirect('/forgot-password');
  }

  try {
    const user = await User.findOne({ email: sessionEmail });

    if (!user || !user.resetOTP || !user.resetOTPExpiry) {
      return res.render('verify-otp', {
        title: 'Verify OTP',
        errors: [{ msg: 'Invalid request. Please request a new OTP.' }],
        email: sessionEmail
      });
    }

    // Check if OTP has expired
    if (new Date() > user.resetOTPExpiry) {
      user.resetOTP = null;
      user.resetOTPExpiry = null;
      await user.save();
      return res.render('verify-otp', {
        title: 'Verify OTP',
        errors: [{ msg: 'OTP has expired. Please request a new one.' }],
        email: sessionEmail
      });
    }

    // Verify OTP
    const isValidOTP = await bcrypt.compare(otp, user.resetOTP);
    if (!isValidOTP) {
      return res.render('verify-otp', {
        title: 'Verify OTP',
        errors: [{ msg: 'Invalid OTP. Please check and try again.' }],
        email: sessionEmail
      });
    }

    // OTP is valid — mark in session and redirect to reset password
    req.session.otpVerified = true;
    req.session.resetEmail = sessionEmail;

    res.render('reset-password', {
      title: 'Reset Password',
      errors: [],
      email: sessionEmail
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.render('verify-otp', {
      title: 'Verify OTP',
      errors: [{ msg: 'Something went wrong. Please try again.' }],
      email: sessionEmail
    });
  }
});

// GET /reset-password
router.get('/reset-password', (req, res) => {
  if (!req.session.otpVerified || !req.session.resetEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('reset-password', {
    title: 'Reset Password',
    errors: [],
    email: req.session.resetEmail
  });
});

// POST /reset-password — set new password
router.post('/reset-password', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  const email = req.body.email || req.session.resetEmail;

  if (!email || !req.session.otpVerified) {
    return res.redirect('/forgot-password');
  }

  if (!errors.isEmpty()) {
    return res.render('reset-password', {
      title: 'Reset Password',
      errors: errors.array(),
      email: email
    });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.redirect('/forgot-password');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // Update password and clear OTP fields
    user.password = hashedPassword;
    user.resetOTP = null;
    user.resetOTPExpiry = null;
    await user.save();

    // Clear reset session data
    delete req.session.otpVerified;
    delete req.session.resetEmail;

    // Set success message and redirect to login
    req.session.successMessage = 'Password reset successful! Please login with your new password.';
    res.redirect('/login');

  } catch (error) {
    console.error('Reset password error:', error);
    res.render('reset-password', {
      title: 'Reset Password',
      errors: [{ msg: 'Something went wrong. Please try again.' }],
      email: email
    });
  }
});

module.exports = router;
