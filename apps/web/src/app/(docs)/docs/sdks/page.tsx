import { Badge } from '@/components/ui/badge';
import { CodeTabs } from '@/components/docs/code-tabs';

export default function SdksDocsPage() {
  const installSnippets = [
    {
      language: 'bash',
      label: 'Node / TypeScript',
      code: `npm install @denaneya/sdk
# or
pnpm add @denaneya/sdk
# or
yarn add @denaneya/sdk`,
    },
    {
      language: 'bash',
      label: 'Python 3',
      code: `pip install denaneya-python`,
    },
    {
      language: 'bash',
      label: 'PHP / Composer',
      code: `composer require denaneya/denaneya-php`,
    },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Badge variant="success">Developer Tools</Badge>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
          Official Client SDKs
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
          Accelerate your integration with official client libraries maintained by the DenaNeya engineering team.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Installation
        </h2>
        <CodeTabs snippets={installSnippets} />

        <h2 className="text-xl font-bold text-slate-900 dark:text-white pt-4">
          Features Included in All SDKs
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <li><strong>Native Paisa BigInt Support</strong>: Zero floating point numbers in currency calculations.</li>
          <li><strong>Automatic Idempotency</strong>: Generates unique UUID keys on write mutations when not explicitly supplied.</li>
          <li><strong>Webhook Signature Verification</strong>: Helper functions to verify <code>X-DenaNeya-Signature</code> headers.</li>
          <li><strong>Exponential Backoff Retry</strong>: Automatically handles transient network glitches and rate-limit backoff.</li>
        </ul>
      </div>
    </div>
  );
}
