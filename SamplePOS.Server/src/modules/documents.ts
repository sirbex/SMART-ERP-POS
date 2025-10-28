import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();
router.use(authenticate);

// Helper: Generate document number
async function generateDocumentNumber(prefix: string, tx: any): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const lastDoc = await tx.customerTransaction.findFirst({
    where: { referenceId: { startsWith: `${prefix}-${dateStr}` } },
    orderBy: { createdAt: 'desc' },
    select: { referenceId: true }
  });
  let sequence = 1;
  if (lastDoc?.referenceId) {
    const parts = lastDoc.referenceId.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
  }
  return `${prefix}-${dateStr}-${sequence.toString().padStart(4, '0')}`;
}

// Helper: Get sale with full details
async function getSaleWithDetails(saleId: string, tx: any) {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { items: { include: { product: true } }, customer: true }
  });
  if (!sale) throw new Error('Sale not found');
  if (!sale.customer) throw new Error('Sale has no associated customer');
  return sale;
}

// Helper: Create document transaction
async function createDocTransaction(data: any, tx: any) {
  return await tx.customerTransaction.create({
    data: {
      customerId: data.customerId,
      type: data.type,
      amount: data.amount,
      balance: new Decimal(0),
      referenceId: data.referenceId,
      documentNumber: data.documentNumber,
      notes: data.notes || '',
      createdBy: data.createdById
    }
  });
}

// Endpoint 1: Generate Invoice
router.post('/invoice', [
], async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { saleId, notes } = req.body;
    const user = (req as any).user;

    const result = await prisma.$transaction(async (tx) => {
      const sale = await getSaleWithDetails(saleId, tx);
      const invoiceNumber = await generateDocumentNumber('INV', tx);
      
      await createDocTransaction({
        customerId: sale.customerId,
        type: 'INVOICE',
        amount: sale.totalAmount,
        referenceId: invoiceNumber,
        documentNumber: `Invoice for Sale ${sale.saleNumber}`,
        notes,
        createdById: user.id
      }, tx);

      const htmlContent = `
<!DOCTYPE html>
<html>
<head><title>Invoice ${invoiceNumber}</title><style>body{font-family:Arial;margin:20px}h1{color:#333}</style></head>
<body>
  <h1>INVOICE ${invoiceNumber}</h1>
  <p><strong>Customer:</strong> ${sale.customer.name}</p>
  <p><strong>Date:</strong> ${new Date(sale.saleDate).toLocaleDateString()}</p>
  <p><strong>Sale #:</strong> ${sale.saleNumber}</p>
  <table border="1" cellpadding="10" style="width:100%;border-collapse:collapse">
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${sale.items.map((item: any) => `
      <tr>
        <td>${item.product.name}</td>
        <td>${item.quantity}</td>
        <td>$${parseFloat(item.unitPrice.toString()).toFixed(2)}</td>
        <td>$${parseFloat(item.total.toString()).toFixed(2)}</td>
      </tr>
    `).join('')}</tbody>
  </table>
  <p style="text-align:right"><strong>Subtotal:</strong> $${parseFloat(sale.subtotal.toString()).toFixed(2)}</p>
  <p style="text-align:right"><strong>Tax:</strong> $${parseFloat(sale.taxAmount.toString()).toFixed(2)}</p>
  <p style="text-align:right"><strong>Discount:</strong> -$${parseFloat(sale.discount.toString()).toFixed(2)}</p>
  <h2 style="text-align:right">Total: $${parseFloat(sale.totalAmount.toString()).toFixed(2)}</h2>
  <p style="text-align:right;color:red"><strong>Balance Due:</strong> $${parseFloat(sale.amountOutstanding.toString()).toFixed(2)}</p>
  ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
</body>
</html>`;

      logger.info(`Invoice ${invoiceNumber} generated`, { saleId, userId: user.id });
      return { invoiceNumber, htmlContent, customer: sale.customer.name, total: parseFloat(sale.totalAmount.toString()) };
    });

    res.status(201).json({ success: true, message: 'Invoice generated', data: result });
  } catch (error: any) {
    logger.error('Invoice generation error:', error);
    next(error);
  }
});

// Endpoint 2: Generate Receipt
router.post('/receipt', [
], async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { transactionId, saleId, notes } = req.body;
    const user = (req as any).user;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.customerTransaction.findUnique({ where: { id: transactionId } });
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.type !== 'PAYMENT') throw new Error('Not a payment transaction');

      const customer = await tx.customer.findUnique({ where: { id: transaction.customerId } });
      if (!customer) throw new Error('Customer not found');

      const receiptNumber = await generateDocumentNumber('RCP', tx);
      
      let itemsHTML = '';
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;

      if (saleId) {
        const sale = await getSaleWithDetails(saleId, tx);
        itemsHTML = sale.items.map((item: any) => `
          <tr>
            <td>${item.product.name}</td>
            <td>${item.quantity}</td>
            <td>$${parseFloat(item.unitPrice.toString()).toFixed(2)}</td>
            <td>$${parseFloat(item.total.toString()).toFixed(2)}</td>
          </tr>
        `).join('');
        subtotal = parseFloat(sale.subtotal.toString());
        taxAmount = parseFloat(sale.taxAmount.toString());
        totalAmount = parseFloat(sale.totalAmount.toString());
      } else {
        totalAmount = parseFloat(transaction.amount.toString());
        subtotal = totalAmount;
        itemsHTML = `<tr><td>Payment</td><td>1</td><td>$${totalAmount.toFixed(2)}</td><td>$${totalAmount.toFixed(2)}</td></tr>`;
      }

      await createDocTransaction({
        customerId: customer.id,
        type: 'RECEIPT',
        amount: transaction.amount,
        referenceId: receiptNumber,
        documentNumber: `Receipt for payment ${transaction.referenceId}`,
        notes,
        createdById: user.id
      }, tx);

      const htmlContent = `
<!DOCTYPE html>
<html>
<head><title>Receipt ${receiptNumber}</title><style>body{font-family:Arial;margin:20px;max-width:600px}h1{color:#27ae60}</style></head>
<body>
  <h1>RECEIPT ${receiptNumber}</h1>
  <p><strong>Customer:</strong> ${customer.name}</p>
  <p><strong>Date:</strong> ${new Date(transaction.createdAt).toLocaleString()}</p>
  <table border="1" cellpadding="10" style="width:100%;border-collapse:collapse">
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <p style="text-align:right"><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</p>
  <p style="text-align:right"><strong>Tax:</strong> $${taxAmount.toFixed(2)}</p>
  <h2 style="text-align:right;color:#27ae60">Amount Paid: $${parseFloat(transaction.amount.toString()).toFixed(2)}</h2>
  ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
  <p style="text-align:center;margin-top:30px;font-size:12px;color:#777">Thank you for your payment!</p>
</body>
</html>`;

      logger.info(`Receipt ${receiptNumber} generated`, { transactionId, userId: user.id });
      return { receiptNumber, htmlContent, customer: customer.name, amountPaid: parseFloat(transaction.amount.toString()) };
    });

    res.status(201).json({ success: true, message: 'Receipt generated', data: result });
  } catch (error: any) {
    logger.error('Receipt generation error:', error);
    next(error);
  }
});

// Endpoint 3: Generate Credit Note
router.post('/credit-note', [
], async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { saleId, reason, items, refundMethod, notes } = req.body;
    const user = (req as any).user;

    const result = await prisma.$transaction(async (tx) => {
      const sale = await getSaleWithDetails(saleId, tx);
      const creditNoteNumber = await generateDocumentNumber('CN', tx);

      let refundAmount = 0;
      for (const item of items) {
        const itemTotal = item.quantity * item.unitPrice;
        const discount = item.discount || 0;
        const taxRate = item.taxRate || 0;
        const afterDiscount = itemTotal - discount;
        const tax = afterDiscount * (taxRate / 100);
        refundAmount += afterDiscount + tax;
      }

      const saleTotal = parseFloat(sale.totalAmount.toString());
      if (refundAmount > saleTotal) {
        throw new Error(`Refund amount ($${refundAmount.toFixed(2)}) cannot exceed sale total ($${saleTotal.toFixed(2)})`);
      }

      await createDocTransaction({
        customerId: sale.customerId,
        type: 'CREDIT_NOTE',
        amount: new Decimal(refundAmount).negated(),
        referenceId: creditNoteNumber,
        documentNumber: `Credit Note for Sale ${sale.saleNumber}`,
        notes: reason,
        createdById: user.id
      }, tx);

      await tx.customer.update({
        where: { id: sale.customerId },
        data: { currentBalance: { increment: refundAmount } }
      });

      const htmlContent = `
<!DOCTYPE html>
<html>
<head><title>Credit Note ${creditNoteNumber}</title><style>body{font-family:Arial;margin:20px}h1{color:#e74c3c}.alert{background:#fadbd8;padding:15px;margin:15px 0;border-left:4px solid #e74c3c}</style></head>
<body>
  <h1>CREDIT NOTE ${creditNoteNumber}</h1>
  <div class="alert"><strong> CREDIT ISSUED</strong><br>This credit has been applied to the customer account.</div>
  <p><strong>Customer:</strong> ${sale.customer.name}</p>
  <p><strong>Original Sale:</strong> ${sale.saleNumber}</p>
  <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
  <div style="background:#fff3cd;padding:15px;margin:15px 0;border-left:4px solid #ffc107">
    <strong>Reason:</strong> ${reason}
  </div>
  <table border="1" cellpadding="10" style="width:100%;border-collapse:collapse">
    <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
    <tbody>${items.map((item: any) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      const discount = item.discount || 0;
      const taxRate = item.taxRate || 0;
      const afterDiscount = itemSubtotal - discount;
      const tax = afterDiscount * (taxRate / 100);
      const total = afterDiscount + tax;
      return `
        <tr>
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>$${item.unitPrice.toFixed(2)}</td>
          <td>$${total.toFixed(2)}</td>
        </tr>
      `;
    }).join('')}</tbody>
  </table>
  <h2 style="text-align:right;color:#e74c3c">Refund Amount: $${refundAmount.toFixed(2)}</h2>
  ${refundMethod ? `<p><strong>Refund Method:</strong> ${refundMethod}</p>` : ''}
  ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
</body>
</html>`;

      logger.info(`Credit note ${creditNoteNumber} generated`, { saleId, refundAmount, userId: user.id });
      return { creditNoteNumber, htmlContent, customer: sale.customer.name, refundAmount, reason };
    });

    res.status(201).json({ success: true, message: 'Credit note generated', data: result });
  } catch (error: any) {
    logger.error('Credit note generation error:', error);
    next(error);
  }
});

// Endpoint 4: Get PDF Document
router.get('/:id/pdf', [
], async (req: Request, res: Response, next: NextFunction) => {
  try {

    const documentId = req.params.id;
    const transaction = await prisma.customerTransaction.findUnique({ where: { id: documentId } });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const customer = await prisma.customer.findUnique({ where: { id: transaction.customerId } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const validTypes = ['INVOICE', 'RECEIPT', 'CREDIT_NOTE'];
    if (!validTypes.includes(transaction.type)) {
      return res.status(400).json({ success: false, message: 'Not a valid document type' });
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Document ${transaction.referenceId}</title>
  <style>
    body{font-family:Arial;margin:40px}
    .notice{background:#e3f2fd;padding:20px;border-left:4px solid #2196f3;margin:20px 0}
    .info{background:#f5f5f5;padding:15px;margin:20px 0}
    pre{background:#263238;color:#aed581;padding:15px;overflow-x:auto}
  </style>
</head>
<body>
  <h1>Document: ${transaction.referenceId}</h1>
  <div class="notice">
    <h2> PDF Generation</h2>
    <p>To generate PDF, integrate a library like <strong>puppeteer</strong>, <strong>pdfkit</strong>, or <strong>jspdf</strong>.</p>
  </div>
  <div class="info">
    <h3>Document Information</h3>
    <p><strong>Type:</strong> ${transaction.type}</p>
    <p><strong>Reference:</strong> ${transaction.referenceId}</p>
    <p><strong>Customer:</strong> ${customer.name}</p>
    <p><strong>Date:</strong> ${transaction.createdAt.toLocaleString()}</p>
    <p><strong>Amount:</strong> $${transaction.amount.toString()}</p>
  </div>
  <div class="info">
    <h3>Integration Example</h3>
    <pre>
// Install: npm install puppeteer
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setContent(htmlContent);
const pdf = await page.pdf({ format: 'A4', printBackground: true });
await browser.close();

res.contentType('application/pdf');
res.send(pdf);
    </pre>
  </div>
</body>
</html>`;

    logger.info(`PDF requested for document ${transaction.referenceId}`, { documentId });
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error: any) {
    logger.error('PDF generation error:', error);
    next(error);
  }
});

export default router;
