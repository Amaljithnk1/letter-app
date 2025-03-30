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

// 1. FIX FOR COOP ERRORS - Remove problematic headers
app.use((req, res, next) => {
  // Remove headers that block popup windows
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  
  // Keep other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// 2. CORS Configuration
const allowedOrigins = [
  'https://letter-app-mguk.onrender.com',
  'https://letter-app-phi.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 3. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'running',
    environment: process.env.NODE_ENV || 'development' 
  });
});

// 4. Store Tokens Endpoint
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
    console.error('Token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Google Drive Endpoint
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
    console.error('Drive error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
sequelize.sync().then(() => {
  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`
      Server running on port ${port}
      COOP/COEP headers disabled for Firebase auth
      Allowed origins: ${allowedOrigins.join(', ')}
    `);
  });
});