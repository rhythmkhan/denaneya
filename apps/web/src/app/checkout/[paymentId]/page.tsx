import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, merchants } from '@denaneya/database';
import { PaymentSummary } from '@/components/checkout/payment-summary';
import { MfsSelector } from '@/components/checkout/mfs-selector';
import { CardGatewaySelector } from '@/components/checkout/card-gateway-selector';
import { SandboxSimulator } from '@/components/checkout/sandbox-simulator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatPaisaToBDT } from '@/lib/format';
import { simulateSuccessAction, simulateFailureAction, submitTrxIdAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;

  let paymentRecord: any = null;
  let merchantName = 'Demo Merchant BD';
  let isSandbox = true;

  if (db) {
    const [row] = await db
      .select({
        payment: payments,
        merchant: merchants,
      })
      .from(payments)
      .leftJoin(merchants, eq(payments.merchantId, merchants.id))
      .where(eq(payments.id, paymentId));

    if (row && row.payment) {
      paymentRecord = row.payment;
      merchantName = row.merchant?.businessName || row.merchant?.name || 'Merchant';
      isSandbox = row.merchant?.environment === 'SANDBOX';
    } else {
      const [p] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId));
      if (p) {
        paymentRecord = p;
        if (p.merchantId) {
          const [m] = await db
            .select()
            .from(merchants)
            .where(eq(merchants.id, p.merchantId));
          if (m) {
            merchantName = m.businessName || m.name || 'Merchant';
            isSandbox = m.environment === 'SANDBOX';
          }
        }
      }
    }
  }

  // Fallback demo payment for previewing or testing
  if (!paymentRecord) {
    if (paymentId === 'pay_demo' || paymentId.startsWith('pay_test')) {
      paymentRecord = {
        id: paymentId,
        amountPaisa: 150000n, // ৳ 1,500.00
        currency: 'BDT',
        status: 'REQUIRES_ACTION',
        description: 'Demo E-commerce Checkout Order #84920',
        customerName: 'Tanvir Rahman',
      };
      isSandbox = true;
    } else {
      notFound();
    }
  }

  const amountBDT = formatPaisaToBDT(paymentRecord.amountPaisa, { showSymbol: false });

  const handleSimulateSuccess = async () => {
    'use server';
    const res = await simulateSuccessAction(paymentId);
    if (res.redirectUrl) {
      const { redirect } = await import('next/navigation');
      redirect(res.redirectUrl);
    }
  };

  const handleSimulateFailure = async () => {
    'use server';
    const res = await simulateFailureAction(paymentId);
    if (res.redirectUrl) {
      const { redirect } = await import('next/navigation');
      redirect(res.redirectUrl);
    }
  };

  const handleSubmitTrxId = async (provider: string, trxId: string) => {
    'use server';
    await submitTrxIdAction(paymentId, provider, trxId);
  };

  return (
    <div className="space-y-6">
      <PaymentSummary
        paymentId={paymentRecord.id}
        merchantName={merchantName}
        amountPaisa={paymentRecord.amountPaisa}
        currency={paymentRecord.currency}
        description={paymentRecord.description}
        customerName={paymentRecord.customerName}
        status={paymentRecord.status}
        isSandbox={isSandbox}
      />

      {isSandbox && (
        <SandboxSimulator
          paymentId={paymentRecord.id}
          onSimulateSuccess={handleSimulateSuccess}
          onSimulateFailure={handleSimulateFailure}
        />
      )}

      <div className="space-y-4">
        <Tabs defaultValue="mfs" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-11">
            <TabsTrigger value="mfs" className="text-sm font-semibold">
              Mobile Financial (bKash/Nagad)
            </TabsTrigger>
            <TabsTrigger value="cards" className="text-sm font-semibold">
              Debit / Credit Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mfs" className="mt-4">
            <MfsSelector
              paymentId={paymentRecord.id}
              amountBDT={amountBDT}
              onSubmitTrxId={handleSubmitTrxId}
              disabled={paymentRecord.status === 'COMPLETED'}
            />
          </TabsContent>

          <TabsContent value="cards" className="mt-4">
            <CardGatewaySelector
              paymentId={paymentRecord.id}
              disabled={paymentRecord.status === 'COMPLETED'}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
