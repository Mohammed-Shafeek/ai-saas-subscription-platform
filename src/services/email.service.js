const path = require('path');
const fs = require('fs');
const { transporter, emailFrom } = require('../config/email');

class EmailService {
  /**
   * Send payment confirmation email with attached invoice
   */
  async sendPaymentConfirmationEmail({ user, plan, subscription, payment, invoicePath }) {
    const formattedAmount = `${Number(payment.amount).toFixed(2)} ${(payment.currency || 'usd').toUpperCase()}`;
    const nextBillingDate = subscription.endDate
      ? new Date(subscription.endDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
      : 'N/A';

    const attachments = [];
    let resolvedInvoicePath = invoicePath;
    if (invoicePath && !path.isAbsolute(invoicePath)) {
      resolvedInvoicePath = path.join(process.cwd(), invoicePath);
    }

    if (resolvedInvoicePath && fs.existsSync(resolvedInvoicePath)) {
      attachments.push({
        filename: path.basename(resolvedInvoicePath),
        path: resolvedInvoicePath
      });
    }

    const mailOptions = {
      from: emailFrom,
      to: user.email,
      subject: `Payment Confirmation & Invoice - ${plan.name}`,
      text: `Hello ${user.name},\n\nThank you for subscribing to ${plan.name}. Your payment of ${formattedAmount} was successful.\n\nSubscription Details:\n- Plan: ${plan.name}\n- Billing Interval: ${plan.billingInterval}\n- Next Billing Date: ${nextBillingDate}\n\nPlease find your official PDF invoice attached to this email.\n\nBest regards,\nAI SaaS Platform Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
          <h2 style="color: #0F172A; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px;">Payment Confirmed</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Thank you for subscribing to <strong>${plan.name}</strong>. Your payment has been successfully processed.</p>
          
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1E293B;">Subscription Details</h3>
            <ul style="list-style: none; padding-left: 0; margin-bottom: 0;">
              <li><strong>Plan:</strong> ${plan.name}</li>
              <li><strong>Amount Paid:</strong> ${formattedAmount}</li>
              <li><strong>Billing Interval:</strong> ${plan.billingInterval}</li>
              <li><strong>Next Renewal Date:</strong> ${nextBillingDate}</li>
            </ul>
          </div>

          <p>Your official tax invoice has been generated and is attached to this email as a PDF.</p>
          <p style="margin-top: 30px; font-size: 13px; color: #94A3B8;">Best regards,<br>The AI SaaS Platform Team</p>
        </div>
      `,
      attachments
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info?.messageId || 'mock-id'
      };
    } catch (error) {
      console.error(`[EmailService] Failed to send payment confirmation to ${user.email}:`, error.message);
      // Return status rather than throwing to avoid rolling back already collected payments
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send renewal reminder email
   */
  async sendSubscriptionRenewalReminder({ user, plan, subscription, daysRemaining }) {
    const renewalDate = subscription.endDate
      ? new Date(subscription.endDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
      : 'in a few days';

    const mailOptions = {
      from: emailFrom,
      to: user.email,
      subject: `Upcoming Subscription Renewal - ${plan.name}`,
      text: `Hello ${user.name},\n\nThis is a reminder that your ${plan.name} subscription will renew in ${daysRemaining} days (on ${renewalDate}).\n\nNo action is required if you wish to maintain your active subscription.\n\nBest regards,\nAI SaaS Platform Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
          <h2 style="color: #0F172A; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px;">Subscription Renewal Reminder</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Your subscription to <strong>${plan.name}</strong> is scheduled to renew in <strong>${daysRemaining} day${daysRemaining > 1 ? 's' : ''}</strong> on <strong>${renewalDate}</strong>.</p>
          <p>Your default payment method will be charged automatically to ensure uninterrupted access to your AI features.</p>
          <p style="margin-top: 30px; font-size: 13px; color: #94A3B8;">Best regards,<br>The AI SaaS Platform Team</p>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info?.messageId || 'mock-id'
      };
    } catch (error) {
      console.error(`[EmailService] Failed to send renewal reminder to ${user.email}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();

