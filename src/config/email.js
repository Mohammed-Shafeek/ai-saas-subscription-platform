const nodemailer = require('nodemailer');
require('dotenv').config();

const emailFrom = process.env.EMAIL_FROM || 'no-reply@saasplatform.local';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email transporter verification failed:', error.message);
    throw error;
  }
};

module.exports = {
  transporter,
  emailFrom,
  verifyEmailConnection
};

