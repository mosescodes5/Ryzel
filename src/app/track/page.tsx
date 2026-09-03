import { PackageSearch } from 'lucide-react';
import { TrackHeader } from '@/components/track/track-header';
import { TrackSearchBox } from '@/components/track/track-search-box';

export default function TrackLandingPage() {
  return (
    <>
      <TrackHeader />
      <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center">
        <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-ink-800 text-signal-400">
          <PackageSearch className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-semibold text-mist-100 sm:text-3xl">Track your package</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-500">
          Enter the tracking number you were given to see its current status and delivery history.
        </p>

        <div className="mt-8">
          <TrackSearchBox />
        </div>
      </main>
    </>
  );
}
