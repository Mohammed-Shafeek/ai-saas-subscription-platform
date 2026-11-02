const stripeService = require('../services/stripe.service');
const webhookService = require('../services/webhook.service');
const { User, Plan, Subscription, Payment, Invoice } = require('../models');
const { AppError } = require('../middlewares/errorHandler');

const createSession = async (req, res, next) => {
  try {
    const { name, email, planId, successUrl, cancelUrl } = req.body;
    const session = await stripeService.createCheckoutSession({
      name,
      email,
      planId,
      successUrl,
      cancelUrl
    });

    res.status(200).json({
      success: true,
      data: session
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Interactive local checkout page for test mode / placeholder credentials
 */
const renderCheckoutPage = async (req, res, next) => {
  try {
    const { session_id, plan_id, user_id } = req.query;

    const plan = plan_id ? await Plan.findByPk(plan_id) : await Plan.findOne();
    const user = user_id ? await User.findByPk(user_id) : await User.findOne();

    const planName = plan ? plan.name : 'Pro Plan';
    const planPrice = plan ? `$${Number(plan.price).toFixed(2)}` : '$49.00';
    const planInterval = plan ? plan.billingInterval : 'month';
    const userName = user ? user.name : 'Jane Doe';
    const userEmail = user ? user.email : 'jane.doe@example.com';
    const sessionId = session_id || `cs_test_${Date.now()}`;
    const planId = plan ? plan.id : '';
    const userId = user ? user.id : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Checkout Simulation - ${planName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f6f9fc;
      color: #334155;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .checkout-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 15px 35px rgba(50,50,93,0.1), 0 5px 15px rgba(0,0,0,0.07);
      display: flex;
      flex-direction: column;
      max-width: 840px;
      width: 100%;
      overflow: hidden;
    }
    @media (min-width: 768px) {
      .checkout-card { flex-direction: row; }
    }
    .summary-side {
      background: #0f172a;
      color: white;
      padding: 40px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .badge {
      display: inline-block;
      background: #3b82f6;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 20px;
    }
    .product-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #f8fafc; }
    .price-tag { font-size: 36px; font-weight: 800; margin-bottom: 20px; color: #60a5fa; }
    .price-tag span { font-size: 16px; font-weight: 400; color: #94a3b8; }
    .features-list { list-style: none; margin-top: 20px; }
    .features-list li { margin-bottom: 12px; font-size: 14px; color: #cbd5e1; display: flex; align-items: center; }
    .features-list li::before { content: "✓"; color: #34d399; font-weight: bold; margin-right: 10px; }
    .payment-side {
      padding: 40px;
      flex: 1.2;
      background: #ffffff;
    }
    .payment-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #1e293b; }
    .form-group { margin-bottom: 18px; }
    label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 15px;
      color: #1e293b;
      background: #f8fafc;
    }
    .row { display: flex; gap: 12px; }
    .pay-btn {
      width: 100%;
      background: #6366f1;
      color: white;
      border: none;
      padding: 14px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 15px;
      transition: background 0.2s;
    }
    .pay-btn:hover { background: #4f46e5; }
    .pay-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .status-box {
      display: none;
      margin-top: 20px;
      padding: 16px;
      border-radius: 8px;
      font-size: 14px;
    }
    .status-success {
      background: #ecfdf5;
      border: 1px solid #10b981;
      color: #065f46;
    }
    .download-btn {
      display: inline-block;
      margin-top: 10px;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
    }
    .download-btn:hover { background: #059669; }
    .stripe-note { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="checkout-card">
    <div class="summary-side">
      <div>
        <span class="badge">Stripe Test Mode Simulation</span>
        <div class="product-title">${planName}</div>
        <div class="price-tag">${planPrice} <span>/ ${planInterval}</span></div>
        <ul class="features-list">
          <li>Full SaaS platform access</li>
          <li>Real-time automated analytics</li>
          <li>Automated renewal reminders</li>
          <li>Model Context Protocol (MCP) tool integration</li>
        </ul>
      </div>
      <div style="font-size: 12px; color: #64748b;">
        Session: <code style="color: #94a3b8;">${sessionId}</code>
      </div>
    </div>
    <div class="payment-side">
      <div class="payment-title">Pay with card</div>
      <div class="form-group">
        <label>Account Holder</label>
        <input type="text" id="custName" value="${userName}" readonly>
      </div>
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="custEmail" value="${userEmail}" readonly>
      </div>
      <div class="form-group">
        <label>Card Information (Stripe Test Card)</label>
        <input type="text" value="4242 •••• •••• 4242" readonly>
      </div>
      <div class="row">
        <div class="form-group" style="flex: 1;">
          <label>Expires</label>
          <input type="text" value="12 / 30" readonly>
        </div>
        <div class="form-group" style="flex: 1;">
          <label>CVC</label>
          <input type="text" value="123" readonly>
        </div>
      </div>
      <button class="pay-btn" id="payButton" onclick="processPayment()">
        Subscribe & Pay ${planPrice}
      </button>

      <div id="statusBox" class="status-box"></div>
      <div class="stripe-note">
        🔒 Simulated Stripe test checkout. No actual money will be charged.
      </div>
    </div>
  </div>

  <script>
    async function processPayment() {
      const btn = document.getElementById('payButton');
      const statusBox = document.getElementById('statusBox');
      btn.disabled = true;
      btn.innerText = 'Processing payment & generating invoice...';

      try {
        const res = await fetch('/api/checkout/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: '${sessionId}',
            planId: '${planId}',
            userId: '${userId}'
          })
        });

        const data = await res.json();
        if (data.success) {
          statusBox.className = 'status-box status-success';
          statusBox.style.display = 'block';
          statusBox.innerHTML = \`
            <strong>✓ Payment Succeeded!</strong><br>
            Subscription status: <strong>ACTIVE</strong><br>
            Invoice: <strong>\${data.invoiceNumber || 'Generated'}</strong><br>
            Confirmation email dispatched with PDF attachment.<br>
            <a href="/api/invoices/\${data.invoiceId}?download=true" class="download-btn" target="_blank">
              📄 Download PDF Invoice
            </a>
          \`;
          btn.innerText = '✓ Subscribed Successfully';
        } else {
          throw new Error(data.error || 'Payment processing failed');
        }
      } catch (err) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#991b1b';
        statusBox.style.border = '1px solid #f87171';
        statusBox.innerText = 'Error: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'Retry Payment';
      }
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

/**
 * Render success page on completion of Stripe Checkout
 */
const renderSuccessPage = async (req, res, next) => {
  try {
    const sessionId = req.query.session_id;
    let user = null;
    let plan = null;
    let invoice = null;
    let subscription = null;

    if (sessionId) {
      const { stripe } = require('../config/stripe');
      let session = null;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (err) {
        console.warn(`[Checkout] Could not retrieve session ${sessionId} from Stripe:`, err.message);
      }

      if (session && session.payment_status === 'paid') {
        const { userId, planId } = session.metadata || {};
        if (userId && planId) {
          // Process fulfillment event idempotently
          const event = {
            id: `evt_session_${sessionId}`,
            type: 'checkout.session.completed',
            data: { object: session }
          };
          await webhookService.processEvent(event);
        }
      }

      // Query latest subscription & invoice records
      if (session?.subscription) {
        subscription = await Subscription.findOne({
          where: { stripeSubscriptionId: session.subscription },
          include: [{ model: Plan, as: 'plan' }, { model: User, as: 'user' }]
        });
      }

      if (!subscription) {
        subscription = await Subscription.findOne({
          order: [['createdAt', 'DESC']],
          include: [{ model: Plan, as: 'plan' }, { model: User, as: 'user' }]
        });
      }

      if (subscription) {
        user = subscription.user;
        plan = subscription.plan;
        const payment = await Payment.findOne({
          where: { subscriptionId: subscription.id },
          order: [['createdAt', 'DESC']]
        });
        if (payment) {
          invoice = await Invoice.findOne({ where: { paymentId: payment.id } });
        }
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Confirmed - AI SaaS Platform</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      max-width: 540px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .icon-wrapper {
      width: 72px;
      height: 72px;
      background: #ecfdf5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .checkmark {
      font-size: 36px;
      color: #10b981;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: #64748b;
      font-size: 15px;
      margin-bottom: 24px;
    }
    .details-box {
      background: #f1f5f9;
      border-radius: 10px;
      padding: 20px;
      text-align: left;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .details-row:last-child {
      margin-bottom: 0;
    }
    .label {
      color: #64748b;
      font-weight: 500;
    }
    .value {
      color: #0f172a;
      font-weight: 600;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .primary-btn {
      background: #6366f1;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      display: inline-block;
      transition: background 0.2s;
    }
    .primary-btn:hover {
      background: #4f46e5;
    }
    .secondary-btn {
      background: #e2e8f0;
      color: #334155;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      display: inline-block;
      transition: background 0.2s;
    }
    .secondary-btn:hover {
      background: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <span class="checkmark">✓</span>
    </div>
    <h1>Payment Successful!</h1>
    <p class="subtitle">Thank you for subscribing. Your account is now fully active.</p>

    <div class="details-box">
      <div class="details-row">
        <span class="label">Plan</span>
        <span class="value">${plan ? plan.name : 'Pro Plan'}</span>
      </div>
      <div class="details-row">
        <span class="label">Customer</span>
        <span class="value">${user ? user.name : 'Alex Morgan'}</span>
      </div>
      <div class="details-row">
        <span class="label">Status</span>
        <span class="value" style="color: #10b981;">● Active</span>
      </div>
      ${invoice ? `
      <div class="details-row">
        <span class="label">Invoice Number</span>
        <span class="value">${invoice.invoiceNumber}</span>
      </div>
      ` : ''}
    </div>

    <div class="btn-group">
      ${invoice ? `
      <a href="/api/invoices/${invoice.id}?download=true" class="primary-btn" target="_blank">
        📄 Download PDF Invoice
      </a>
      ` : ''}
      <a href="/api/health" class="secondary-btn">
        View Platform Health & Status
      </a>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

/**
 * Render cancel page
 */
const renderCancelPage = (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Checkout Cancelled</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f8fafc; color: #334155; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; max-width: 450px; }
    h1 { color: #e11d48; margin-bottom: 12px; }
    p { margin-bottom: 20px; color: #64748b; }
    a { background: #6366f1; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Checkout Cancelled</h1>
    <p>Your subscription purchase was cancelled. No charges were made to your payment method.</p>
    <a href="/checkout">Return to Checkout</a>
  </div>
</body>
</html>`);
};

/**
 * Simulate payment completion webhook for local test checkout
 */
const simulatePayment = async (req, res, next) => {
  try {
    const { sessionId, planId, userId } = req.body;

    const plan = await Plan.findByPk(planId) || await Plan.findOne();
    const user = await User.findByPk(userId) || await User.findOne();

    if (!plan || !user) {
      throw new AppError('Plan or User not found for checkout simulation', 404);
    }

    const mockSessionId = sessionId || `cs_test_mock_${Date.now()}`;
    const mockStripeSubId = `sub_${Date.now()}`;
    const mockStripeEventId = `evt_demo_${Date.now()}`;

    const simulatedStripeEvent = {
      id: mockStripeEventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: mockSessionId,
          customer: `cus_${user.id}`,
          subscription: mockStripeSubId,
          payment_status: 'paid',
          amount_total: Math.round(Number(plan.price) * 100),
          currency: plan.currency,
          metadata: {
            userId: user.id,
            planId: plan.id
          }
        }
      }
    };

    await webhookService.processEvent(simulatedStripeEvent);

    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: mockStripeSubId }
    });

    const payment = subscription
      ? await Payment.findOne({ where: { subscriptionId: subscription.id } })
      : null;

    const invoice = payment
      ? await Invoice.findOne({ where: { paymentId: payment.id } })
      : null;

    res.status(200).json({
      success: true,
      subscriptionId: subscription?.id,
      paymentId: payment?.id,
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.invoiceNumber
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSession,
  renderCheckoutPage,
  renderSuccessPage,
  renderCancelPage,
  simulatePayment
};
