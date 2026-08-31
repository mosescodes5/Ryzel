"use client";

import { useEffect, useState } from "react";
import styles from "./tracking.module.css";
import { getCarrierTheme } from "../lib/carrierThemes";

interface TrackerEvent {
  status: string;
  location: string | null;
  note: string | null;
  timestamp: string;
}

interface PublicShipment {
  tracking_code: string;
  carrier_style: string;
  carrier_name: string | null;
  origin: string | null;
  destination: string | null;
  package_description: string | null;
  language: string;
  status: string;
  estimated_delivery: string | null;
  events: TrackerEvent[];
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  label_created: "Label Created",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  exception: "Exception",
  returned: "Returned to Sender",
};

function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TrackingTimeline({ shipment }: { shipment: PublicShipment }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const events = [...shipment.events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const theme = getCarrierTheme(shipment.carrier_style);

  useEffect(() => {
    // Reveal each event one at a time on load, most recent last — gives
    // the sense of the shipment's journey animating into place rather
    // than dumping the whole history on screen at once.
    if (visibleCount >= events.length) return;
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), 220);
    return () => clearTimeout(timer);
  }, [visibleCount, events.length]);

  const isDelivered = shipment.status === "delivered";

  return (
    <div
      className={styles.card}
      style={
        {
          "--accent": theme.accent,
          "--accent-dark": theme.accentDark,
          "--accent-light": theme.accent,
          "--badge-bg": theme.badgeBg,
          "--accent-glow": `${theme.accent}26`,
          "--accent-glow-soft": `${theme.accent}14`,
        } as React.CSSProperties
      }
    >
      <div className={styles.headerRow}>
        <div>
          {theme.logoText ? (
            <div className={styles.carrierLogo} style={{ color: theme.accent }}>
              {theme.logoText}
            </div>
          ) : (
            shipment.carrier_name && <div className={styles.carrier}>{shipment.carrier_name}</div>
          )}
          <div className={styles.trackingCode}>{shipment.tracking_code}</div>
        </div>
        <div className={`${styles.statusBadge} ${isDelivered ? styles.statusDelivered : styles.statusActive}`}>
          {isDelivered && <span className={styles.checkmark}>✓</span>}
          {formatStatus(shipment.status)}
        </div>
      </div>

      <div className={styles.routeRow}>
        <div className={styles.routePoint}>
          <div className={styles.routeLabel}>From</div>
          <div className={styles.routeValue}>{shipment.origin ?? "—"}</div>
        </div>
        <div className={styles.routeLine}>
          <div
            className={styles.routeLineFill}
            style={{ width: isDelivered ? "100%" : `${Math.min(90, (visibleCount / Math.max(events.length, 1)) * 100)}%` }}
          />
        </div>
        <div className={styles.routePoint}>
          <div className={styles.routeLabel}>To</div>
          <div className={styles.routeValue}>{shipment.destination ?? "—"}</div>
        </div>
      </div>

      {shipment.package_description && (
        <div className={styles.packageDesc}>{shipment.package_description}</div>
      )}

      {shipment.estimated_delivery && !isDelivered && (
        <div className={styles.eta}>
          Estimated delivery: <strong>{formatDate(shipment.estimated_delivery)}</strong>
        </div>
      )}

      <div className={styles.timeline}>
        {events
          .slice()
          .reverse()
          .map((event, idx) => {
            const originalIndex = events.length - 1 - idx;
            const isVisible = originalIndex < visibleCount;
            const isLatest = idx === 0;
            return (
              <div
                key={`${event.timestamp}-${originalIndex}`}
                className={`${styles.timelineItem} ${isVisible ? styles.timelineItemVisible : ""}`}
              >
                <div className={styles.timelineDotWrap}>
                  <div className={`${styles.timelineDot} ${isLatest ? styles.timelineDotLatest : ""}`} />
                  {idx !== events.length - 1 && <div className={styles.timelineConnector} />}
                </div>
                <div className={styles.timelineContent}>
                  <div className={styles.timelineStatus}>{formatStatus(event.status)}</div>
                  {event.location && <div className={styles.timelineLocation}>{event.location}</div>}
                  {event.note && <div className={styles.timelineNote}>{event.note}</div>}
                  <div className={styles.timelineTime}>{formatDate(event.timestamp)}</div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
