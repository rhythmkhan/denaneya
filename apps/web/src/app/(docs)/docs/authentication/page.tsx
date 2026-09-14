import { Badge } from '@/components/ui/badge';

export default function AuthenticationDocsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Security & Credentials</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Authentication & API Key Management
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          DenaNeya authenticates API requests via Bearer tokens using cryptographically secure API keys.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Key Formats & Environments
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="pb-2">Prefix</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Environment</th>
                <th className="pb-2">Target Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              <tr>
                <td className="py-2.5 text-emerald-600 font-bold">dn_live_sec_...</td>
                <td className="py-2.5">Secret</td>
                <td className="py-2.5">Production</td>
                <td className="py-2.5 font-sans">Server-to-server operations (Charges, Refunds)</td>
              </tr>
              <tr>
                <td className="py-2.5 text-blue-600 font-bold">dn_test_sec_...</td>
                <td className="py-2.5">Secret</td>
                <td className="py-2.5">Sandbox</td>
                <td className="py-2.5 font-sans">Testing simulator and development</td>
              </tr>
              <tr>
                <td className="py-2.5 text-slate-600 font-bold">dn_live_pub_...</td>
                <td className="py-2.5">Publishable</td>
                <td className="py-2.5">Production</td>
                <td className="py-2.5 font-sans">Browser / Mobile client SDK initialization</td>
              </tr>
              <tr>
                <td className="py-2.5 text-slate-600 font-bold">dn_test_pub_...</td>
                <td className="py-2.5">Publishable</td>
                <td className="py-2.5">Sandbox</td>
                <td className="py-2.5 font-sans">Frontend testing integration</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          API Scopes
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          When creating API keys in your dashboard, restrict their permissions according to the principle of least privilege:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          <li><code>payments:read</code> – Query payment status, list payments, inspect fee breakdowns.</li>
          <li><code>payments:write</code> – Initiate payments, process customer refunds.</li>
          <li><code>payment_links:write</code> – Generate dynamic payment links and Bangla QR codes.</li>
          <li><code>invoices:write</code> – Create and issue digital invoices.</li>
          <li><code>webhooks:write</code> – Register and manage webhook notification endpoints.</li>
        </ul>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          Zero-Downtime Key Rotation
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          When rotating an active secret key, DenaNeya grants a 24-hour grace period during which both the retiring key and the newly issued key remain functional. This ensures zero transaction drops during deployment across your application cluster.
        </p>
      </div>
    </div>
  );
}
