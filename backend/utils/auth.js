const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

let transporter = null;

const createTransporter = () => {
  if (transporter) return transporter;
  
  const smtpHost = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (!smtpUser || !smtpPass) {
    console.log('SMTP credentials not configured, email sending will be skipped');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
};

exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

exports.sendEmail = async (options) => {
  const transport = createTransporter();
  
  if (!transport) {
    console.log('SMTP not configured, skipping email');
    console.log('Email would be sent to:', options.email);
    console.log('Subject:', options.subject);
    return;
  }

  try {
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'UniTally <noreply@unitally.com>',
      to: options.email,
      subject: options.subject,
      html: options.html,
    });
    
    console.log('Email sent successfully via Brevo:', info.messageId);
    return info;
  } catch (error) {
    console.error('Send email error:', error.message);
    throw error;
  }
};

exports.generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

exports.generateResetPasswordToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  return { token, hashedToken, expiresAt };
};
