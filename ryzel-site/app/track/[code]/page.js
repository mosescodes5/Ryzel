"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { carrierTheme, STATUS_LABELS, STATUS_ORDER } from "@/lib/carrierThemes";

export default function TrackPage({ params }) {
  const { code } = use(params);
  const [tracker, setTracker] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPublicTracker(code)
      .then(setTracker)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-soft">
        Loading tracking info…
      </div>
    );
  }

  if (error || !tracker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="font-display font-bold text-[1.2rem]">Tracking code not found</div>
        <p className="text-ink-soft text-[0.9rem] max-w-sm">
          Double check the link — tracking codes are case-sensitive and don't include spaces.
        </p>
        <Link href="/" className="text-mint hover:underline text-[0.9rem] mt-2">
          Go to Ryzel
        </Link>
      </div>
    );
  }

  const theme = carrierTheme(tracker.carrier_style);
  const currentIdx = STATUS_ORDER.indexOf(tracker.status);
  const isException = tracker.status === "exception";

  return (
    <div className="min-h-screen bg-[#0B0C0D] text-white">
      <div style={{ background: theme.bg, color: theme.fg }} className="px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-bold text-[1.05rem]">{tracker.carrier_name || theme.label}</span>
          <span className="font-mono text-[0.85rem] opacity-80">{tracker.tracking_code}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <div className="text-[0.78rem] uppercase tracking-wide text-white/50 mb-1">Status</div>
          <div className="font-display font-bold text-[1.4rem]" style={{ color: isException ? "#E05252" : theme.accent }}>
            {STATUS_LABELS[tracker.status]}
          </div>
          {tracker.estimated_delivery && !["delivered", "exception"].includes(tracker.status) && (
            <div className="text-white/60 text-[0.88rem] mt-1">
              Estimated delivery: {new Date(tracker.estimated_delivery).toLocaleDateString()}
            </div>
          )}
        </div>

        {!isException && (
          <div className="flex items-center gap-1">
            {STATUS_ORDER.map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-1">
                <div
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: i <= currentIdx ? theme.accent : "rgba(255,255,255,0.12)" }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-[0.88rem]">
          <div>
            <div className="text-white/50 text-[0.78rem] uppercase tracking-wide mb-1">From</div>
            <div>{tracker.origin || "—"}</div>
          </div>
          <div>
            <div className="text-white/50 text-[0.78rem] uppercase tracking-wide mb-1">To</div>
            <div>{tracker.destination}</div>
          </div>
          {tracker.package_description && (
            <div className="col-span-2">
              <div className="text-white/50 text-[0.78rem] uppercase tracking-wide mb-1">Package</div>
              <div>{tracker.package_description}</div>
            </div>
          )}
        </div>

        <div>
          <div className="text-white/50 text-[0.78rem] uppercase tracking-wide mb-3">Tracking history</div>
          <div className="flex flex-col gap-4">
            {[...tracker.events].reverse().map((ev, idx) => (
              <div key={idx} className="flex gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: idx === 0 ? theme.accent : "rgba(255,255,255,0.25)" }}
                />
                <div>
                  <div className="font-semibold text-[0.92rem]">{STATUS_LABELS[ev.status] || ev.status}</div>
                  <div className="text-white/50 text-[0.8rem]">
                    {ev.location && `${ev.location} · `}
                    {new Date(ev.timestamp).toLocaleString()}
                  </div>
                  {ev.note && <div className="text-white/70 text-[0.85rem] mt-0.5">{ev.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center text-white/30 text-[0.78rem] pt-6 border-t border-white/10">
          Tracking page powered by{" "}
          <Link href="/" className="text-white/50 hover:text-white/80">
            Ryzel
          </Link>
        </div>
      </div>
    </div>
  );
}
