const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail SMTP with SSL (port 465)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Send OTP email for password reset
 * @param {string} toEmail - Recipient email
 * @param {string} otpCode - 6-digit OTP
 */
async function sendOTPEmail(toEmail, otpCode) {
  const mailOptions = {
    from: `"Machhu Kathiya Gyati" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password Reset OTP - Machhu Kathiya Sai Suthar Gyati',
    html: `
      <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #046957; margin: 0;">Machhu Kathiya Sai Suthar Gyati</h2>
          <p style="color: #888; font-size: 14px; margin-top: 5px;">Password Reset Request</p>
        </div>
        <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <p style="color: #333; font-size: 15px; margin-bottom: 20px;">
            You requested a password reset for your account. Use the OTP below to verify your identity:
          </p>
          <div style="text-align: center; margin: 25px 0;">
            <div style="display: inline-block; background: #046957; color: white; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 15px 30px; border-radius: 10px;">
              ${otpCode}
            </div>
          </div>
          <p style="color: #666; font-size: 13px; text-align: center;">
            This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
          </p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          If you did not request this reset, please ignore this email.
        </p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendOTPEmail };
