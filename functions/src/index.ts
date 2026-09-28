import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

admin.initializeApp();

const RESEND_API_KEY = process.env.RESEND_API_KEY || functions.config().resend?.api_key;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const db = admin.firestore();

interface VerificationCode {
  code: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export const sendVerificationCode = functions.https.onCall(
  async (data: { email: string }, context) => {
    const { email } = data;

    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email format');
    }

    if (!resend) {
      throw new functions.https.HttpsError('failed-precondition', 'Email service not configured');
    }

    const rateLimitRef = db.collection('rateLimits').doc(email);
    const rateLimitDoc = await rateLimitRef.get();
    
    if (rateLimitDoc.exists) {
      const rateLimitData = rateLimitDoc.data();
      const now = Date.now();
      const lastSent = rateLimitData?.lastSentAt || 0;
      const sendCount = rateLimitData?.sendCount || 0;
      
      if (now - lastSent < 60 * 1000) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Please wait before requesting another code'
        );
      }
      
      if (sendCount >= 5 && now - lastSent < 60 * 60 * 1000) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Too many requests. Please try again later'
        );
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const verificationCode: VerificationCode = {
      code,
      email,
      createdAt: Date.now(),
      expiresAt,
    };

    await db.collection('verificationCodes').doc(email).set(verificationCode);

    try {
      await resend.emails.send({
        from: 'UniTally <onboarding@resend.dev>',
        to: email,
        subject: 'Your Verification Code - UniTally',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Verification Code</h2>
            <p>You are registering for a UniTally account. Your verification code is:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes. Do not share this code with anyone.</p>
            <p style="color: #6b7280; font-size: 14px;">If you did not request this code, please ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send verification email');
    }

    const rateLimitUpdate = {
      lastSentAt: Date.now(),
      sendCount: admin.firestore.FieldValue.increment(1),
    };
    await rateLimitRef.set(rateLimitUpdate, { merge: true });

    return { success: true, message: 'Verification code sent' };
  }
);

export const verifyCode = functions.https.onCall(
  async (data: { email: string; code: string }, context) => {
    const { email, code } = data;

    if (!email || !code) {
      throw new functions.https.HttpsError('invalid-argument', 'Email and code are required');
    }

    const docRef = db.collection('verificationCodes').doc(email);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'No verification code found');
    }

    const verificationData = doc.data() as VerificationCode;

    if (verificationData.expiresAt < Date.now()) {
      await docRef.delete();
      throw new functions.https.HttpsError('deadline-exceeded', 'Verification code expired');
    }

    if (verificationData.code !== code) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid verification code');
    }

    await docRef.delete();

    return { success: true, message: 'Verification successful' };
  }
);

export const cleanupExpiredCodes = functions.pubsub
  .schedule('every 10 minutes')
  .onRun(async (context) => {
    const now = Date.now();
    const expiredCodes = await db
      .collection('verificationCodes')
      .where('expiresAt', '<', now)
      .get();

    const batch = db.batch();
    expiredCodes.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${expiredCodes.size} expired verification codes`);
  });
