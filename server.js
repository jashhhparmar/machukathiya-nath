require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const expressLayouts = require('express-ejs-layouts');
const connectDB = require('./config/db');

// Connect to Database
connectDB();

const app = express();

// View Engine
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/machhu_gyati' })
}));

// Res.locals for views
const User = require('./models/User');
const Setting = require('./models/Setting');
app.use(async (req, res, next) => {
  res.locals.user = null;
  res.locals.siteLogo = '/images/logo.png';
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).lean();
      res.locals.user = user;
    } catch (err) {
      console.error(err);
    }
  }
  try {
    const logoSetting = await Setting.findOne({ key: 'siteLogo' }).lean();
    if (logoSetting && logoSetting.value) {
      res.locals.siteLogo = logoSetting.value;
    }
  } catch (err) {
    console.error(err);
  }
  next();
});

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'Welcome to Machhu Kathiya Sai Suthar Gyati' });
});
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/vastipatrak'));
app.use('/', require('./routes/family'));
app.use('/', require('./routes/member'));
app.use('/', require('./routes/admin'));

// 404 Handler
app.use((req, res) => {
  res.status(404).send(`
    <div style="text-align:center;padding:100px;font-family:Nunito,sans-serif;">
      <h1 style="color:#046957;font-size:4rem;">404</h1>
      <p style="font-size:1.2rem;color:#666;">Page not found</p>
      <a href="/" style="color:#046957;text-decoration:none;font-weight:700;">← Back to Home</a>
    </div>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
