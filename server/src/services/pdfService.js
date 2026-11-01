const PDFDocument = require('pdfkit');

/**
 * Generate a professional invoice PDF and stream directly to response
 * @param {Object} sale - Sale document with populated or embedded items
 * @param {Object} res - Express response object
 */
const generateInvoicePDF = (sale, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  // Stream directly to response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=Invoice-${sale.invoiceNumber}.pdf`
  );

  doc.pipe(res);

  // Header Colors & Typography
  const primaryColor = '#1e293b'; // Slate 800
  const accentColor = '#2563eb';  // Blue 600
  const mutedColor = '#64748b';   // Slate 500

  // Brand Header
  doc
    .fontSize(22)
    .fillColor(accentColor)
    .text('StockWise Retail', 40, 40, { bold: true })
    .fontSize(9)
    .fillColor(mutedColor)
    .text('Inventory & Retail Management System', 40, 65)
    .text('GSTIN: 29ABCDE1234F1Z5 | Phone: +91 98765 43210', 40, 78)
    .text('123 Commercial Boulevard, Retail Hub, Bangalore 560001', 40, 91);

  // Invoice Title & Meta
  doc
    .fontSize(18)
    .fillColor(primaryColor)
    .text('TAX INVOICE', 350, 40, { align: 'right' })
    .fontSize(10)
    .fillColor(mutedColor)
    .text(`Invoice No: ${sale.invoiceNumber}`, 350, 65, { align: 'right' })
    .text(`Date: ${new Date(sale.saleDate).toLocaleDateString('en-GB')}`, 350, 79, { align: 'right' })
    .text(`Status: ${sale.status}`, 350, 93, { align: 'right' });

  // Horizontal Rule
  doc
    .moveTo(40, 115)
    .lineTo(555, 115)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();

  // Customer Details Block
  doc
    .fontSize(10)
    .fillColor(primaryColor)
    .text('Billed To:', 40, 130, { bold: true })
    .fillColor('#334155')
    .text(`Customer: ${sale.customerName || 'Walk-in Customer'}`, 40, 145)
    .text(`Phone: ${sale.customerPhone || 'N/A'}`, 40, 160)
    .text(`Payment Mode: ${sale.paymentMethod}`, 350, 145, { align: 'right' });

  // Table Header
  const tableTop = 190;
  doc
    .rect(40, tableTop, 515, 24)
    .fill('#f1f5f9');

  doc
    .fontSize(9)
    .fillColor('#1e293b')
    .text('#', 50, tableTop + 7)
    .text('Product Description', 80, tableTop + 7)
    .text('SKU', 250, tableTop + 7)
    .text('Qty', 330, tableTop + 7, { align: 'right' })
    .text('Unit Price', 410, tableTop + 7, { align: 'right' })
    .text('Total', 520, tableTop + 7, { align: 'right' });

  let yPosition = tableTop + 30;
  let index = 1;

  // Table Items
  (sale.items || []).forEach((item) => {
    // Add page if needed
    if (yPosition > 680) {
      doc.addPage({ margin: 40, size: 'A4' });
      yPosition = 50;
    }

    doc
      .fontSize(9)
      .fillColor('#334155')
      .text(index.toString(), 50, yPosition)
      .text(item.productName, 80, yPosition, { width: 160, ellipsis: true })
      .text(item.sku, 250, yPosition)
      .text(item.quantity.toString(), 330, yPosition, { align: 'right' })
      .text(`₹${item.sellingPriceSnapshot.toFixed(2)}`, 410, yPosition, { align: 'right' })
      .text(`₹${item.lineTotal.toFixed(2)}`, 520, yPosition, { align: 'right' });

    yPosition += 22;
    index++;
  });

  // Divider
  doc
    .moveTo(40, yPosition + 5)
    .lineTo(555, yPosition + 5)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();

  yPosition += 15;

  // Summary Totals Block
  const summaryLeft = 350;
  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text('Subtotal:', summaryLeft, yPosition)
    .text(`₹${(sale.subtotal || 0).toFixed(2)}`, 520, yPosition, { align: 'right' });

  yPosition += 16;
  if (sale.discount > 0) {
    doc
      .text('Discount:', summaryLeft, yPosition)
      .text(`- ₹${sale.discount.toFixed(2)}`, 520, yPosition, { align: 'right' });
    yPosition += 16;
  }

  if (sale.taxAmount > 0) {
    doc
      .text(`Tax (${sale.taxRate}%):`, summaryLeft, yPosition)
      .text(`+ ₹${sale.taxAmount.toFixed(2)}`, 520, yPosition, { align: 'right' });
    yPosition += 16;
  }

  // Grand Total Box
  doc
    .rect(summaryLeft - 10, yPosition, 215, 26)
    .fill('#eff6ff');

  doc
    .fontSize(11)
    .fillColor('#1e40af')
    .text('Grand Total:', summaryLeft, yPosition + 7, { bold: true })
    .text(`₹${sale.grandTotal.toFixed(2)}`, 520, yPosition + 7, { align: 'right', bold: true });

  yPosition += 35;
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text(`Amount Paid: ₹${(sale.amountPaid || 0).toFixed(2)}`, summaryLeft, yPosition)
    .text(`Change Returned: ₹${(sale.changeDue || 0).toFixed(2)}`, 520, yPosition, { align: 'right' });

  // Footer notes & thank you
  const footerY = 750;
  doc
    .moveTo(40, footerY - 15)
    .lineTo(555, footerY - 15)
    .strokeColor('#cbd5e1')
    .stroke();

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text('Thank you for shopping with us! Terms: Goods once sold can be returned within 7 days with original receipt.', 40, footerY, {
      align: 'center',
      width: 515
    });

  doc.end();
};

module.exports = {
  generateInvoicePDF
};
