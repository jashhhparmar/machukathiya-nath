const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Family = require('../models/Family');
const Member = require('../models/Member');

// GET /signup
router.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign Up', errors: [], data: {} });
});

// POST /signup — creates User + Family + Member in one go
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
    const {
      fullName, email, password, phone,
      village, mosal, occupation, education,
      gender, maritalStatus, dateOfBirth, bloodGroup,
      addressLine1, suburb, city, state, pincode
    } = req.body;

    // 1. Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.render('signup', {
        title: 'Sign Up',
        errors: [{ msg: 'This email is already registered. Please login.' }],
        data: req.body
      });
    }

    // 2. Create User (first user or admin role if specified)
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'member';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ fullName, email, password: hashedPassword, phone, role });
    await user.save();

    // 3. Auto-generate Vastipatrak number (last + 1)
    const lastFamily = await Family.findOne().sort({ vastipatrakNo: -1 });
    const vastipatrakNo = lastFamily ? lastFamily.vastipatrakNo + 1 : 1001;

    // 4. Create Family
    const family = new Family({
      vastipatrakNo,
      familyHead: fullName.toUpperCase(),
      village: village.toUpperCase(),
      mosal: mosal ? mosal.toUpperCase() : '',
      totalMembers: 1,
      createdBy: user._id
    });
    await family.save();

    // 5. Create Member (the person who signed up = SELF)
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

    // 6. Set session and redirect
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
  req.session.errorMessage = null;
  res.render('login', {
    title: 'Login',
    errors: errorMessage ? [{ msg: errorMessage }] : [],
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

module.exports = router;
