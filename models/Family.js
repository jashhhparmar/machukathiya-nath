const mongoose = require('mongoose');

const familySchema = new mongoose.Schema({
  vastipatrakNo: { type: Number, required: true, unique: true, index: true },
  familyHead:    { type: String, required: true, index: true },
  village:       { type: String, required: true, index: true },
  mosal:         { type: String },
  totalMembers:  { type: Number, default: 0 },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Family', familySchema);
