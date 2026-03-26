const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  subject: { type: String, enum: ['Quran', 'Hadith', 'Fiqh', 'Arabic', 'Mathematics', 'English', 'Science', 'Other'] },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
  announcements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Announcement' }],
  courseOutline: [{ title: String, content: String, order: Number }],
  treeView: [{ title: String, children: [{ title: String, type: String, content: String }] }]
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
