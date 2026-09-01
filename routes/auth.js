const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Family = require('../models/Family');
const Member = require('../models/Member');
const { sendOTPEmail } = require('../config/mailer');

// GET /signup
router.get('/signup', (req, res) => {
  // If there's pending signup data in session, pre-fill the form
  const pendingData = req.session.pendingSignup || {};
  res.render('signup', { title: 'Sign Up', errors: [], data: pendingData });
});

// POST /signup — validates and stores data in session, then redirects to T&C
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

    // Redirect to Terms & Conditions page
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

    // 1. Create User (first user = admin)
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'member';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ fullName, email, password: hashedPassword, phone, role });
    await user.save();

    // 2. Auto-generate Vastipatrak number (last + 1)
    const lastFamily = await Family.findOne().sort({ vastipatrakNo: -1 });
    const vastipatrakNo = lastFamily ? lastFamily.vastipatrakNo + 1 : 1001;

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
      occupation: occupation ? occupation.toUpperCase() : '',
      education: education || '',
      membershipType: 'Life Member',
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

    // 5. Clear pending signup data and set session
    delete req.session.pendingSignup;
    req.session.userId = user._id;
    req.session.familyId = family._id;
    res.redirect('/dashboard');

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
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
