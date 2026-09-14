import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function ErrorCatalogDocsPage() {
  const errors = [
    { code: 'BAD_REQUEST', status: 400, desc: 'Malformed JSON payload or invalid syntax in request body.' },
    { code: 'UNAUTHORIZED', status: 401, desc: 'Missing, malformed, or unrecognized API Key Bearer token.' },
    { code: 'API_KEY_REVOKED', status: 401, desc: 'The specified API key was explicitly revoked by merchant admin.' },
    { code: 'API_KEY_EXPIRED', status: 401, desc: 'The expiration timestamp for this API key has passed.' },
    { code: 'INVALID_DEVICE_SIGNATURE', status: 401, desc: 'Android device ECDSA P-256 signature verification failed.' },
    { code: 'FORBIDDEN', status: 403, desc: 'Merchant account is currently suspended, terminated, or lacks required KYC.' },
    { code: 'INSUFFICIENT_PERMISSIONS', status: 403, desc: 'API key lacks the required scope (e.g. payments:write).' },
    { code: 'FRAUD_REJECTED', status: 403, desc: 'Payment blocked by the anti-fraud risk scoring engine (Risk Score >= 85).' },
    { code: 'NOT_FOUND', status: 404, desc: 'Requested resource does not exist or belongs to another merchant.' },
    { code: 'PAYMENT_NOT_FOUND', status: 404, desc: 'The payment ID does not exist for the authenticated merchant.' },
    { code: 'IDEMPOTENCY_CONFLICT', status: 409, desc: 'Idempotency key was replayed with a mismatched payload or amount.' },
    { code: 'PAYMENT_ALREADY_SETTLED', status: 409, desc: 'Payment was already completed with a different provider TrxID.' },
    { code: 'EVENT_REPLAY_DETECTED', status: 409, desc: 'Duplicate collector device nonce, stale timestamp, or non-monotonic sequence.' },
    { code: 'VALIDATION_ERROR', status: 422, desc: 'Request failed Zod schema validation. Inspect details.issues for specifics.' },
    { code: 'REFUND_EXCEEDS_CAPTURED', status: 422, desc: 'Requested refund amount exceeds the remaining unrefunded payment amount.' },
    { code: 'INVALID_PAYMENT_STATE', status: 422, desc: 'Attempted invalid state transition in payment finite state machine.' },
    { code: 'SSRF_VALIDATION_FAILED', status: 422, desc: 'Target webhook URL resolves to blocked IP range (localhost, private network, metadata).' },
    { code: 'RATE_LIMIT_EXCEEDED', status: 429, desc: 'Too many requests. Check Retry-After and X-RateLimit-Reset headers.' },
    { code: 'GATEWAY_ERROR', status: 502, desc: 'Upstream gateway (bKash/Nagad/SSLCOMMERZ) returned an error.' },
    { code: 'INTERNAL_SERVER_ERROR', status: 500, desc: 'Unexpected platform failure.' },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Badge variant="success">Standardized Taxonomy</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Error Code Catalog
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Universal error envelope structure and exhaustive taxonomy of platform error codes.
        </p>
      </div>

      <Card className="p-4 bg-slate-950 text-slate-200 border-slate-800 font-mono text-xs">
        <pre>{`{
  "error": {
    "code": "REFUND_EXCEEDS_CAPTURED",
    "message": "Refund amount (100000 paisa) exceeds remaining refundable amount (50000 paisa).",
    "details": {
      "capturedAmountPaisa": "100000",
      "alreadyRefundedPaisa": "50000",
      "requestedRefundPaisa": "100000"
    },
    "requestId": "req_84920a1b2c3d4e5f"
  }
}`}</pre>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg">
          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Error Code</th>
              <th className="p-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {errors.map((err) => (
              <tr key={err.code}>
                <td className="p-3 font-mono font-bold">
                  <Badge variant={err.status >= 500 ? 'destructive' : err.status >= 400 ? 'warning' : 'default'}>
                    {err.status}
                  </Badge>
                </td>
                <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                  {err.code}
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-400">
                  {err.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
