const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Invoice } = require('../models');
const { AppError } = require('../middlewares/errorHandler');

class InvoiceService {
  constructor() {
    this.storageDir = path.join(process.cwd(), 'storage', 'invoices');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Generate unique invoice number: INV-YYYYMMDD-XXXX
   */
  generateInvoiceNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INV-${dateStr}-${randomHex}`;
  }

  /**
   * Generate PDF file on disk using PDFKit
   */
  async createInvoicePdf({ invoiceNumber, user, plan, payment, date }) {
    const fileName = `${invoiceNumber}.pdf`;
    const filePath = path.join(this.storageDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Header
        doc
          .fillColor('#1E293B')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('INVOICE', 50, 50);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#64748B')
          .text('AI SaaS Platform Inc.', 50, 78)
          .text('100 Innovation Way, Suite 400', 50, 92)
          .text('San Francisco, CA 94107', 50, 106);

        // Invoice Meta Block
        doc
          .fontSize(10)
          .fillColor('#1E293B')
          .font('Helvetica-Bold')
          .text(`Invoice Number:`, 360, 50, { width: 100, align: 'left' })
          .font('Helvetica')
          .text(invoiceNumber, 460, 50, { align: 'right' })
          .font('Helvetica-Bold')
          .text(`Invoice Date:`, 360, 66, { width: 100, align: 'left' })
          .font('Helvetica')
          .text(date.toISOString().slice(0, 10), 460, 66, { align: 'right' })
          .font('Helvetica-Bold')
          .text(`Payment Status:`, 360, 82, { width: 100, align: 'left' })
          .fillColor('#16A34A')
          .text('PAID', 460, 82, { align: 'right' });

        // Divider
        doc
          .strokeColor('#E2E8F0')
          .lineWidth(1)
          .moveTo(50, 130)
          .lineTo(550, 130)
          .stroke();

        // Bill To section
        doc
          .fillColor('#64748B')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('BILLED TO:', 50, 145);

        doc
          .fillColor('#1E293B')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(user.name, 50, 160)
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#475569')
          .text(user.email, 50, 175);

        // Payment Reference
        const paymentRef = payment.stripePaymentIntentId || payment.stripeSessionId || 'N/A';
        doc
          .fillColor('#64748B')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('PAYMENT REFERENCE:', 360, 145)
          .fillColor('#475569')
          .font('Helvetica')
          .text(paymentRef, 360, 160, { width: 190 });

        // Line Items Table Header
        const tableTop = 220;
        doc
          .rect(50, tableTop, 500, 24)
          .fill('#F1F5F9');

        doc
          .fillColor('#1E293B')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Description', 60, tableTop + 7)
          .text('Interval', 300, tableTop + 7)
          .text('Amount', 470, tableTop + 7, { align: 'right', width: 70 });

        // Item row
        const itemY = tableTop + 34;
        const currencyCode = (payment.currency || 'usd').toUpperCase();
        const formattedAmount = `${Number(payment.amount).toFixed(2)} ${currencyCode}`;

        doc
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(10)
          .text(`${plan.name} Subscription`, 60, itemY)
          .text(plan.billingInterval || 'month', 300, itemY)
          .text(formattedAmount, 470, itemY, { align: 'right', width: 70 });

        // Table underline
        doc
          .strokeColor('#E2E8F0')
          .lineWidth(1)
          .moveTo(50, itemY + 20)
          .lineTo(550, itemY + 20)
          .stroke();

        // Total
        const totalY = itemY + 30;
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#1E293B')
          .text('Total Paid:', 360, totalY)
          .text(formattedAmount, 470, totalY, { align: 'right', width: 70 });

        // Footer
        doc
          .fontSize(9)
          .fillColor('#94A3B8')
          .font('Helvetica')
          .text('Thank you for your business. For support, please reach out to support@saasplatform.local', 50, 700, {
            align: 'center',
            width: 500
          });

        doc.end();

        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate invoice and record in database (idempotent for a payment)
   */
  async generateInvoice({ user, plan, payment, transaction }) {
    // Check if invoice already exists for this payment
    let invoice = await Invoice.findOne({
      where: { paymentId: payment.id },
      transaction
    });

    if (invoice) {
      return invoice;
    }

    const invoiceNumber = this.generateInvoiceNumber();
    const invoiceDate = payment.createdAt ? new Date(payment.createdAt) : new Date();

    const filePath = await this.createInvoicePdf({
      invoiceNumber,
      user,
      plan,
      payment,
      date: invoiceDate
    });

    // Store relative path for portability
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

    invoice = await Invoice.create({
      userId: user.id,
      paymentId: payment.id,
      invoiceNumber,
      filePath: relativePath
    }, { transaction });

    return invoice;
  }

  /**
   * Retrieve invoice by ID with associations
   */
  async getInvoiceById(invoiceId) {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [
        { association: 'user', attributes: ['id', 'name', 'email'] },
        { association: 'payment' }
      ]
    });

    if (!invoice) {
      throw new AppError(`Invoice not found with ID: ${invoiceId}`, 404);
    }

    return invoice;
  }
}

module.exports = new InvoiceService();

