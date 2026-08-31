"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select, Pill } from "@/components/ui";
import * as api from "@/lib/api";
import { isInsufficientBalanceError } from "@/lib/errors";
import { CARRIER_THEMES, carrierTheme, STATUS_LABELS } from "@/lib/carrierThemes";
import { CURRENCIES, LANGUAGES } from "@/lib/currencies";

const STATUS_TONE = {
  label_created: "neutral",
  picked_up: "signal",
  in_transit: "signal",
  out_for_delivery: "amber",
  delivered: "mint",
  exception: "red",
};

function formatNgn(amount) {
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

// The tracking page is now its own standalone deployment at
// track.ryzel.online, entirely separate from this site — no more
// building the link off window.location.origin + /track/...
function trackingLink(code) {
  return `https://track.ryzel.online/${code}`;
}

export default function TrackerView({ onBalanceChange, onInsufficientBalance, trackerFeeNgn = 50 }) {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const [carrierStyle, setCarrierStyle] = useState("generic");
  const [carrierName, setCarrierName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [language, setLanguage] = useState("en");

  const load = () => {
    setLoading(true);
    api
      .listTrackers()
      .then(setTrackers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; setState only happens after the async request resolves, not synchronously
  load();
}, []);
  async function handleCreate(e) {
    e.preventDefault();
    setError("");

    if (!destination.trim()) {
      setError("Destination is required");
      return;
    }

    setCreating(true);
    try {
      const tracker = await api.createTracker({
        carrier_style: carrierStyle,
        carrier_name: carrierName.trim() || null,
        sender_name: senderName.trim() || null,
        recipient_name: recipientName.trim() || null,
        origin: origin.trim() || null,
        destination: destination.trim(),
        package_description: packageDescription.trim() || null,
        estimated_delivery: estimatedDelivery ? new Date(estimatedDelivery).toISOString() : null,
        currency,
        language,
      });

      setTrackers((prev) => [tracker, ...prev]);
      setSelected(tracker);
      onBalanceChange?.();

      setCarrierName("");
      setSenderName("");
      setRecipientName("");
      setOrigin("");
      setDestination("");
      setPackageDescription("");
      setEstimatedDelivery("");
      setCurrency("NGN");
      setLanguage("en");
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAddEvent(tracker, status, location, note) {
    const updated = await api.addTrackerEvent(tracker.id, { status, location: location || null, note: note || null });
    setTrackers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected(updated);
  }

  async function handleDelete(tracker) {
    if (!confirm(`Delete tracker for ${tracker.destination}? The public link will stop working.`)) return;
    await api.deleteTracker(tracker.id);
    setTrackers((prev) => prev.filter((t) => t.id !== tracker.id));
    if (selected?.id === tracker.id) setSelected(null);
  }

  if (selected) {
    return (
      <TrackerDetail
        tracker={selected}
        onBack={() => setSelected(null)}
        onAddEvent={handleAddEvent}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-display font-bold text-[1.15rem] mb-1">Create a tracking link</h2>
        <p className="text-[0.85rem] text-ink-soft mb-5">
          Costs {formatNgn(trackerFeeNgn)} from your wallet per tracking link created. This is a manual tracker —
          you control every status update yourself, styled to look like a real courier's page. Adding updates
          afterward is free.
        </p>

        <form onSubmit={handleCreate} className="flex flex-col gap-1">
          <Field label="Carrier style">
            <Select value={carrierStyle} onChange={(e) => setCarrierStyle(e.target.value)}>
              {Object.entries(CARRIER_THEMES).map(([key, theme]) => (
                <option key={key} value={key}>{theme.label}</option>
              ))}
            </Select>
          </Field>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Carrier name (optional)">
              <Input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} placeholder="DHL Express" />
            </Field>
            <Field label="Package description (optional)">
              <Input value={packageDescription} onChange={(e) => setPackageDescription(e.target.value)} placeholder="1x parcel, 2kg" />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Sender name (optional)">
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            </Field>
            <Field label="Recipient name (optional)">
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Origin (optional)">
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Lagos, Nigeria" />
            </Field>
            <Field label="Destination">
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Abuja, Nigeria" required />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tracking page language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Estimated delivery (optional)">
            <Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
          </Field>

          <div className="flex items-center justify-end mt-2 pt-2">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : `Create — ${formatNgn(trackerFeeNgn)}`}
            </Button>
          </div>

          {error && (
            <div className="bg-red-soft text-red text-[0.85rem] px-3 py-2.5 rounded-lg mt-3 flex items-center justify-between gap-3 flex-wrap">
              <span>{error}</span>
              {isInsufficientBalanceError(error) && (
                <button onClick={onInsufficientBalance} className="font-semibold underline shrink-0">
                  Fund wallet
                </button>
              )}
            </div>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="font-display font-bold text-[1.05rem] mb-4">Your tracking links</h2>
        {loading ? (
          <p className="text-ink-soft text-[0.9rem]">Loading…</p>
        ) : trackers.length === 0 ? (
          <p className="text-ink-soft text-[0.9rem]">No tracking links yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {trackers.map((tr) => {
              const theme = carrierTheme(tr.carrier_style);
              return (
                <div
                  key={tr.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-line hover:border-line-strong cursor-pointer"
                  onClick={() => setSelected(tr)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[0.72rem] font-bold px-2 py-1 rounded-md"
                      style={{ background: theme.bg, color: theme.fg }}
                    >
                      {theme.label}
                    </span>
                    <div>
                      <div className="font-semibold text-[0.92rem] font-mono">{tr.tracking_code}</div>
                      <div className="text-[0.8rem] text-ink-soft">
                        {tr.origin || "?"} → {tr.destination}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={STATUS_TONE[tr.status]}>{STATUS_LABELS[tr.status]}</Pill>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(tr);
                      }}
                      className="text-ink-faint hover:text-red text-[0.8rem]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function TrackerDetail({ tracker, onBack, onAddEvent, onDelete }) {
  const theme = carrierTheme(tracker.carrier_style);
  const [status, setStatus] = useState(tracker.status);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const link = trackingLink(tracker.tracking_code);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitEvent(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAddEvent(tracker, status, location, note);
      setLocation("");
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="text-[0.85rem] text-ink-soft hover:text-ink self-start">
        ← Back to tracking links
      </button>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span
              className="text-[0.78rem] font-bold px-2.5 py-1.5 rounded-md"
              style={{ background: theme.bg, color: theme.fg }}
            >
              {tracker.carrier_name || theme.label}
            </span>
            <span className="font-mono font-semibold">{tracker.tracking_code}</span>
          </div>
          <button onClick={() => onDelete(tracker)} className="text-ink-faint hover:text-red text-[0.82rem]">
            Delete tracker
          </button>
        </div>

        <Field label="Shareable public link">
          <div className="flex gap-2">
            <Input value={link} readOnly />
            <Button variant="ghost" onClick={copyLink} className="shrink-0">
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-4 text-[0.85rem] mt-4">
          <div><span className="text-ink-soft">Origin:</span> {tracker.origin || "—"}</div>
          <div><span className="text-ink-soft">Destination:</span> {tracker.destination}</div>
          <div><span className="text-ink-soft">Sender:</span> {tracker.sender_name || "—"}</div>
          <div><span className="text-ink-soft">Recipient:</span> {tracker.recipient_name || "—"}</div>
          <div><span className="text-ink-soft">Currency:</span> {tracker.currency || "NGN"}</div>
          <div><span className="text-ink-soft">Language:</span> {tracker.language || "en"}</div>
        </div>
      </Card>

      <Card>
        <h3 className="font-display font-bold text-[1rem] mb-4">Add a status update</h3>
        <form onSubmit={submitEvent} className="flex flex-col gap-1">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Location (optional)">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ibadan sorting facility" />
            </Field>
            <Field label="Note (optional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Departed facility" />
            </Field>
          </div>
          <Button type="submit" disabled={submitting} className="self-start mt-2">
            {submitting ? "Adding…" : "Add update"}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="font-display font-bold text-[1rem] mb-4">History</h3>
        <div className="flex flex-col gap-3">
          {[...tracker.events].reverse().map((ev, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: theme.accent }} />
              <div>
                <div className="font-semibold text-[0.88rem]">{STATUS_LABELS[ev.status] || ev.status}</div>
                <div className="text-[0.8rem] text-ink-soft">
                  {ev.location && `${ev.location} · `}
                  {new Date(ev.timestamp).toLocaleString()}
                </div>
                {ev.note && <div className="text-[0.82rem] text-ink-soft mt-0.5">{ev.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}