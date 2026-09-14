import { Badge } from '@/components/ui/badge';
import { CodeTabs } from '@/components/docs/code-tabs';

export default function HostedCheckoutDocsPage() {
  const snippets = [
    {
      language: 'html',
      label: 'HTML / Redirect',
      code: `<!-- 1. Customer clicks "Pay Now" on your checkout page -->
<form action="/create-payment" method="POST">
  <button type="submit">Pay ৳ 1,500 via DenaNeya</button>
</form>

<!-- 2. Your backend calls POST /api/v1/payments and redirects to redirectUrl -->
<script>
  window.location.href = "https://checkout.denaneya.com/pay/pay_9f83a812001";
</script>`,
    },
    {
      language: 'typescript',
      label: 'Next.js App Router Action',
      code: `// app/checkout/actions.ts
'use server';

import { redirect } from 'next/navigation';

export async function handleCheckout() {
  const res = await fetch('https://api.denaneya.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.DENANEYA_SECRET_KEY}\`,
      'Idempotency-Key': \`idemp_\${Date.now()}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amountPaisa: '150000',
      currency: 'BDT',
      redirectUrl: 'https://myshop.com.bd/checkout/status',
    }),
  });

  const payment = await res.json();
  redirect(payment.redirectUrl);
}`,
    },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Hosted Checkout</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Hosted Checkout Flow
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Provide your customers with an accessible, mobile-first payment experience with zero PCI-DSS compliance scope.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Why Use Hosted Checkout?
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li><strong>Out-of-the-Box Bangladesh Methods</strong>: Automatically displays bKash, Nagad, Rocket, Upay, and credit cards.</li>
          <li><strong>Built-In Sandbox Simulator</strong>: In test mode, merchants can instantly simulate successful or failed transactions without spending real money.</li>
          <li><strong>Zero Card Data Scope</strong>: Compliant with PCI-DSS SAQ-A. Sensitive card entries never touch your application server.</li>
          <li><strong>Automatic Local Language Support</strong>: Dynamic toggle between English and Bengali numerals and instructions.</li>
        </ul>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          Integration Flow
        </h2>
        <CodeTabs snippets={snippets} />
      </div>
    </div>
  );
}
