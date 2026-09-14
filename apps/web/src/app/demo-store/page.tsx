import { getAllDemoOrders, getDemoWebhookLogs } from '@/lib/demo-store/state';
import { DemoStoreClient } from './demo-store-client';

export const dynamic = 'force-dynamic';

export default async function DemoStorePage() {
  const initialOrders = getAllDemoOrders();
  const initialWebhookLogs = getDemoWebhookLogs();

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <DemoStoreClient
          initialOrders={initialOrders}
          initialWebhookLogs={initialWebhookLogs}
        />
      </div>
    </div>
  );
}
