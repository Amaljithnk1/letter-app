require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { sequelize, User, Letter } = require('./models');

// Initialize Firebase Admin (Updated)
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

const app = express();
app.use(cors());
app.use(express.json());

// Store Google Tokens Endpoint (Essential)
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

// Save to Google Drive Endpoint (Essential)
app.post('/api/letters', async (req, res) => {
  try {
    // Verify Firebase token
    const firebaseToken = req.headers.authorization.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    
    // Get user with Drive token
    const user = await User.findOne({ where: { uid: decoded.uid } });
    if (!user.driveAccessToken) throw new Error('No Drive access');
    
    // Initialize Google Drive API
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: user.driveAccessToken });
    
    const drive = google.drive({ version: 'v3', auth });
    
    // Create file in user's Drive
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
    
    // Save to database
    await Letter.create({
      title: req.body.title,
      content: req.body.content,
      driveId: file.data.id,
      userId: user.uid
    });
    
    res.json({ driveLink: file.data.webViewLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
sequelize.sync().then(() => {
  app.listen(process.env.PORT || 5000, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
});