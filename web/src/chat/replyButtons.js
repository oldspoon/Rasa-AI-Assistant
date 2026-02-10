// Icon shown on the left of a reply button, by its payload (FontAwesome class).
const ICONS = {
  "/pay_by_phone": "fa-phone",
  "/pay_at_infodesk": "fa-circle-info",
  "/ask_library_location": "fa-book",
  "/ask_books": "fa-book-open",
  "/ask_support_lectures": "fa-chalkboard-user",
};

export function iconFor(payload) {
  return ICONS[payload] ?? null;
}
