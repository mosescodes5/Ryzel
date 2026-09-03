// The rest of the site moved to a light theme (see globals.css) — the
// package tracker keeps its own dark theme on purpose (a separate,
// distinctly-branded product from the SMS marketplace), so it sets its
// background explicitly here instead of inheriting the global light body.
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-950 text-mist-100">{children}</div>;
}
