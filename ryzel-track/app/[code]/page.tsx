import styles from "./tracking.module.css";
import TrackingTimeline from "./TrackingTimeline";

// Points at the ryzel-buy-number monolith's public tracking API. That app
// owns the actual `packages` table now (created via its own dashboard's
// self-service Package Tracker, or by an admin) — this used to point at
// api.ryzel.online (the old ryzel-worker backend), which read from a
// separate, now-disconnected database that ryzel-buy-number's tracking
// numbers were never written to.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://ryzel.online/api/v1";
const PUBLIC_TRACKER_PATH = "/track";

async function getShipment(code: string) {
  const res = await fetch(`${API_BASE}${PUBLIC_TRACKER_PATH}/${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function TrackingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const shipment = await getShipment(code);

  if (!shipment) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h1>Tracking code not found</h1>
          <p>Double-check the code and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TrackingTimeline shipment={shipment} />
    </div>
  );
}
