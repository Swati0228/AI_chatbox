/**
 * createKnowledgePDFs.js
 *
 * One-time script to generate sample Tomato policy PDF files in the
 * knowledge/ directory so you can test the RAG pipeline without needing
 * real PDF documents.
 *
 * Run with:
 *   node scripts/createKnowledgePDFs.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, "..", "knowledge");

fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// PDF generation using a minimal hand-crafted PDF structure
// (no external library required for simple text-only PDFs)
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid PDF containing only plain text.
 *
 * @param {string} title
 * @param {string} body   - Multi-line text content
 * @returns {Buffer}
 */
function makePDF(title, body) {
  // Split body into lines of max 90 chars for readability in the PDF stream
  const wrapLine = (line, maxLen = 90) => {
    const words = line.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxLen) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const allLines = [];
  for (const paragraph of body.split("\n")) {
    const wrapped = wrapLine(paragraph.trim());
    allLines.push(...wrapped, ""); // blank line between paragraphs
  }

  // PDF text commands — each line as a Tj text-showing operator
  const textLines = allLines
    .map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj 0 -14 Td`)
    .join("\n");

  const stream =
    `BT\n/F1 12 Tf\n50 750 Td\n` +
    `(${title.replace(/[()\\]/g, "\\$&")}) Tj\n0 -24 Td\n` +
    textLines +
    `\nET`;

  const streamBytes = Buffer.from(stream, "latin1");
  const streamLen = streamBytes.length;

  const header = `%PDF-1.4\n`;
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  const body_raw = header + obj1 + obj2 + obj3 + obj4 + obj5;

  // Cross-reference table
  const offsets = [];
  let offset = header.length;
  for (const obj of [obj1, obj2, obj3, obj4, obj5]) {
    offsets.push(offset);
    offset += obj.length;
  }

  const xrefOffset = offset;
  const xrefEntries = offsets
    .map((o) => o.toString().padStart(10, "0") + " 00000 n \n")
    .join("");
  const xref =
    `xref\n0 6\n0000000000 65535 f \n` + xrefEntries;

  const trailer =
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body_raw + xref + trailer, "latin1");
}

// ---------------------------------------------------------------------------
// Policy documents
// ---------------------------------------------------------------------------

const policies = [
  {
    filename: "refund_policy.pdf",
    title: "Tomato Food Delivery — Refund Policy",
    body: `
REFUND POLICY — EFFECTIVE DATE: JANUARY 1, 2025

1. ELIGIBILITY FOR REFUNDS
Customers are eligible for a full or partial refund in the following cases:
- The order was not delivered within the guaranteed delivery window (60 minutes from confirmation).
- Items in the order were missing or incorrect compared to what was ordered.
- The food arrived in a damaged, spoiled, or unsafe condition.
- The restaurant cancelled the order after confirmation.

2. HOW TO REQUEST A REFUND
Customers must submit a refund request within 24 hours of the original delivery time via:
- The Tomato app (Order History > Report an Issue)
- Contacting Tomato support via live chat or email at support@tomato.com

3. REFUND PROCESSING TIME
- Approved refunds are processed within 3-5 business days.
- Refunds are credited to the original payment method (credit card, debit card, or Tomato wallet).
- Tomato wallet refunds are credited instantly.

4. NON-REFUNDABLE SITUATIONS
Refunds will NOT be issued in the following cases:
- The customer ordered the wrong item and the order was correctly fulfilled.
- The customer changed their mind after the order was placed.
- Delivery was refused by the customer without a valid reason.
- The address provided was incorrect.

5. PARTIAL REFUNDS
Partial refunds may be issued when:
- Only some items in an order are affected.
- The food quality issue is minor and does not render the order inedible.

6. CONTACT
For refund-related queries: support@tomato.com | 1-800-TOMATO-1
`,
  },
  {
    filename: "delivery_policy.pdf",
    title: "Tomato Food Delivery — Delivery Policy & SLA",
    body: `
DELIVERY POLICY — EFFECTIVE DATE: JANUARY 1, 2025

1. DELIVERY COVERAGE
Tomato currently operates in 50+ cities. Delivery availability depends on your pinned address and the restaurant's delivery radius. The app will indicate whether delivery is available at your location.

2. ESTIMATED DELIVERY TIME
The estimated delivery time is shown on each restaurant's page before you place the order. On average, orders are delivered within 30-45 minutes. During peak hours (12-2 PM, 7-9 PM) or adverse weather, delivery may take up to 60 minutes.

3. DELIVERY SLA (SERVICE LEVEL AGREEMENT)
- Standard SLA: Delivery within 60 minutes of order confirmation.
- If your order exceeds 60 minutes, you are entitled to a free delivery credit of ₹50 for your next order.
- Express Delivery (where available): Orders delivered in 20-25 minutes; a small express fee applies.

4. ORDER TRACKING
You can track your order in real time via the Tomato app or website:
- "Order Confirmed" — Restaurant has accepted your order.
- "Preparing" — Restaurant is preparing your food.
- "Out for Delivery" — Delivery partner has picked up the order.
- "Delivered" — Order has been delivered to your address.

5. DELIVERY PARTNER CONDUCT
Tomato delivery partners are expected to:
- Arrive at the correct address as specified.
- Handle food safely and hygienically.
- Contact the customer if they cannot locate the address.

6. FAILED DELIVERIES
If a delivery attempt fails because:
- The customer is unreachable — The partner will wait 5 minutes and attempt a call before marking the order as undeliverable. No refund is issued in this case.
- Incorrect address — The customer is responsible. Contact support within 1 hour.

7. CONTACT
Delivery issues: support@tomato.com | Track order: Tomato App > Orders
`,
  },
  {
    filename: "ordering_policy.pdf",
    title: "Tomato Food Delivery — Ordering & Cancellation Policy",
    body: `
ORDERING & CANCELLATION POLICY — EFFECTIVE DATE: JANUARY 1, 2025

1. PLACING AN ORDER
Orders can be placed through:
- Tomato mobile app (iOS and Android)
- Tomato website at www.tomato.com
- Tomato USSD service (*786#) in select regions

2. MINIMUM ORDER VALUE
Some restaurants have a minimum order value (MOV). The MOV is displayed before checkout. Orders below the MOV may incur a small cart fee.

3. ORDER CONFIRMATION
After placing an order, you will receive:
- An in-app notification confirming the order.
- An SMS or email with the order summary and estimated delivery time.

4. CANCELLATION POLICY
Customers can cancel an order free of charge within 2 minutes of placing it.
After 2 minutes:
- If the restaurant has not started preparing: A 20% cancellation fee applies.
- If the restaurant has started preparing: Cancellation is not possible. Contact support for assistance.

5. MODIFYING AN ORDER
Orders cannot be modified after they are placed. If you need to change your order:
- Cancel within the allowed window (2 minutes) and re-order.
- Contact support immediately if the window has passed.

6. SCHEDULED ORDERS
Tomato supports scheduled delivery for up to 2 days in advance. Scheduled orders can be cancelled up to 30 minutes before the scheduled delivery slot without a fee.

7. SPECIAL DIETARY & ALLERGEN REQUESTS
Customers can add special instructions in the "Add Note" section during checkout. Tomato cannot guarantee allergen-free preparation as this is the responsibility of the restaurant partner.

8. CONTACT
Order support: support@tomato.com | 1-800-TOMATO-1
`,
  },
];

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------

for (const { filename, title, body } of policies) {
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  const pdfBuffer = makePDF(title, body);
  fs.writeFileSync(filePath, pdfBuffer);
  console.log(`Created: ${filePath} (${pdfBuffer.length} bytes)`);
}

console.log("\nAll knowledge PDFs created successfully.");
console.log(`Location: ${KNOWLEDGE_DIR}`);
