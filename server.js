require('dns').setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const User = require('./models/User');

const app = express();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mii_vle';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use(session({
  secret: process.env.SECRET_KEY || 'default_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI })
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id).then(user => done(null, user)).catch(done);
});

// Users who can log in as multiple roles. Key = email, value = [roles] (first is default).
const DUAL_ROLE_USERS = {
  'rodriguezdale364@gmail.com': ['student', 'admin'],
};

// External (non-mii.edu.ph) emails allowed as student-only accounts.
const ALLOWED_STUDENT_EMAILS = [
  'scal42069@gmail.com',
];

// Build the absolute callback URL. On Vercel the internal request arrives over
// HTTP, so we must use the env var to guarantee the https:// scheme that
// Google requires.  Falls back to localhost for local development.
const callbackURL = (process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback').trim();
console.log('[OAuth] callbackURL =', callbackURL);
console.log('[OAuth] GOOGLE_CLIENT_ID set?', !!process.env.GOOGLE_CLIENT_ID);

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL,
  proxy: true,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const allowedExternal = [...Object.keys(DUAL_ROLE_USERS), ...ALLOWED_STUDENT_EMAILS];
    if (!email || (!email.endsWith('@mii.edu.ph') && !allowedExternal.includes(email))) {
      return done(null, false, { message: 'Email domain not allowed' });
    }
    let user = await User.findOne({ email });
    const dualRoles = DUAL_ROLE_USERS[email];
    if (!user) {
      user = new User({
        email,
        role: dualRoles ? dualRoles[0] : 'student',
        roles: dualRoles || [],
        name: profile.displayName || 'Unknown',
        profilePicture: profile.photos?.[0]?.value,
        permissions: dualRoles?.includes('admin')
          ? ['manage_users', 'manage_courses', 'manage_announcements']
          : [],
      });
      await user.save();
    } else {
      // Sync dual-role data if needed
      if (dualRoles && (!user.roles || user.roles.length < 2)) {
        user.roles = dualRoles;
        user.permissions = ['manage_users', 'manage_courses', 'manage_announcements'];
        await user.save();
      }
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

app.get('/debug-callback', (req, res) => {
  const cid = process.env.GOOGLE_CLIENT_ID || '';
  res.json({
    callbackURL,
    callbackURL_raw: process.env.GOOGLE_CALLBACK_URL || '(not set, using default)',
    callbackURL_length: (process.env.GOOGLE_CALLBACK_URL || '').length,
    clientID_preview: cid.substring(0, 15) + '...' + cid.slice(-20),
    clientID_set: !!process.env.GOOGLE_CLIENT_ID,
    clientSecret_set: !!process.env.GOOGLE_CLIENT_SECRET,
    host: req.get('host'),
    protocol: req.protocol,
    xForwardedProto: req.get('x-forwarded-proto'),
  });
});

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: '/?login=failed'
}), (req, res) => {
  const userRoles = req.user.roles || [];
  if (userRoles.length > 1) {
    // Multi-role user: clear any cached role and let them choose
    req.session.activeRole = null;
    return res.redirect('/role-select.html');
  }
  const role = req.user.role;
  if (role === 'admin') return res.redirect('/admin-dashboard.html');
  if (role === 'staff') return res.redirect('/staff-dashboard.html');
  if (role === 'parent') return res.redirect('/parent-dashboard.html');
  res.redirect('/student-dashboard.html');
});

app.get('/auth/logout', (req, res, next) => {
  req.session.activeRole = null;
  req.logout(err => err ? next(err) : res.redirect('/'));
});

// Set the active role for the current session (dual-role users only)
app.post('/api/session/role', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const { role } = req.body;
  const available = req.user.roles?.length ? req.user.roles : [req.user.role];
  if (!available.includes(role)) return res.status(403).json({ error: 'Role not available for this account' });
  req.session.activeRole = role;
  res.json({ role });
});

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const user = req.user.toObject ? req.user.toObject() : { ...req.user };
  const available = user.roles?.length ? user.roles : [user.role];
  if (req.session.activeRole && available.includes(req.session.activeRole)) {
    user.role = req.session.activeRole;
  }
  res.json(user);
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('enrolledCourses');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/:id/courses', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('enrolledCourses');
    res.json(user.enrolledCourses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/course/:id', async (req, res) => {
  try {
    const Course = require('./models/Course');
    const course = await Course.findById(req.params.id)
      .populate('teacher')
      .populate('students')
      .populate('assignments')
      .populate('announcements');
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/course/:id/assignments', async (req, res) => {
  try {
    const Course = require('./models/Course');
    const course = await Course.findById(req.params.id).populate('assignments');
    res.json(course?.assignments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const Announcement = require('./models/Announcement');
    const announcements = await Announcement.find().populate('author').sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Admin Middleware =====
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const available = req.user.roles?.length ? req.user.roles : [req.user.role];
  const activeRole = req.session.activeRole && available.includes(req.session.activeRole)
    ? req.session.activeRole
    : req.user.role;
  if (activeRole !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ===== Admin: Users =====
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).populate('enrolledCourses', 'name subject').lean();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, name, role, language } = req.body;
    if (!email || !name || !role) return res.status(400).json({ error: 'email, name, and role are required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    const normalEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: normalEmail });
    if (exists) return res.status(409).json({ error: 'Email already registered' });
    const user = await User.create({
      email: normalEmail,
      name: name.trim(),
      role,
      language: language || 'English',
      permissions: role === 'admin' ? ['manage_users', 'manage_courses', 'manage_announcements'] : [],
    });
    res.status(201).json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'role', 'permissions', 'enrolledCourses', 'language'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.role === 'admin' && !update.permissions) {
      update.permissions = ['manage_users', 'manage_courses', 'manage_announcements'];
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('enrolledCourses', 'name subject');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) return res.status(400).json({ error: 'Cannot delete your own account' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/reset', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      $unset: { grades: '', progress: '' },
      $set: { enrolledCourses: [] },
    }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== Admin: Courses =====
app.get('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const Course = require('./models/Course');
    const courses = await Course.find({}).populate('teacher', 'name').lean();
    res.json(courses);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const Course = require('./models/Course');
    const allowed = ['teacher', 'students'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('teacher', 'name');
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== Admin: Analytics =====
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const Course = require('./models/Course');
    const [students, faculty, courses] = await Promise.all([
      User.find({ role: 'student' }).select('name grades progress enrolledCourses').lean(),
      User.find({ role: 'staff' }).select('name email').lean(),
      Course.find({}).select('name subject students').lean(),
    ]);
    const subjectGrades = {};
    students.forEach(s => {
      (s.grades || []).forEach(g => {
        if (!subjectGrades[g.subject]) subjectGrades[g.subject] = [];
        subjectGrades[g.subject].push(parseFloat(g.grade || 0));
      });
    });
    const subjectAverages = {};
    for (const [subject, grades] of Object.entries(subjectGrades)) {
      subjectAverages[subject] = +(grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1);
    }
    const allGrades = students.flatMap(s => (s.grades || []).map(g => parseFloat(g.grade || 0)));
    const classAverage = allGrades.length
      ? +(allGrades.reduce((a, b) => a + b, 0) / allGrades.length).toFixed(1)
      : 0;
    const studentSummaries = students.map(s => {
      const grades = s.grades || [];
      const gradeAvg = grades.length
        ? +(grades.reduce((sum, g) => sum + parseFloat(g.grade || 0), 0) / grades.length).toFixed(1)
        : null;
      const progressVals = s.progress
        ? [...Object.values(s.progress.islamic || {}), ...Object.values(s.progress.academic || {})].filter(v => v != null)
        : [];
      const progressAvg = progressVals.length
        ? +(progressVals.reduce((a, b) => a + b, 0) / progressVals.length).toFixed(0)
        : null;
      return { _id: s._id, name: s.name, gradeAvg, progressAvg, coursesCount: (s.enrolledCourses || []).length };
    });
    res.json({
      totalStudents: students.length,
      totalFaculty: faculty.length,
      totalCourses: courses.length,
      classAverage,
      subjectAverages,
      students: studentSummaries,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== Admin: Students =====
app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const Student = require('./models/Student');
    const students = await Student.find({})
      .populate('user', 'email')
      .populate('guardians')
      .lean();
    res.json(students);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const Student = require('./models/Student');
    const Guardian = require('./models/Guardian');
    const { student: studentData, guardian: guardianData } = req.body;

    if (!studentData || !guardianData) {
      return res.status(400).json({ error: 'Student and guardian data are required' });
    }

    // Check if student ID already exists
    const existingStudent = await Student.findOne({ studentId: studentData.studentId });
    if (existingStudent) {
      return res.status(409).json({ error: 'Student ID already exists' });
    }

    // Create guardian
    const guardian = await Guardian.create({
      firstName: guardianData.firstName,
      middleName: guardianData.middleName,
      lastName: guardianData.lastName,
      suffix: guardianData.suffix,
      contactNumber: guardianData.contactNumber,
      email: guardianData.email
    });

    // Create student
    const newStudent = await Student.create({
      firstName: studentData.firstName,
      middleName: studentData.middleName,
      lastName: studentData.lastName,
      suffix: studentData.suffix,
      studentId: studentData.studentId,
      course: studentData.course,
      grade: studentData.grade,
      guardians: [guardian._id]
    });

    guardian.students.push(newStudent._id);
    await guardian.save();

    const populatedStudent = await newStudent.populate('guardians');
    res.status(201).json(populatedStudent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/students/:id', requireAdmin, async (req, res) => {
  try {
    const Student = require('./models/Student');
    const student = await Student.findById(req.params.id)
      .populate('user')
      .populate('guardians')
      .populate('enrolledCourses')
      .populate('attendance')
      .populate('feedbacks');
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/students/:id', requireAdmin, async (req, res) => {
  try {
    const Student = require('./models/Student');
    const Guardian = require('./models/Guardian');
    const { student: studentData, guardian: guardianData } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Update student data
    if (studentData) {
      student.firstName = studentData.firstName || student.firstName;
      student.middleName = studentData.middleName !== undefined ? studentData.middleName : student.middleName;
      student.lastName = studentData.lastName || student.lastName;
      student.suffix = studentData.suffix !== undefined ? studentData.suffix : student.suffix;
      student.course = studentData.course || student.course;
      student.grade = studentData.grade || student.grade;
      await student.save();
    }

    // Update guardian data
    if (guardianData && student.guardians.length > 0) {
      const guardian = await Guardian.findById(student.guardians[0]);
      if (guardian) {
        guardian.firstName = guardianData.firstName || guardian.firstName;
        guardian.middleName = guardianData.middleName !== undefined ? guardianData.middleName : guardian.middleName;
        guardian.lastName = guardianData.lastName || guardian.lastName;
        guardian.suffix = guardianData.suffix !== undefined ? guardianData.suffix : guardian.suffix;
        guardian.contactNumber = guardianData.contactNumber || guardian.contactNumber;
        guardian.email = guardianData.email || guardian.email;
        await guardian.save();
      }
    }

    const updatedStudent = await student.populate('guardians');
    res.json(updatedStudent);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/students/:id', requireAdmin, async (req, res) => {
  try {
    const Student = require('./models/Student');
    const Guardian = require('./models/Guardian');
    const Attendance = require('./models/Attendance');
    const TeacherFeedback = require('./models/TeacherFeedback');

    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Delete associated guardians
    if (student.guardians) {
      await Guardian.deleteMany({ _id: { $in: student.guardians } });
    }

    // Delete associated attendance records
    if (student.attendance) {
      await Attendance.deleteMany({ _id: { $in: student.attendance } });
    }

    // Delete associated feedback
    if (student.feedbacks) {
      await TeacherFeedback.deleteMany({ _id: { $in: student.feedbacks } });
    }

    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== Parent/Guardian Login =====
// Middleware to check if user is parent or guardian
function requireParent(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const available = req.user.roles?.length ? req.user.roles : [req.user.role];
  const activeRole = req.session.activeRole && available.includes(req.session.activeRole)
    ? req.session.activeRole
    : req.user.role;
  if (activeRole !== 'parent') return res.status(403).json({ error: 'Forbidden' });
  next();
}

app.post('/auth/parent-login', async (req, res) => {
  try {
    const { email, studentId } = req.body;
    if (!email || !studentId) {
      return res.status(400).json({ error: 'Email and student ID are required' });
    }

    const Guardian = require('./models/Guardian');
    const Student = require('./models/Student');

    const guardian = await Guardian.findOne({ email: email.toLowerCase() });
    if (!guardian) {
      return res.status(401).json({ error: 'Guardian not found' });
    }

    const student = await Student.findOne({ studentId, _id: { $in: guardian.students } });
    if (!student) {
      return res.status(401).json({ error: 'Student not associated with this guardian' });
    }

    // Create session for parent
    req.session.guardianId = guardian._id;
    req.session.studentId = student._id;
    req.session.parentRole = true;
    req.session.isParent = true;

    res.json({ success: true, message: 'Logged in successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/parent-logout', (req, res) => {
  req.session.guardianId = null;
  req.session.studentId = null;
  req.session.parentRole = null;
  req.session.isParent = null;
  res.redirect('/parent-login.html');
});

// ===== Parent API Routes =====
app.get('/api/parent/dashboard', async (req, res) => {
  try {
    if (!req.session.guardianId || !req.session.studentId) {
      return res.status(401).json({ error: 'Not authenticated as parent' });
    }

    const Student = require('./models/Student');
    const Guardian = require('./models/Guardian');

    const student = await Student.findById(req.session.studentId)
      .populate('enrolledCourses', 'name subject')
      .populate('guardians');
    const guardian = await Guardian.findById(req.session.guardianId);

    res.json({ student, guardian });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parent/student/:studentId/grades', async (req, res) => {
  try {
    if (!req.session.guardianId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Student = require('./models/Student');
    const student = await Student.findById(req.params.studentId)
      .populate({
        path: 'enrolledCourses',
        select: 'name subject'
      });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Verify the requesting guardian has access to this student
    const Guardian = require('./models/Guardian');
    const guardian = await Guardian.findById(req.session.guardianId);
    if (!guardian.students.includes(student._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        courses: student.enrolledCourses,
        currentGrade: student.grade
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parent/student/:studentId/attendance', async (req, res) => {
  try {
    if (!req.session.guardianId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Student = require('./models/Student');
    const Attendance = require('./models/Attendance');
    const Guardian = require('./models/Guardian');

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Verify access
    const guardian = await Guardian.findById(req.session.guardianId);
    if (!guardian.students.includes(student._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const attendance = await Attendance.find({ student: student._id })
      .populate('course', 'name subject')
      .sort({ date: -1 });

    res.json({
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId
      },
      attendance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parent/student/:studentId/announcements', async (req, res) => {
  try {
    if (!req.session.guardianId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Student = require('./models/Student');
    const Announcement = require('./models/Announcement');
    const Guardian = require('./models/Guardian');

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Verify access
    const guardian = await Guardian.findById(req.session.guardianId);
    if (!guardian.students.includes(student._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const announcements = await Announcement.find({
      $or: [
        { course: { $in: student.enrolledCourses } },
        { isGlobal: true }
      ]
    })
      .populate('author', 'name')
      .populate('course', 'name')
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parent/student/:studentId/feedback', async (req, res) => {
  try {
    if (!req.session.guardianId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Student = require('./models/Student');
    const TeacherFeedback = require('./models/TeacherFeedback');
    const Guardian = require('./models/Guardian');

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Verify access
    const guardian = await Guardian.findById(req.session.guardianId);
    if (!guardian.students.includes(student._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const feedbacks = await TeacherFeedback.find({ student: student._id })
      .populate('teacher', 'name')
      .populate('course', 'name')
      .sort({ date: -1 });

    res.json({
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId
      },
      feedbacks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only redirect unknown non-file, non-API routes to Meba-Islamic-Institute.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'Meba-Islamic-Institute.html'));
});

// Export for Vercel serverless; also listen locally when run directly.
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`MADRASAH VLE listening on http://localhost:${port}`);
  });
}

module.exports = app;
