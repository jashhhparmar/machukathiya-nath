const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  family:         { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
  fullName:       { type: String, required: true, index: true },
  relation:       { type: String, required: true },
  gender:         { type: String, enum: ['Male', 'Female'] },
  maritalStatus:  { type: String },
  dateOfBirth:    { type: Date },
  bloodGroup:     { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', ''] },
  phone:          { type: String },
  occupation:     { type: String },
  education:      { type: String },
  membershipType: { type: String },
  address: {
    line1:   { type: String },
    suburb:  { type: String },
    city:    { type: String },
    state:   { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' }
  },
  profilePhoto: { type: String, default: '/images/no-profile.svg' },
  createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Member', memberSchema);
