import Link from 'next/link';
import { ShieldCheck, Zap, Wallet, Globe2 } from 'lucide-react';
import { Navbar } from '@/components/nav/navbar';
import { listServices } from '@/lib/services/service-registry';

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Delivered in seconds',
    description: 'Pick a country and a service — a real, working number is assigned instantly.'
  },
  {
    icon: ShieldCheck,
    title: 'Refunded automatically',
    description: "If no SMS arrives, you're refunded without opening a ticket."
  },
  {
    icon: Globe2,
    title: '100+ services, 7+ countries',
    description: 'WhatsApp, Telegram, Google, and dozens more, across the US, UK, Nigeria, and beyond.'
  },
  {
    icon: Wallet,
    title: 'One naira wallet',
    description: 'Top up once with a card or transfer. No new payment for every number you buy.'
  }
];

export default async function HomePage() {
  const services = await listServices();

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-6">
        <section className="border-b border-slate-200 py-20">
          <h1 className="max-w-lg text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            A phone number for the ten seconds you need one.
          </h1>
          <p className="mt-4 max-w-md text-slate-600">
            Verify WhatsApp, Telegram, or almost anything else without handing out your real number.
            Pick a country, pick a service, get a code.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-block rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Get a number
          </Link>
        </section>

        <section className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-slate-200 py-16 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-medium text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="py-16">
          <h2 className="text-lg font-semibold text-slate-900">What&apos;s live on RYZEL</h2>
          <p className="mt-1 text-sm text-slate-500">
            Virtual numbers today — more digital tools are on the way, all under one account.
          </p>

          <div className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium text-slate-900">{service.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{service.description}</p>
                </div>
                {service.active && service.slug === 'virtual-numbers' ? (
                  <Link
                    href="/dashboard"
                    className="shrink-0 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Browse
                  </Link>
                ) : !service.active ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    Coming soon
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
