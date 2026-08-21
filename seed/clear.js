require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Family = require('../models/Family');
const Member = require('../models/Member');
const User = require('../models/User');

const clearAll = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected...');

    await User.deleteMany({});
    await Family.deleteMany({});
    await Member.deleteMany({});

    console.log('✅ All users, families, and members cleared!');
    console.log('Database is fresh and ready.');
    mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

clearAll();
