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

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const ALLOWED_TEST = ['rodriguezdale364@gmail.com'];
    if (!email || (!email.endsWith('@mii.edu.ph') && !ALLOWED_TEST.includes(email))) {
      return done(null, false, { message: 'Email domain not allowed' });
    }
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        role: 'student',
        name: profile.displayName || 'Unknown',
        profilePicture: profile.photos?.[0]?.value,
      });
      await user.save();
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: '/?login=failed'
}), (req, res) => {
  const role = req.user.role;
  if (role === 'admin') return res.redirect('/admin-dashboard.html');
  if (role === 'staff') return res.redirect('/staff-dashboard.html');
  if (role === 'parent') return res.redirect('/parent-dashboard.html');
  res.redirect('/student-dashboard.html');
});

app.get('/auth/logout', (req, res, next) => {
  req.logout(err => err ? next(err) : res.redirect('/'));
});

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.user);
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

// Only redirect unknown non-file, non-API routes to index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MADRASAH VLE listening on http://localhost:${port}`);
});
