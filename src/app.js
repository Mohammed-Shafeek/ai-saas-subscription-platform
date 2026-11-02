const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { errorHandler, AppError } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());

// Parse JSON with raw body capture for Stripe webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));

// Root health endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI SaaS Subscription & Analytics Platform API',
    status: 'online',
    version: '1.0.0'
  });
});

// Interactive test checkout UI
const checkoutController = require('./controllers/checkout.controller');
app.get('/checkout', checkoutController.renderCheckoutPage);

// API Routes
app.use('/api', apiRoutes);

// Catch 404 routes
app.use((req, res, next) => {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404));
});

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;

