import { Badge } from '@/components/ui/badge';
import { CodeTabs } from '@/components/docs/code-tabs';

export default function PaymentsApiDocsPage() {
  const postPaymentSnippet = [
    {
      language: 'bash',
      label: 'cURL Request',
      code: `curl -X POST https://api.denaneya.com/v1/payments \\
  -H "Authorization: Bearer dn_live_sec_..." \\
  -H "Idempotency-Key: idemp_order_901" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amountPaisa": "250000",
    "currency": "BDT",
    "provider": "BKASH",
    "customer": {
      "name": "Farhana Yasmin",
      "phone": "+8801812345678",
      "email": "farhana@example.com"
    },
    "description": "Invoice #901 Payment"
  }'`,
    },
    {
      language: 'json',
      label: '201 Response',
      code: `{
  "id": "pay_9f83a812001",
  "merchantId": "mch_dhaka_01",
  "amountPaisa": "250000",
  "feePaisa": "3750",
  "refundedAmountPaisa": "0",
  "currency": "BDT",
  "status": "REQUIRES_ACTION",
  "provider": "BKASH",
  "redirectUrl": "https://checkout.denaneya.com/pay/pay_9f83a812001",
  "riskScore": 15,
  "idempotencyKey": "idemp_order_901",
  "createdAt": "2026-09-14T00:00:00.000Z"
}`,
    },
  ];

  const refundSnippet = [
    {
      language: 'bash',
      label: 'Refund Request',
      code: `curl -X POST https://api.denaneya.com/v1/payments/pay_9f83a812001/refund \\
  -H "Authorization: Bearer dn_live_sec_..." \\
  -H "Idempotency-Key: idemp_ref_01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amountPaisa": "100000",
    "reason": "Customer requested partial return"
  }'`,
    },
    {
      language: 'json',
      label: '201 Response',
      code: `{
  "id": "ref_b712c94401",
  "paymentId": "pay_9f83a812001",
  "merchantId": "mch_dhaka_01",
  "amountPaisa": "100000",
  "currency": "BDT",
  "status": "SUCCEEDED",
  "paymentStatus": "PARTIALLY_REFUNDED",
  "reason": "Customer requested partial return",
  "idempotencyKey": "idemp_ref_01",
  "createdAt": "2026-09-14T00:05:00.000Z"
}`,
    },
  ];

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <Badge variant="success">REST API v1 Reference</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Payments API Reference
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Initiate, query, list, and refund payments with strict multi-tenancy and zero-float financial precision.
        </p>
      </div>

      {/* POST /v1/payments */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="default" className="bg-emerald-600">POST</Badge>
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">/api/v1/payments</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Creates a payment intent. Triggers anti-fraud scoring, calculates fees, and initiates gateway session or hosted checkout.
        </p>
        <CodeTabs snippets={postPaymentSnippet} />
      </div>

      {/* POST /v1/payments/:id/refund */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Badge variant="default" className="bg-amber-600">POST</Badge>
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">/api/v1/payments/:id/refund</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Initiates a full or partial refund. Enforces that total refunds cannot exceed the captured amount, and records balanced ledger postings.
        </p>
        <CodeTabs snippets={refundSnippet} />
      </div>
    </div>
  );
}
