// Icon shown on the left of a reply button, by its payload (FontAwesome class).
const ICONS = {
  "/pay_by_phone": "fa-phone",
  "/pay_at_infodesk": "fa-circle-info",
};

export function iconFor(payload) {
  return ICONS[payload] ?? null;
}
