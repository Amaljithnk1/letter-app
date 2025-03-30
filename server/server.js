require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { sequelize, User, Letter } = require('./models');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

const app = express();

// Fix 1: Enhanced CORS configuration
const allowedOrigins = [
  'https://letter-app-mguk.onrender.com',
  'https://letter-app-phi.vercel.app',
  'https://letter-app-git-main-amaljithnk1s-projects.vercel.app',
  'https://letter-6mu29sbsm-amaljithnk1s-projects.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Fix 2: Add OPTIONS handler for preflight requests
app.options('*', cors());

app.use(express.json());

// Original endpoints below (unchanged)
app.post('/api/auth/store-tokens', async (req, res) => {
  try {
    const { accessToken } = req.body;
    const firebaseToken = req.headers.authorization.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    
    await User.upsert({
      uid: decoded.uid,
      email: decoded.email,
      driveAccessToken: accessToken
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/letters', async (req, res) => {
  try {
    const firebaseToken = req.headers.authorization.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const user = await User.findOne({ where: { uid: decoded.uid } });
    
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: user.driveAccessToken });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const file = await drive.files.create({
      requestBody: {
        name: `${req.body.title}.txt`,
        mimeType: 'text/plain'
      },
      media: {
        mimeType: 'text/plain',
        body: req.body.content
      },
      fields: 'webViewLink'
    });
    
    await Letter.create({
      title: req.body.title,
      content: req.body.content,
      driveId: file.data.id,
      userId: user.uid
    });
    
    res.json({ driveLink: file.data.webViewLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
sequelize.sync().then(() => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});