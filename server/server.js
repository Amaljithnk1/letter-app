require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { sequelize, User, Letter } = require('./models');

// Initialize Firebase Admin with enhanced error handling
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  process.exit(1);
}

const app = express();

// Configure CORS using environment variables
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000'];

// Add Vercel preview URLs pattern matching
const isVercelPreview = (origin) => {
  return origin && /\.vercel\.app$/.test(origin);
};

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or server-to-server)
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Allow all Vercel preview deployments
    if (isVercelPreview(origin)) {
      return callback(null, true);
    }
    
    // Check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`Blocked by CORS: ${origin}`);
    console.log('Allowed origins:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    allowedOrigins,
    vercelPreviewEnabled: true
  });
});

// Token storage endpoint with validation
app.post('/api/auth/store-tokens', async (req, res) => {
  try {
    const { accessToken, refreshToken } = req.body;
    
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const firebaseToken = req.headers.authorization.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(firebaseToken);

    await User.upsert({
      uid: decoded.uid,
      email: decoded.email,
      driveAccessToken: accessToken,
      driveRefreshToken: refreshToken,
      lastLogin: new Date()
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

// Google Drive integration with automatic token refresh
app.post('/api/letters', async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const firebaseToken = req.headers.authorization.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const user = await User.findOne({ where: { uid: decoded.uid } });

    if (!user?.driveAccessToken) {
      return res.status(403).json({ error: 'Google Drive not connected' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.driveAccessToken,
      refresh_token: user.driveRefreshToken
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await User.update(
          { driveRefreshToken: tokens.refresh_token },
          { where: { uid: user.uid } }
        );
      }
      if (tokens.access_token) {
        await User.update(
          { driveAccessToken: tokens.access_token },
          { where: { uid: user.uid } }
        );
      }
    });

    const drive = google.drive({ 
      version: 'v3', 
      auth: oauth2Client 
    });

    const file = await drive.files.create({
      requestBody: {
        name: `${req.body.title}.txt`,
        mimeType: 'text/plain',
        parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? 
          [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined
      },
      media: {
        mimeType: 'text/plain',
        body: req.body.content
      },
      fields: 'id,webViewLink,webContentLink'
    });

    await Letter.create({
      title: req.body.title,
      content: req.body.content,
      driveId: file.data.id,
      userId: user.uid,
      driveUrl: file.data.webViewLink
    });

    res.json({
      success: true,
      driveLink: file.data.webViewLink,
      downloadLink: file.data.webContentLink
    });

  } catch (error) {
    console.error('Drive API error:', error);
    
    if (error.code === 401) {
      return res.status(401).json({ 
        error: 'Google authentication expired',
        action: 'reconnect-google' 
      });
    }
    
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

// Database sync and server start
sequelize.sync({ alter: true })
  .then(() => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`
      Server running on port ${port}
      Environment: ${process.env.NODE_ENV || 'development'}
      Allowed Origins: ${allowedOrigins.join(', ')}
      Vercel Preview Enabled: true
      Firebase Project: ${process.env.FIREBASE_PROJECT_ID}
      `);
    });
  })
  .catch(err => {
    console.error('Database sync failed:', err);
    process.exit(1);
  });

module.exports = app;