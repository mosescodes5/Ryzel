import styles from "./tracking.module.css";
import TrackingTimeline from "./TrackingTimeline";

// TODO: confirm this matches how `publicTrackerRoutes` is actually mounted
// in ryzel-worker's index.ts (e.g. app.route("/track", publicTrackerRoutes)
// vs "/public/trackers" etc.) — update this one constant if it differs.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.ryzel.online";
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