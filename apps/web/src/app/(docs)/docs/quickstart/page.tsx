import { Badge } from '@/components/ui/badge';
import { CodeTabs } from '@/components/docs/code-tabs';

export default function QuickstartPage() {
  const createPaymentSnippets = [
    {
      language: 'bash',
      label: 'cURL',
      code: `curl -X POST https://api.denaneya.com/v1/payments \\
  -H "Authorization: Bearer dn_test_sec_samplekey1234567890abcdef" \\
  -H "Idempotency-Key: idemp_order_1001" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amountPaisa": "50000",
    "currency": "BDT",
    "provider": "BKASH",
    "customer": {
      "name": "Nafis Fuad",
      "phone": "+8801712345678",
      "email": "nafis@example.com"
    },
    "description": "Order #1001: Dhaka Jamdani Saree",
    "redirectUrl": "https://mystore.com.bd/checkout/return"
  }'`,
    },
    {
      language: 'typescript',
      label: 'Node.js',
      code: `import { DenaNeyaClient } from '@denaneya/sdk';

const client = new DenaNeyaClient({
  apiKey: process.env.DENANEYA_SECRET_KEY!, // dn_test_sec_...
});

const payment = await client.payments.create({
  amountPaisa: 50000n, // ৳ 500.00 BDT in integer Paisa
  currency: 'BDT',
  provider: 'BKASH',
  customer: {
    name: 'Nafis Fuad',
    phone: '+8801712345678',
    email: 'nafis@example.com',
  },
  idempotencyKey: 'idemp_order_1001',
  redirectUrl: 'https://mystore.com.bd/checkout/return',
});

console.log('Redirect customer to:', payment.redirectUrl);`,
    },
    {
      language: 'python',
      label: 'Python',
      code: `import os
import requests

api_key = os.environ.get("DENANEYA_SECRET_KEY")

response = requests.post(
    "https://api.denaneya.com/v1/payments",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Idempotency-Key": "idemp_order_1001",
        "Content-Type": "application/json",
    },
    json={
        "amountPaisa": "50000",
        "currency": "BDT",
        "provider": "BKASH",
        "customer": {
            "name": "Nafis Fuad",
            "phone": "+8801712345678",
            "email": "nafis@example.com",
        },
        "redirectUrl": "https://mystore.com.bd/checkout/return",
    },
)

data = response.json()
print("Redirect URL:", data["redirectUrl"])`,
    },
    {
      language: 'php',
      label: 'PHP',
      code: `<?php

$ch = curl_init('https://api.denaneya.com/v1/payments');
$payload = json_encode([
    'amountPaisa' => '50000',
    'currency' => 'BDT',
    'provider' => 'BKASH',
    'customer' => [
        'name' => 'Nafis Fuad',
        'phone' => '+8801712345678',
        'email' => 'nafis@example.com'
    ],
    'redirectUrl' => 'https://mystore.com.bd/checkout/return'
]);

curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . getenv('DENANEYA_SECRET_KEY'),
    'Idempotency-Key: idemp_order_1001',
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$result = json_decode(curl_exec($ch), true);
echo "Redirect customer to: " . $result['redirectUrl'];`,
    },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Integration Guide</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          5-Minute Quickstart Integration
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Initiate your first sandbox payment and receive automated settlement confirmation in four straightforward steps.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">1</span>
            Obtain Sandbox API Keys
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Sign in to your merchant dashboard and navigate to <strong>API Keys</strong>. Copy your sandbox secret key (starts with <code>dn_test_sec_</code>).
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">2</span>
            Create a Payment Intent
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Submit a POST request to <code>/api/v1/payments</code> with the amount in integer <strong>Paisa</strong> (1 BDT = 100 Paisa). Include a unique <code>Idempotency-Key</code> to guarantee duplicate prevention.
          </p>
          <CodeTabs snippets={createPaymentSnippets} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">3</span>
            Redirect Customer to Checkout
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            The API response returns a <code>redirectUrl</code> (e.g. <code>https://checkout.denaneya.com/pay/pay_...</code>). Redirect your customer’s browser to this URL to complete payment via bKash, Nagad, Rocket, or Cards.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">4</span>
            Verify Settlement via Webhook
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Once settled, DenaNeya delivers a signed <code>payment.completed</code> webhook to your server, containing the verified upstream TrxID, ledger transaction reference, and gross/net amounts.
          </p>
        </div>
      </div>
    </div>
  );
}
