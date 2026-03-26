const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['student', 'parent', 'admin', 'staff'], required: true },
  name: { type: String, required: true },
  birthday: { type: Date },
  profilePicture: { type: String },
  language: { type: String, enum: ['Arabic', 'English', 'Filipino'], default: 'English' },
  enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  grades: [{ course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, subject: String, grade: String }],
  progress: {
    islamic: { quran: Number, hadith: Number, fiqh: Number, arabic: Number },
    academic: { mathematics: Number, english: Number, science: Number }
  },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permissions: [String]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
