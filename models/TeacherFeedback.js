const mongoose = require('mongoose');

const teacherFeedbackSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  feedback: { type: String, required: true },
  date: { type: Date, default: Date.now },
  type: { type: String, enum: ['General', 'Behavioral', 'Academic', 'Other'], default: 'General' }
}, { timestamps: true });

module.exports = mongoose.model('TeacherFeedback', teacherFeedbackSchema);
