import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://denaneya.com';
  const now = new Date();

  const publicRoutes = [
    { url: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { url: '/features', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/payment-methods', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
    { url: '/developers', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/security', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/contact', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/docs', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/docs/quickstart', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/docs/authentication', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/docs/payments-api', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/docs/hosted-checkout', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/docs/webhooks', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/docs/mfs-sms-automation', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/docs/error-catalog', priority: 0.6, changeFrequency: 'monthly' as const },
    { url: '/docs/sdks', priority: 0.7, changeFrequency: 'monthly' as const },
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
