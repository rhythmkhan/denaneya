import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://denaneya.com';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/checkout/',
        '/dashboard/',
        '/admin/',
        '/api/',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
