export interface CarrierTheme {
  displayName: string;
  accent: string;
  accentDark: string;
  badgeBg: string;
  badgeColor: string;
  logoText: string;
}

// Real brand colors per carrier so a "dhl"-styled tracker actually reads
// as DHL, a "fedex" one as FedEx, etc. — not a Ryzel-branded wrapper.
const THEMES: Record<string, CarrierTheme> = {
  dhl: {
    displayName: "DHL",
    accent: "#D40511",
    accentDark: "#A6040E",
    badgeBg: "#FFF4D6",
    badgeColor: "#8A6D00",
    logoText: "DHL",
  },
  fedex: {
    displayName: "FedEx",
    accent: "#4D148C",
    accentDark: "#38105F",
    badgeBg: "#FFE8D6",
    badgeColor: "#B14A00",
    logoText: "FedEx",
  },
  ups: {
    displayName: "UPS",
    accent: "#351C15",
    accentDark: "#1F0F0A",
    badgeBg: "#FFF1CC",
    badgeColor: "#8A6300",
    logoText: "UPS",
  },
  generic: {
    displayName: "Shipment Tracking",
    accent: "#4338ca",
    accentDark: "#312e81",
    badgeBg: "#eef2ff",
    badgeColor: "#4338ca",
    logoText: "",
  },
};

export function getCarrierTheme(carrierStyle: string): CarrierTheme {
  return THEMES[carrierStyle] ?? THEMES.generic;
}
