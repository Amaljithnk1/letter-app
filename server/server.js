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

// Configure CORS with all your domains
const allowedOrigins = [
  'https://letter-app-mguk.onrender.com',
  'https://letter-app-phi.vercel.app',
  'https://letter-app-git-main-amaljithnk1s-projects.vercel.app',
  'https://letter-6mu29sbsm-amaljithnk1s-projects.vercel.app',
  'http://localhost:3000'
];

// Critical security headers for Firebase auth
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups'); // Changed from unsafe-none
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless'); // Changed from unsafe-none
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or server-to-server)
    if (!origin) {
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      // In production, you might want to be more restrictive
      return callback(null, true);
    }

    // Case-insensitive check for allowed origins
    const originAllowed = allowedOrigins.some(allowed => 
      origin.toLowerCase() === allowed.toLowerCase() ||
      origin.toLowerCase().includes(allowed.toLowerCase().replace('https://', '').replace('http://', ''))
    );

    if (originAllowed) {
      return callback(null, true);
    }

    console.error(`CORS blocked: ${origin} | Allowed: ${allowedOrigins.join(', ')}`);
    return callback(new Error(`Not allowed by CORS. Allowed: ${allowedOrigins.join(', ')}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Store tokens endpoint
app.post('/api/auth/store-tokens', async (req, res) => {
  try {
    const { accessToken } = req.body;
    const firebaseToken = req.headers.authorization?.split(' ')[1];
    
    if (!firebaseToken) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    
    await User.upsert({
      uid: decoded.uid,
      email: decoded.email,
      driveAccessToken: accessToken
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Token storage error:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code 
    });
  }
});

// Save to Google Drive endpoint
app.post('/api/letters', async (req, res) => {
  try {
    const firebaseToken = req.headers.authorization?.split(' ')[1];
    
    if (!firebaseToken) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const user = await User.findOne({ where: { uid: decoded.uid } });
    
    if (!user?.driveAccessToken) {
      return res.status(403).json({ error: 'Google Drive not connected' });
    }
    
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
    console.error('Drive API error:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
sequelize.sync().then(() => {
  const port = process.env.PORT || 10000; // Changed to match Render's port
  app.listen(port, () => {
    console.log(`
      Server running on port ${port}
      Allowed Origins: ${allowedOrigins.join(', ')}
      Environment: ${process.env.NODE_ENV || 'development'}
    `);
  });
});