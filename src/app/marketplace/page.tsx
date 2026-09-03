import Link from 'next/link';
import { Navbar } from '@/components/nav/navbar';
import { Card } from '@/components/ui/card';
import { listServices } from '@/lib/services/service-registry';

export default async function MarketplacePage() {
  const services = (await listServices()).filter((s) => s.type === 'marketplace');

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-slate-900">Marketplace</h1>
        <p className="mt-1 text-sm text-slate-500">Products you can buy on RYZEL right now — more launching soon.</p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <Card key={service.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-slate-900">{service.name}</h3>
                {!service.active && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-500">{service.description}</p>
                {service.active && (
                  <Link
                    href={service.slug === 'virtual-numbers' ? '/dashboard' : `/marketplace/${service.slug}`}
                    className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Browse →
                  </Link>
                )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
