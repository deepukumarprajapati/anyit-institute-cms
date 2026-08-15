import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { IFeeInvoice, IFeePayment } from '../models/Fee';
import { IInstitute } from '../models/Institute';

type StudentLite = {
  firstName?: string;
  lastName?: string;
  admissionNo?: string;
  phone?: string;
  email?: string;
  address?: string;
  className?: string;
  sectionName?: string;
  sessionName?: string;
};

const BRAND = '#0f5c4c';
const BRAND_LIGHT = '#e8f3ef';
const INK = '#1a1a1a';
const MUTED = '#5c6675';
const LINE = '#d0d5dd';

function money(n: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function fmtDate(d?: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(d?: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Indian numbering amount-in-words (rupees). */
export function amountInWords(amount: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n: number): string {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
  }

  function threeDigits(n: number): string {
    if (n < 100) return twoDigits(n);
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`.trim();
  }

  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  let words = `${parts.join(' ')} Rupees`.replace(/\s+/g, ' ').trim();
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

function drawHLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color = LINE) {
  doc.save().strokeColor(color).lineWidth(0.8).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function drawRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: string,
  stroke = LINE
) {
  doc.save();
  if (fill) doc.fillColor(fill).rect(x, y, w, h).fill();
  doc.strokeColor(stroke).lineWidth(0.8).rect(x, y, w, h).stroke();
  doc.restore();
}

export async function streamFeeReceiptPdf(
  res: Response,
  opts: {
    institute: IInstitute;
    payment: IFeePayment & { _id?: unknown; receiptNo: string; amount: number; method: string; paidAt?: Date; reference?: string };
    invoice: IFeeInvoice;
    /** When one payment settled several invoices — show each allocation as a line */
    allocations?: Array<{ amount: number; invoice: IFeeInvoice }>;
    student: StudentLite | null;
    inline?: boolean;
  }
) {
  const { institute, payment, invoice, student, inline = false, allocations } = opts;
  const currency = institute.settings?.currency || 'INR';
  const pageMargin = 40;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: pageMargin, bottom: pageMargin, left: pageMargin, right: pageMargin },
    info: {
      Title: `Fee Receipt ${payment.receiptNo}`,
      Author: institute.name,
      Subject: `Receipt ${payment.receiptNo}`,
    },
  });

  const filename = `receipt-${payment.receiptNo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
  );
  doc.pipe(res);

  const pageW = doc.page.width;
  const contentW = pageW - pageMargin * 2;
  const left = pageMargin;
  const right = pageW - pageMargin;
  let y = pageMargin;

  // Top brand bar
  doc.save().fillColor(BRAND).rect(0, 0, pageW, 8).fill().restore();

  // Header
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(18).text(institute.name, left, y, {
    width: contentW * 0.62,
  });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(`Institute Code: ${institute.code}`, left, y + 24);

  // Right title badge
  const badgeX = left + contentW * 0.62;
  drawRect(doc, badgeX, y, contentW * 0.38, 42, BRAND_LIGHT, BRAND);
  doc
    .fillColor(BRAND)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('TAX INVOICE / FEE RECEIPT', badgeX, y + 8, {
      width: contentW * 0.38,
      align: 'center',
    });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('Original for Recipient', badgeX, y + 24, {
      width: contentW * 0.38,
      align: 'center',
    });

  y += 52;
  const addressBits = [institute.address, institute.phone, institute.email].filter(Boolean);
  if (addressBits.length) {
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(addressBits.join('  ·  '), left, y, { width: contentW });
    y += 18;
  }

  if (institute.settings?.academicYearLabel) {
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(`Academic Session: ${institute.settings.academicYearLabel}`, left, y);
    y += 16;
  }

  drawHLine(doc, left, right, y);
  y += 14;

  // Bill To + Meta boxes
  const boxH = 92;
  const colGap = 12;
  const colW = (contentW - colGap) / 2;
  drawRect(doc, left, y, colW, boxH, '#fafafa');
  drawRect(doc, left + colW + colGap, y, colW, boxH, '#fafafa');

  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text('BILL TO', left + 10, y + 8);
  const studentName = student
    ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student'
    : 'Student';
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(studentName, left + 10, y + 24, {
    width: colW - 20,
  });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  let by = y + 40;
  const billLines = [
    student?.admissionNo ? `Admission No: ${student.admissionNo}` : null,
    student?.className
      ? `Class: ${student.className}${student.sectionName ? `-${student.sectionName}` : ''}`
      : null,
    student?.sessionName ? `Session: ${student.sessionName}` : null,
    student?.phone ? `Phone: ${student.phone}` : null,
    student?.email ? `Email: ${student.email}` : null,
    student?.address ? student.address : null,
  ].filter(Boolean) as string[];
  for (const line of billLines.slice(0, 4)) {
    doc.text(line, left + 10, by, { width: colW - 20 });
    by += 11;
  }

  const metaX = left + colW + colGap + 10;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text('INVOICE DETAILS', metaX, y + 8);
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  const metaRows: [string, string][] = [
    ['Invoice No', invoice.invoiceNo],
    ['Receipt No', payment.receiptNo],
    ['Invoice Date', fmtDate((invoice as { createdAt?: Date }).createdAt)],
    ['Payment Date', fmtDateTime(payment.paidAt)],
    ['Due Date', fmtDate(invoice.dueDate)],
    ['Status', String(invoice.status).toUpperCase()],
  ];
  let my = y + 24;
  for (const [k, v] of metaRows) {
    doc.fillColor(MUTED).text(k, metaX, my, { width: 78 });
    doc.fillColor(INK).font('Helvetica-Bold').text(v, metaX + 78, my, { width: colW - 100 });
    doc.font('Helvetica');
    my += 11;
  }

  y += boxH + 18;

  // Line items table
  const cols = {
    sno: left,
    desc: left + 36,
    qty: left + contentW - 220,
    rate: left + contentW - 150,
    amt: left + contentW - 80,
  };
  const rowH = 22;
  drawRect(doc, left, y, contentW, rowH, BRAND, BRAND);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
  doc.text('#', cols.sno + 8, y + 6);
  doc.text('Description', cols.desc, y + 6);
  doc.text('Qty', cols.qty, y + 6, { width: 40, align: 'right' });
  doc.text('Rate', cols.rate, y + 6, { width: 55, align: 'right' });
  doc.text('Amount', cols.amt, y + 6, { width: 70, align: 'right' });
  y += rowH;

  const items =
    allocations && allocations.length > 1
      ? allocations.map((a) => ({
          name: `Toward ${a.invoice.invoiceNo}${a.invoice.billingMonth ? ` (${a.invoice.billingMonth})` : ''}`,
          amount: a.amount,
        }))
      : invoice.items?.length
        ? invoice.items
        : [
            {
              name: 'Fee charges',
              amount: invoice.totalAmount + (invoice.discount || 0) - (invoice.lateFee || 0),
            },
          ];

  doc.font('Helvetica').fontSize(9).fillColor(INK);
  items.forEach((item, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : BRAND_LIGHT;
    drawRect(doc, left, y, contentW, rowH, bg);
    doc.fillColor(INK);
    doc.text(String(idx + 1), cols.sno + 8, y + 6);
    doc.text(item.name || 'Fee item', cols.desc, y + 6, { width: cols.qty - cols.desc - 8 });
    doc.text('1', cols.qty, y + 6, { width: 40, align: 'right' });
    doc.text(money(item.amount, currency), cols.rate, y + 6, { width: 55, align: 'right' });
    doc.text(money(item.amount, currency), cols.amt, y + 6, { width: 70, align: 'right' });
    y += rowH;
  });

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  y += 10;

  // Totals + payment summary
  const totalsW = 220;
  const totalsX = right - totalsW;
  const multi = Boolean(allocations && allocations.length > 1);
  const summaryRows: [string, string, boolean?][] = multi
    ? [
        ['Allocated to invoices', money(subtotal, currency)],
        ['This payment', money(payment.amount, currency), true],
        ['Balance due', money(0, currency), true],
      ]
    : [
        ['Subtotal', money(subtotal, currency)],
        ['Discount', `- ${money(invoice.discount || 0, currency)}`],
        ['Late fee', money(invoice.lateFee || 0, currency)],
        ['Invoice total', money(invoice.totalAmount, currency), true],
        ['Paid to date', money(invoice.paidAmount, currency)],
        ['This payment', money(payment.amount, currency), true],
        [
          'Balance due',
          money(Math.max(0, invoice.totalAmount - invoice.paidAmount), currency),
          true,
        ],
      ];

  for (const [label, value, emphasize] of summaryRows) {
    if (emphasize) {
      drawRect(doc, totalsX, y, totalsW, 20, BRAND_LIGHT, BRAND);
    }
    doc
      .fillColor(emphasize ? BRAND : MUTED)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .text(label, totalsX + 8, y + 5, { width: 100 });
    doc
      .fillColor(INK)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .text(value, totalsX + 100, y + 5, { width: totalsW - 110, align: 'right' });
    y += emphasize ? 22 : 16;
  }

  y += 8;

  // Payment acknowledgment
  drawRect(doc, left, y, contentW, 56, '#fff8f0', '#e8c9a8');
  doc
    .fillColor('#8a4b12')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('PAYMENT ACKNOWLEDGEMENT', left + 10, y + 8);
  doc
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(9)
    .text(
      `Received ${money(payment.amount, currency)} via ${String(payment.method).toUpperCase()}` +
        (payment.reference ? ` (Ref: ${payment.reference})` : '') +
        ` on ${fmtDateTime(payment.paidAt)}.`,
      left + 10,
      y + 24,
      { width: contentW - 20 }
    );
  doc
    .fillColor(MUTED)
    .text(`Receipt No: ${payment.receiptNo}`, left + 10, y + 38, { width: contentW - 20 });
  y += 68;

  // Amount in words
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('Amount in words (this payment)', left, y);
  y += 12;
  doc
    .fillColor(INK)
    .font('Helvetica-Oblique')
    .fontSize(10)
    .text(amountInWords(payment.amount), left, y, { width: contentW });
  y += 28;

  // Notes / terms
  drawHLine(doc, left, right, y);
  y += 12;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text('Notes & Terms', left, y);
  y += 14;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8);
  const terms = [
    '1. This is a computer-generated fee invoice/receipt and is valid without a physical signature unless required by policy.',
    '2. Fees once paid are subject to the institute refund & academic policy.',
    '3. Please retain this document for future reference and fee audits.',
    '4. For discrepancies, contact the accounts office within 7 working days of payment.',
  ];
  for (const t of terms) {
    doc.text(t, left, y, { width: contentW });
    y += 11;
  }

  // Signatures
  y = Math.max(y + 24, doc.page.height - 120);
  drawHLine(doc, left, right, y);
  y += 18;
  const sigW = contentW / 2 - 20;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Student / Parent', left, y);
  doc.text('Authorized Signatory / Accounts', left + contentW / 2 + 20, y);
  y += 36;
  drawHLine(doc, left, left + sigW, y);
  drawHLine(doc, left + contentW / 2 + 20, right, y);
  y += 8;
  doc
    .fillColor(MUTED)
    .fontSize(7)
    .text('(Signature)', left, y)
    .text('(For ' + institute.name + ')', left + contentW / 2 + 20, y);

  // Footer bar
  const footerY = doc.page.height - 28;
  doc.save().fillColor(BRAND).rect(0, footerY, pageW, 28).fill().restore();
  doc
    .fillColor('#fff')
    .font('Helvetica')
    .fontSize(7)
    .text(
      `${institute.name}  ·  Generated by AnyIT Institute CMS  ·  ${fmtDateTime(new Date())}`,
      left,
      footerY + 10,
      { width: contentW, align: 'center' }
    );

  doc.end();
}
