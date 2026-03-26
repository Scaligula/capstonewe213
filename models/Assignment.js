const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  dueDate: { type: Date, required: true },
  startDate: { type: Date, default: Date.now },
  submissions: [{ student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, submittedAt: Date, content: String, grade: String }]
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
