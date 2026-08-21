require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Family = require('../models/Family');
const Member = require('../models/Member');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/machhu_gyati');
    console.log('MongoDB connected for seeding');
  } catch (err) {
    console.error('Connection error', err);
    process.exit(1);
  }
};

const villages = ['PILWAI', 'VADNAGAR', 'UNJHA', 'CHANASMA', 'VISNAGAR', 'MEHSANA', 'PATAN', 'SIDHPUR', 'KADI', 'KALOL'];
const gotras = ['SALIYANA', 'KASHYAP', 'BHARADWAJ', 'GAUTAM', 'VASISHTHA'];
const occupations = ['BUSINESS', 'SERVICE', 'DOCTOR', 'ENGINEER', 'TEACHER', 'SHOP OWNER'];
const surnames = ['Suthar', 'Mistri', 'Panchal', 'Gajjar'];

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateSeedData = async () => {
  await connectDB();

  try {
    console.log('Clearing old data...');
    await Family.deleteMany({});
    await Member.deleteMany({});

    console.log('Generating 50 families...');
    let vastipatrakCounter = 1001;

    for (let i = 0; i < 50; i++) {
      const surname = randomItem(surnames);
      const headName = `Ramesh ${surname}`; // simple dummy name for head
      const familyHead = `${headName}`;
      
      const newFamily = new Family({
        vastipatrakNo: vastipatrakCounter++,
        familyHead: familyHead,
        village: randomItem(villages),
        gotra: randomItem(gotras),
        totalMembers: 0 // Will update later
      });
      
      await newFamily.save();

      // Create members for this family (3 to 6)
      const numMembers = Math.floor(Math.random() * 4) + 3; 
      
      const members = [];
      const relations = ['SELF', 'WIFE', 'SON', 'DAUGHTER', 'DAUGHTER IN LAW', 'GRAND SON'];
      
      for (let j = 0; j < numMembers; j++) {
        let relation = relations[j] || 'SON';
        let gender = (relation === 'WIFE' || relation === 'DAUGHTER' || relation === 'DAUGHTER IN LAW') ? 'Female' : 'Male';
        let maritalStatus = (relation === 'WIFE' || relation === 'SELF' || relation === 'DAUGHTER IN LAW') ? 'Married' : 'Single';
        
        let fullName = j === 0 ? headName : `${['Suresh', 'Bhavna', 'Raju', 'Kavita', 'Manoj', 'Neha'][j]} ${surname}`;
        
        members.push({
          family: newFamily._id,
          fullName: fullName,
          relation: relation,
          gender: gender,
          maritalStatus: maritalStatus,
          dateOfBirth: new Date(1960 + (j * 10), Math.floor(Math.random()*12), Math.floor(Math.random()*28)+1),
          phone: `98${Math.floor(Math.random()*100000000)}`,
          occupation: randomItem(occupations),
          education: 'Graduate',
          membershipType: 'Life Member',
          address: {
            line1: '123 Society',
            city: randomItem(villages),
            state: 'Gujarat',
            pincode: '380001',
            country: 'India'
          }
        });
      }
      
      await Member.insertMany(members);
      
      // Update total members
      newFamily.totalMembers = numMembers;
      await newFamily.save();
    }

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    mongoose.disconnect();
  }
};

generateSeedData();
