import { Badge } from '@/components/ui/badge';
import { CodeTabs } from '@/components/docs/code-tabs';

export default function WebhooksDocsPage() {
  const verifySnippets = [
    {
      language: 'typescript',
      label: 'Node.js / Express',
      code: `import crypto from 'node:crypto';
import express from 'express';

const app = express();
const WEBHOOK_SECRET = process.env.DENANEYA_WEBHOOK_SECRET!; // whsec_...

app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signatureHeader = req.headers['x-denaneya-signature'] as string;
  if (!signatureHeader) return res.status(401).send('Missing signature');

  // Format: t=<timestamp>,v1=<signature>
  const parts = Object.fromEntries(signatureHeader.split(',').map(kv => kv.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;

  // Verify signature against payload
  const signedPayload = \`\${timestamp}.\${req.body.toString('utf-8')}\`;
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body.toString('utf-8'));
  console.log('Verified event:', event.eventType, event.payload);

  res.status(200).send({ received: true });
});`,
    },
    {
      language: 'python',
      label: 'Python / Flask',
      code: `import hmac
import hashlib
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
WEBHOOK_SECRET = os.environ.get("DENANEYA_WEBHOOK_SECRET")

@app.route("/api/webhook", methods=["POST"])
def handle_webhook():
    sig_header = request.headers.get("X-DenaNeya-Signature", "")
    parts = dict(kv.split("=") for kv in sig_header.split(","))
    timestamp = parts.get("t")
    signature = parts.get("v1")

    signed_payload = f"{timestamp}.{request.get_data(as_text=True)}"
    expected_sig = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        return jsonify({"error": "Invalid signature"}), 401

    event = request.json
    print("Received event:", event["eventType"])
    return jsonify({"received": True}), 200`,
    },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Event Notifications</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Webhooks & Outbox Pattern
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Receive real-time transactional event notifications with cryptographic HMAC-SHA256 signature verification and exponential retry.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Event Catalog
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <li><code>payment.created</code> – Triggered whenever a new payment intent is initialized.</li>
          <li><code>payment.completed</code> – Triggered when payment is settled and balanced in the ledger.</li>
          <li><code>payment.failed</code> – Triggered when payment is cancelled or rejected by gateway/fraud rules.</li>
          <li><code>refund.created</code> – Triggered when a full or partial refund succeeds.</li>
        </ul>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          HMAC-SHA256 Signature Verification
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Every HTTP webhook delivered by DenaNeya contains the header <code>X-DenaNeya-Signature</code> formatted as <code>t=&lt;epoch_sec&gt;,v1=&lt;hex_digest&gt;</code>.
        </p>
        <CodeTabs snippets={verifySnippets} />

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          SSRF Protection Policy
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          To prevent Server-Side Request Forgery, webhook registration strictly enforces that target URLs must resolve to public routable IP addresses. Requests to <code>localhost</code>, <code>127.0.0.1</code>, private subnets (<code>10.0.0.0/8</code>, <code>192.168.0.0/16</code>), or cloud instance metadata services (<code>169.254.169.254</code>) are rejected with HTTP 422 <code>SSRF_VALIDATION_FAILED</code>.
        </p>
      </div>
    </div>
  );
}
