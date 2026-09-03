import { Navbar } from '@/components/nav/navbar';
import { ActivationPicker } from '@/modules/numbers/components/activation-picker';

export default function NumbersMarketplacePage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-slate-900">Virtual numbers</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Pick a country and a service — you&apos;ll get a real number to receive that service&apos;s SMS
          code. Charged from your RYZEL wallet.
        </p>

        <div className="mt-8">
          <ActivationPicker />
        </div>
      </main>
    </>
  );
}
