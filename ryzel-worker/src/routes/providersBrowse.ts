import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../types";
import { withDb } from "../db/client";
import { getSettings } from "../lib/config";
import { getPricingConfig, priceFromConfig } from "../lib/pricing";
import { getFallbackChain } from "../providers";
import { FiveSimProvider } from "../providers/fivesim";
import { ProviderLookupError, type Offer } from "../providers/types";

export const providerBrowseRoutes = new Hono<{ Bindings: Env }>();

// Country/service catalog browsing (buy screen dropdowns) stays
// 5SIM-specific — that's "what can I browse", not "is this in stock right
// now". Availability (offers below) uses the full fallback chain.
providerBrowseRoutes.get("/countries", async (c) => {
  const settings = getSettings(c.env);
  const fivesim = new FiveSimProvider(settings.providerBaseUrl, settings.providerApiKey);
  try {
    const countries = await fivesim.getCountries();
    return c.json({ countries, count: countries.length });
  } catch (e) {
    throw new HTTPException(502, { message: `Unable to load countries from 5SIM: ${(e as Error).message}` });
  }
});

providerBrowseRoutes.get("/services", async (c) => {
  const country = (c.req.query("country") ?? "").trim();
  const operator = c.req.query("operator") ?? "any";
  if (!country) throw new HTTPException(400, { message: "Country is required" });

  const settings = getSettings(c.env);
  const fivesim = new FiveSimProvider(settings.providerBaseUrl, settings.providerApiKey);
  try {
    const services = await fivesim.getServices(country, operator);
    return c.json({ country: country.toLowerCase(), operator: operator.toLowerCase(), services, count: services.length });
  } catch (e) {
    throw new HTTPException(502, { message: `Unable to load services from 5SIM: ${(e as Error).message}` });
  }
});

providerBrowseRoutes.get("/offers", async (c) => {
  const service = (c.req.query("service") ?? "").trim();
  const country = (c.req.query("country") ?? "").trim();
  if (!service || !country) throw new HTTPException(400, { message: "Service and country are required" });

  const settings = getSettings(c.env);

  // Provider fallback chain runs with NO DB connection open — these are
  // external HTTP calls to 5SIM/etc. and can retry across several
  // candidates. Holding a Hyperdrive slot for that whole time (as the old
  // code did, wrapping this loop in withDb) is what was exhausting the
  // pool under load. Same fix already applied to orders.ts's routes.
  let offers: Offer[] | null = null;
  let lastError: unknown = null;
  for (const candidate of getFallbackChain(settings)) {
    try {
      const result = await candidate.listOffers(service, country);
      if (result.length > 0) {
        offers = result;
        break;
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (!offers) {
    if (lastError instanceof ProviderLookupError) {
      throw new HTTPException(404, { message: lastError.message });
    }
    throw new HTTPException(502, { message: `Unable to load offers: ${String((lastError as Error)?.message ?? lastError)}` });
  }

  const resolvedOffers = offers;

  // DB is only opened here, for a single pricing-config lookup — never
  // while the provider calls above are in flight. priceFromConfig is a
  // pure sync function, so this also avoids re-querying siteSettings once
  // per offer (the old code re-fetched pricing config for every offer via
  // Promise.all — wasteful even before the connection-lifetime issue).
  return withDb(c, async (db) => {
    const cfg = await getPricingConfig(db, settings);
    return c.json(
      resolvedOffers.map((o) => ({
        operator: o.operator,
        price_ngn: priceFromConfig(o.costUsd, cfg),
        available: o.available ?? null,
      }))
    );
  });
});