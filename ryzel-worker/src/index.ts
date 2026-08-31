import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";
import { getSettings } from "./lib/config";
import { walletRoutes } from "./routes/wallet";
import { orderRoutes } from "./routes/orders";
import { paymentRoutes } from "./routes/payments";
import { settingsRoutes } from "./routes/settings";
import { adminRoutes } from "./routes/admin";
import { invoiceRoutes } from "./routes/invoices";
import { trackerRoutes, publicTrackerRoutes } from "./routes/trackers";
import { providerBrowseRoutes } from "./routes/providersBrowse";
import { authRoutes } from "./routes/auth";

const app = new Hono<{ Bindings: Env }>();

// CORS origins come from the CORS_ORIGINS var (comma-separated), same list
// that lived in main.py's allow_origins=[...] before.
app.use("*", async (c, next) => {
  const settings = getSettings(c.env);
  return cors({
    origin: settings.corsOrigins,
    credentials: true,
  })(c, next);
});

app.get("/", (c) =>
  c.json({ service: "ryzel-api", status: "ok" })
);

app.route("/wallet", walletRoutes);
app.route("/orders", orderRoutes);
app.route("/payments/korapay", paymentRoutes);
app.route("/settings", settingsRoutes);
app.route("/admin", adminRoutes);
app.route("/invoices", invoiceRoutes);
app.route("/trackers", trackerRoutes);
app.route("/track", publicTrackerRoutes);
app.route("/providers", providerBrowseRoutes);
app.route("/auth", authRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ detail: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ detail: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ detail: "Not found" }, 404));

export default app;
