/**
 * Brevo HTTP API mailer — uses HTTPS (port 443) instead of SMTP
 * This works on all cloud providers including Render which blocks SMTP ports
 */

/**
 * Internal helper — send email via Brevo HTTP API
 */
async function _sendViaBrevo(emailData) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not set in environment variables');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(emailData)
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('[MAILER] ❌ Brevo API error:', result);
    throw new Error(result.message || 'Failed to send email via Brevo API');
  }

  console.log('[MAILER] ✅ Email sent via Brevo API. Message ID:', result.messageId);
  return result;
}

/**
 * Send OTP email for password reset via Brevo HTTP API
 * @param {string} toEmail - Recipient email
 * @param {string} otpCode - 6-digit OTP
 */
async function sendOTPEmail(toEmail, otpCode) {
  console.log('[MAILER] Sending OTP to:', toEmail, 'via Brevo HTTP API');

  const emailData = {
    sender: {
      name: 'Machhu Kathiya Gyati',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@machhu-kathiya-gyati.com'
    },
    to: [{ email: toEmail }],
    subject: 'Password Reset OTP - Machhu Kathiya Sai Suthar Gyati',
    htmlContent: `
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

  return _sendViaBrevo(emailData);
}

/**
 * Send admin notification when a new user signs up and needs approval
 * @param {string} adminEmail - Admin's email address
 * @param {object} applicant - Applicant's full details
 */
async function sendAdminNotificationEmail(adminEmail, applicant) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  console.log('[MAILER] Sending admin notification to:', adminEmail, 'for applicant:', applicant.fullName);

  const emailData = {
    sender: {
      name: 'Machhu Kathiya Gyati',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@machhu-kathiya-gyati.com'
    },
    to: [{ email: adminEmail }],
    subject: '🔔 New Signup Request — ' + applicant.fullName + ' — Machhu Kathiya Gyati',
    htmlContent: `
      <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #046957; margin: 0;">Machhu Kathiya Sai Suthar Gyati</h2>
          <p style="color: #888; font-size: 14px; margin-top: 5px;">New Member Signup Request</p>
        </div>
        <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; background: #FFF3CD; color: #856404; padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 13px;">
              ⏳ PENDING APPROVAL
            </div>
          </div>
          <h3 style="color: #046957; margin: 0 0 15px 0; text-align: center;">${applicant.fullName}</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600; width: 130px;">📧 Email</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">📱 Phone</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.phone || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">🏘️ Village</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.village || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">🧬 Mosal</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.mosal || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">👤 Gender</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.gender || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">💍 Status</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.maritalStatus || '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">💼 Occupation</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.occupation || '—'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 5px; color: #888; font-weight: 600;">🎓 Education</td>
              <td style="padding: 10px 5px; color: #333;">${applicant.education || '—'}</td>
            </tr>
            ${applicant.joinType ? `<tr style="border-top: 2px solid #046957;">
              <td style="padding: 10px 5px; color: #046957; font-weight: 700;">🔗 Join Type</td>
              <td style="padding: 10px 5px; color: #046957; font-weight: 700;">${applicant.joinType}</td>
            </tr>` : ''}
          </table>
          <div style="text-align: center; margin-top: 25px;">
            <a href="${siteUrl}/admin/approvals" style="display: inline-block; background: #046957; color: white; text-decoration: none; padding: 12px 35px; border-radius: 8px; font-weight: 700; font-size: 15px;">
              Review & Approve
            </a>
          </div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          Login to the admin panel to approve or reject this request.
        </p>
      </div>
    `
  };

  return _sendViaBrevo(emailData);
}

/**
 * Send approval email to user
 * @param {string} userEmail - User's email
 * @param {string} userName - User's full name
 */
async function sendApprovalEmail(userEmail, userName) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  console.log('[MAILER] Sending approval email to:', userEmail);

  const emailData = {
    sender: {
      name: 'Machhu Kathiya Gyati',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@machhu-kathiya-gyati.com'
    },
    to: [{ email: userEmail }],
    subject: '✅ Your Account is Approved — Machhu Kathiya Sai Suthar Gyati',
    htmlContent: `
      <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #046957; margin: 0;">Machhu Kathiya Sai Suthar Gyati</h2>
          <p style="color: #888; font-size: 14px; margin-top: 5px;">Account Approved!</p>
        </div>
        <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 48px;">🎉</div>
          </div>
          <h3 style="color: #046957; text-align: center; margin: 0 0 15px 0;">
            Welcome, ${userName}!
          </h3>
          <p style="color: #333; font-size: 15px; text-align: center; margin-bottom: 20px;">
            Your account has been <strong style="color: #28a745;">approved</strong> by the admin.
            You can now login and access the community directory.
          </p>
          <div style="text-align: center; margin-top: 25px;">
            <a href="${siteUrl}/login" style="display: inline-block; background: #046957; color: white; text-decoration: none; padding: 12px 35px; border-radius: 8px; font-weight: 700; font-size: 15px;">
              Login Now
            </a>
          </div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          Thank you for joining Machhu Kathiya Sai Suthar Gyati.
        </p>
      </div>
    `
  };

  return _sendViaBrevo(emailData);
}

/**
 * Send rejection email to user
 * @param {string} userEmail - User's email
 * @param {string} userName - User's full name
 * @param {string} reason - Optional rejection reason
 */
async function sendRejectionEmail(userEmail, userName, reason) {
  console.log('[MAILER] Sending rejection email to:', userEmail);

  const reasonBlock = reason
    ? `<p style="color: #333; font-size: 14px; margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #dc3545;"><strong>Reason:</strong> ${reason}</p>`
    : '';

  const emailData = {
    sender: {
      name: 'Machhu Kathiya Gyati',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@machhu-kathiya-gyati.com'
    },
    to: [{ email: userEmail }],
    subject: 'Registration Update — Machhu Kathiya Sai Suthar Gyati',
    htmlContent: `
      <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #046957; margin: 0;">Machhu Kathiya Sai Suthar Gyati</h2>
          <p style="color: #888; font-size: 14px; margin-top: 5px;">Registration Update</p>
        </div>
        <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <p style="color: #333; font-size: 15px; margin-bottom: 10px;">
            Dear ${userName},
          </p>
          <p style="color: #333; font-size: 15px; margin-bottom: 15px;">
            We regret to inform you that your registration request could not be approved at this time.
          </p>
          ${reasonBlock}
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            If you believe this is a mistake, please contact the admin directly.
          </p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          Machhu Kathiya Sai Suthar Gyati
        </p>
      </div>
    `
  };

  return _sendViaBrevo(emailData);
}

module.exports = { sendOTPEmail, sendAdminNotificationEmail, sendApprovalEmail, sendRejectionEmail };
