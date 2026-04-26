const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  studentId: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  middleName: String,
  lastName: { type: String, required: true },
  suffix: String,
  course: { type: String, required: true },
  grade: { type: String, required: true },
  guardians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }],
  enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  attendance: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' }],
  feedbacks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TeacherFeedback' }]
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
