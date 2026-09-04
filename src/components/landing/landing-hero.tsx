'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Wallet, Globe2, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/nav/navbar';

type Service = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  slug: string;
};

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

const DEMO_CODE = '247 391';

function VerificationDemo() {
  const [typed, setTyped] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let i = 0;
    const typeTimer = setInterval(() => {
      i += 1;
      setTyped(DEMO_CODE.slice(0, i));
      if (i >= DEMO_CODE.length) {
        clearInterval(typeTimer);
        setTimeout(() => setVerified(true), 450);
      }
    }, 90);
    return () => clearInterval(typeTimer);
  }, []);

  return (
    <div className="relative flex h-full min-h-[320px] w-full items-center justify-center">
      <div className="absolute h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_70%)] blur-2xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0B1220]/90 p-5 shadow-[0_0_60px_-15px_rgba(37,99,235,0.4)] backdrop-blur"
      >
        <div className="flex items-center justify-between text-xs text-[#8B98AC]">
          <span>WhatsApp</span>
          <span>+44 7911 •• 3021</span>
        </div>

        <div className="mt-4 flex items-start gap-2">
          <div className="rounded-xl rounded-tl-sm bg-white/5 px-3.5 py-2.5 text-sm text-[#F4F7FB]">
            Your code is{' '}
            <span className="font-display font-semibold tabular-nums">
              {typed}
              {typed.length < DEMO_CODE.length && (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[#22D3EE] align-middle" />
              )}
            </span>
          </div>
        </div>

        {verified && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 20 }}
            className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#22D3EE] px-3.5 py-2.5"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-medium text-white">Number verified</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export function LandingHero({ services }: { services: Service[] }) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#05070C]">
        <div className="mx-auto max-w-6xl px-6">
          <section className="grid grid-cols-1 items-center gap-12 border-b border-white/10 py-20 lg:grid-cols-2 lg:py-28">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="max-w-lg font-display text-4xl font-semibold leading-[1.1] text-[#F4F7FB] sm:text-5xl">
                A phone number for the ten seconds you need one.
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#8B98AC]">
                Verify WhatsApp, Telegram, or almost anything else without handing out your real
                number. Pick a country, pick a service, get a code.
              </p>
              <Link
                href="/dashboard"
                className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-5 py-3 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
              >
                Get a number
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            <VerificationDemo />
          </section>

          <section className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 py-16 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="group flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#22D3EE] transition-colors duration-200 group-hover:bg-gradient-to-br group-hover:from-[#2563EB] group-hover:to-[#22D3EE] group-hover:text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-medium text-[#F4F7FB]">{item.title}</h3>
                  <p className="mt-1 text-sm text-[#8B98AC]">{item.description}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="py-16">
            <h2 className="font-display text-lg font-semibold text-[#F4F7FB]">
              What&apos;s live on RYZEL
            </h2>
            <p className="mt-1 text-sm text-[#8B98AC]">
              Virtual numbers today — more digital tools are on the way, all under one account.
            </p>

            <div className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
                >
                  <div>
                    <p className="font-medium text-[#F4F7FB]">{service.name}</p>
                    <p className="mt-0.5 text-sm text-[#8B98AC]">{service.description}</p>
                  </div>
                  {service.active && service.slug === 'virtual-numbers' ? (
                    <Link
                      href="/dashboard"
                      className="shrink-0 rounded-lg border border-white/15 px-3.5 py-2 text-sm font-medium text-[#F4F7FB] transition-colors duration-150 hover:border-[#22D3EE]/50 hover:bg-white/5"
                    >
                      Browse
                    </Link>
                  ) : !service.active ? (
                    <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8B98AC]">
                      Coming soon
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}