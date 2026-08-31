import type { AppSettings } from "../lib/config";
import { FiveSimProvider } from "./fivesim";
import { SmsManProvider } from "./smsman";
import { MockProvider } from "./mock";
import type { SMSProvider } from "./types";

function buildAdapter(name: string, settings: AppSettings): SMSProvider {
  switch (name) {
    case "fivesim":
      return new FiveSimProvider(settings.providerBaseUrl, settings.providerApiKey);
    case "smsman":
      return new SmsManProvider(settings.smsmanApiKey);
    case "mock":
    default:
      return new MockProvider();
  }
}

const KNOWN_NAMES = new Set(["mock", "fivesim", "smsman"]);

/** The primary configured provider (settings.provider). */
export function getProvider(settings: AppSettings): SMSProvider {
  return buildAdapter(KNOWN_NAMES.has(settings.provider) ? settings.provider : "mock", settings);
}

/**
 * Reconstruct a specific provider by name — used when handling an
 * *existing* order (checking SMS status, cancelling), where the order was
 * fulfilled by whichever provider actually had stock at purchase time
 * (order.provider_name), not necessarily today's primary provider.
 */
export function getProviderByName(name: string, settings: AppSettings): SMSProvider {
  return buildAdapter(KNOWN_NAMES.has(name) ? name : "mock", settings);
}

/**
 * Primary provider first, then each name in providerFallback in order,
 * skipping duplicates and any name that doesn't match a real adapter.
 */
export function getFallbackChain(settings: AppSettings): SMSProvider[] {
  const names = [settings.provider, ...settings.providerFallback];
  const seen = new Set<string>();
  const chain: SMSProvider[] = [];
  for (const name of names) {
    if (seen.has(name) || !KNOWN_NAMES.has(name)) continue;
    seen.add(name);
    chain.push(buildAdapter(name, settings));
  }
  return chain.length > 0 ? chain : [new MockProvider()];
}
