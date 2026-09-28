const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const UserModel = require('../models/User');
const { generateToken, sendEmail, generateVerificationToken, generateResetPasswordToken } = require('../utils/auth');

let firebaseInitialized = false;

try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    firebaseInitialized = true;
    console.log('Firebase Admin initialized successfully');
  } else {
    console.log('Firebase credentials not configured, using development mode');
  }
} catch (error) {
  console.log('Firebase Admin initialization error:', error.message);
}

async function verifyFirebaseToken(idToken) {
  if (!firebaseInitialized) {
    console.log('Firebase not initialized, skipping token verification');
    return null;
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Firebase token verification failed:', error.message);
    return null;
  }
}

// @route   POST /api/auth/send-verification-code
// @desc    Send verification code to email
// @access  Public
router.post('/send-verification-code', async (req, res) => {
  const { email } = req.body;
  const db = req.db;

  try {
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    if (!db.verificationCodes) {
      db.verificationCodes = {};
    }
    db.verificationCodes[email] = { code, expiresAt };

    console.log(`[验证码] 邮箱: ${email}, 验证码: ${code}`);

    try {
      await sendEmail({
        email,
        subject: '您的验证码 - UniTally',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">验证码</h2>
            <p>您正在注册 UniTally 账户，您的验证码是：</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #6b7280; font-size: 14px;">验证码有效期为 10 分钟，请勿将验证码告知他人。</p>
            <p style="color: #6b7280; font-size: 14px;">如果您没有请求此验证码，请忽略此邮件。</p>
          </div>
        `
      });
    } catch (emailError) {
      console.log('Email sending failed:', emailError.message);
    }

    res.json({ 
      success: true, 
      message: 'Verification code sent',
      devCode: process.env.NODE_ENV === 'development' ? code : undefined
    });
  } catch (error) {
    console.error('Send verification code error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/auth/verify-code
// @desc    Verify email code
// @access  Public
router.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;
  const db = req.db;

  try {
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const storedData = db.verificationCodes?.[email];
    
    if (!storedData) {
      return res.status(400).json({ error: 'No verification code found for this email' });
    }

    if (storedData.expiresAt < Date.now()) {
      delete db.verificationCodes[email];
      return res.status(400).json({ error: 'Verification code expired' });
    }

    if (storedData.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    delete db.verificationCodes[email];

    res.json({ success: true, message: 'Verification successful' });
  } catch (error) {
    console.error('Verify code error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/auth/register
// @desc    Register user with email and password
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  const db = req.db;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please provide name, email and password' });
    }

    let user = await UserModel.findOne(db, { email });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const verificationToken = generateVerificationToken();

    user = await UserModel.create(db, {
      name,
      email,
      password,
      provider: 'email',
      verificationToken,
      isVerified: true // Auto-verify in development mode
    });

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/verify-email?token=${verificationToken}&email=${email}`;
    
    try {
      await sendEmail({
        email: user.email,
        subject: 'Verify your email',
        html: `
          <h1>Verify your email</h1>
          <p>Click the link below to verify your email:</p>
          <a href="${verificationUrl}">Verify Email</a>
        `
      });
    } catch (emailError) {
      console.log('Email sending failed (development mode):', emailError.message);
    }

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        provider: user.provider,
        isVerified: user.isVerified
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with email and password
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = req.db;

  try {
    const user = await UserModel.findOne(db, { email });
    if (!user || user.provider !== 'email') {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        provider: user.provider,
        isVerified: user.isVerified
      },
      token
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/auth/firebase
// @desc    Login with Firebase (Google, etc.)
// @access  Public
router.post('/firebase', async (req, res) => {
  const { idToken } = req.body;
  const db = req.db;

  try {
    const decodedToken = await verifyFirebaseToken(idToken);
    
    if (!decodedToken) {
      if (process.env.NODE_ENV === 'development' || !firebaseInitialized) {
        const { email, name, picture, uid } = req.body;
        
        if (!email) {
          return res.status(400).json({ error: 'Email is required in development mode' });
        }

        let user = await UserModel.findOne(db, { email });

        if (user) {
          if (user.provider !== 'firebase') {
            user = await UserModel.update(db, { email }, {
              provider: 'firebase',
              firebaseUid: uid,
              avatar: picture || user.avatar
            });
          }
        } else {
          user = await UserModel.create(db, {
            name: name || email.split('@')[0],
            email,
            avatar: picture,
            provider: 'firebase',
            firebaseUid: uid,
            isVerified: true
          });
        }

        const token = generateToken(user.id);

        return res.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            provider: user.provider,
            isVerified: user.isVerified
          },
          token
        });
      }
      
      return res.status(401).json({ error: 'Invalid Firebase token' });
    }

    const { email, name, picture, uid } = decodedToken;

    let user = await UserModel.findOne(db, { email });

    if (user) {
      if (user.provider !== 'firebase') {
        user = await UserModel.update(db, { email }, {
          provider: 'firebase',
          firebaseUid: uid,
          avatar: picture || user.avatar
        });
      }
    } else {
      user = await UserModel.create(db, {
        name: name || email.split('@')[0],
        email,
        avatar: picture,
        provider: 'firebase',
        firebaseUid: uid,
        isVerified: true
      });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        provider: user.provider,
        isVerified: user.isVerified
      },
      token
    });
  } catch (error) {
    console.error('Firebase auth error:', error.message);
    res.status(500).json({ error: 'Firebase authentication failed' });
  }
});

// @route   POST /api/auth/google
// @desc    Login with Google (legacy, redirects to firebase)
// @access  Public
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  const db = req.db;

  try {
    const decodedToken = await verifyFirebaseToken(credential);
    
    if (!decodedToken) {
      if (process.env.NODE_ENV === 'development' || !firebaseInitialized) {
        const { email, name, picture } = req.body;
        
        if (!email) {
          return res.status(400).json({ error: 'Email is required in development mode' });
        }

        let user = await UserModel.findOne(db, { email });

        if (user) {
          if (user.provider !== 'google') {
            user = await UserModel.update(db, { email }, {
              provider: 'google',
              avatar: picture || user.avatar
            });
          }
        } else {
          user = await UserModel.create(db, {
            name: name || email.split('@')[0],
            email,
            avatar: picture,
            provider: 'google',
            isVerified: true
          });
        }

        const token = generateToken(user.id);

        return res.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            provider: user.provider,
            isVerified: user.isVerified
          },
          token
        });
      }
      
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { email, name, picture, uid } = decodedToken;

    let user = await UserModel.findOne(db, { email });

    if (user) {
      if (user.provider !== 'google') {
        user = await UserModel.update(db, { email }, {
          provider: 'google',
          googleId: uid,
          avatar: picture || user.avatar
        });
      }
    } else {
      user = await UserModel.create(db, {
        name: name || email.split('@')[0],
        email,
        avatar: picture,
        provider: 'google',
        googleId: uid,
        isVerified: true
      });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        provider: user.provider,
        isVerified: user.isVerified
      },
      token
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// @route   GET /api/auth/verify-email
// @desc    Verify user email
// @access  Public
router.get('/verify-email', async (req, res) => {
  const { token, email } = req.query;
  const db = req.db;

  try {
    const user = await UserModel.findOne(db, { email });
    if (!user || user.verificationToken !== token) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    await UserModel.update(db, { email }, {
      isVerified: true,
      verificationToken: undefined
    });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send reset password email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const db = req.db;

  try {
    const user = await UserModel.findOne(db, { email });
    if (!user || user.provider !== 'email') {
      return res.status(400).json({ error: 'User not found' });
    }

    const { token, hashedToken, expiresAt } = generateResetPasswordToken();

    await UserModel.update(db, { email }, {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: expiresAt
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${email}`;
    
    await sendEmail({
      email: user.email,
      subject: 'Reset your password',
      html: `
        <h1>Reset your password</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 10 minutes.</p>
      `
    });

    res.json({ success: true, message: 'Reset password email sent' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset user password
// @access  Public
router.post('/reset-password', async (req, res) => {
  const { token, email, password } = req.body;
  const db = req.db;

  try {
    const hashedToken = require('crypto').createHash('sha256').update(token).digest('hex');

    const user = await UserModel.findOne(db, { email });
    if (!user || user.provider !== 'email' || user.resetPasswordToken !== hashedToken || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    await UserModel.update(db, { email }, {
      password,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined
    });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
