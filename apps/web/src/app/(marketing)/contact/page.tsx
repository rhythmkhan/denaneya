import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactForm } from '@/components/marketing/contact-form';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Sales & Developer Support | DenaNeya',
  description: 'Connect with our payment engineering and enterprise sales team in Dhaka, Bangladesh for custom gateway integrations and high-volume merchant pricing.',
};

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="success">Get in Touch</Badge>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Talk to Our Payment Engineering Team
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-base">
          Whether you need custom gateway integration, high-volume enterprise pricing, or collector device support, we are here to help.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 pb-6">
              <CardTitle className="text-xl">Send an Inquiry</CardTitle>
            </CardHeader>
            <ContactForm />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-6">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">
              Office & Support
            </h3>

            <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-slate-800 dark:text-slate-200">Dhaka Office:</strong>
                Gulshan-2, Dhaka 1212, Bangladesh
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <Mail className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-slate-800 dark:text-slate-200">Email:</strong>
                support@denaneya.com<br />
                sales@denaneya.com
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-slate-800 dark:text-slate-200">Phone:</strong>
                +880 9612-DENA-NEYA
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-slate-800 dark:text-slate-200">Hours:</strong>
                Sunday – Thursday: 9:00 AM – 6:00 PM BST<br />
                24/7 Priority Emergency Support for Enterprise
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
