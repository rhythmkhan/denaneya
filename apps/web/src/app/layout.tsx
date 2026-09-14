import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DenaNeya — দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।',
  description: 'Enterprise multi-tenant payment management and orchestration platform for Bangladesh. bKash, Nagad, Rocket, Upay, Cards, and Double-Entry Ledger.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://denaneya.com'),
  openGraph: {
    title: 'DenaNeya — দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।',
    description: 'Modern Payment Orchestration Platform for Bangladesh Merchants.',
    url: 'https://denaneya.com',
    siteName: 'DenaNeya',
    locale: 'bn_BD',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DenaNeya — দেনা-নেওয়া সহজ, হিসাব নিশ্চিত।',
    description: 'Modern Payment Orchestration Platform for Bangladesh Merchants.',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://denaneya.com/#organization',
                  name: 'DenaNeya',
                  url: 'https://denaneya.com',
                  logo: 'https://denaneya.com/logo.png',
                  description: 'Multi-tenant payment management and orchestration platform for Bangladesh',
                  address: {
                    '@type': 'PostalAddress',
                    addressCountry: 'BD',
                    addressLocality: 'Dhaka',
                  },
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://denaneya.com/#website',
                  url: 'https://denaneya.com',
                  name: 'DenaNeya',
                  publisher: {
                    '@id': 'https://denaneya.com/#organization',
                  },
                },
                {
                  '@type': 'SoftwareApplication',
                  name: 'DenaNeya Payment Orchestrator',
                  applicationCategory: 'FinancialApplication',
                  operatingSystem: 'All',
                  offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'BDT',
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
