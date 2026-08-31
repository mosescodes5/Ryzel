/**
 * Purely cosmetic color themes for the tracker's public page. There is no
 * real DHL/FedEx/UPS integration here — the user manually enters every
 * status update. This just skins the page to roughly match whichever
 * carrier they picked (often because that's genuinely who's carrying the
 * package), the same way tools like AfterShip let a seller pick a carrier
 * label for their own branded tracking page.
 */
export const CARRIER_THEMES = {
  dhl: {
    label: "DHL style",
    bg: "#FFCC00",
    fg: "#D40511",
    accent: "#D40511",
  },
  fedex: {
    label: "FedEx style",
    bg: "#4D148C",
    fg: "#FFFFFF",
    accent: "#FF6600",
  },
  ups: {
    label: "UPS style",
    bg: "#351C15",
    fg: "#FFB500",
    accent: "#FFB500",
  },
  generic: {
    label: "Generic",
    bg: "#101314",
    fg: "#4CE0A6",
    accent: "#4CE0A6",
  },
};

export function carrierTheme(style) {
  return CARRIER_THEMES[style] || CARRIER_THEMES.generic;
}

export const STATUS_LABELS = {
  label_created: "Label created",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Exception",
};

export const STATUS_ORDER = [
  "label_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
];
