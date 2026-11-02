const path = require('path');
const fs = require('fs');
const invoiceService = require('../services/invoice.service');
const { AppError } = require('../middlewares/errorHandler');

const getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invoice = await invoiceService.getInvoiceById(id);

    // Authorization check: User can only access their own invoices
    if (req.user && invoice.userId !== req.user.id) {
      return next(new AppError('Forbidden: You do not have permission to access this invoice', 403));
    }

    // Check if client requested direct PDF download
    const wantsDownload = req.query.download === 'true' || req.headers.accept === 'application/pdf';
    if (wantsDownload) {
      const fullPath = path.isAbsolute(invoice.filePath)
        ? invoice.filePath
        : path.join(process.cwd(), invoice.filePath);

      if (!fs.existsSync(fullPath)) {
        return next(new AppError('Invoice file could not be found on server storage', 404));
      }

      return res.download(fullPath, `${invoice.invoiceNumber}.pdf`);
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvoice
};

