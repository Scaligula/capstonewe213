const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstName: { type: String, required: true },
  middleName: String,
  lastName: { type: String, required: true },
  suffix: String,
  contactNumber: { type: String, required: true },
  email: { type: String, required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  relationship: { type: String, enum: ['Parent', 'Guardian', 'Custodian'], default: 'Parent' }
}, { timestamps: true });

module.exports = mongoose.model('Guardian', guardianSchema);
