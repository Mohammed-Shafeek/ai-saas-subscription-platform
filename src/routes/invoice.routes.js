const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { authenticate } = require('../middlewares/auth');

router.get('/:id', authenticate, invoiceController.getInvoice);

module.exports = router;

