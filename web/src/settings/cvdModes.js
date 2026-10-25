// Colour modes for the web chat. The palettes themselves are in styles/tokens.css.
//
// "default" is the achromatopsia (greyscale) palette, so nothing relies on colour alone.
// "colour" is the full-colour look. The other modes are colour-vision palettes.
export const CVD_MODES = [
  { id: "default", label: "Default", hint: "greyscale palette" },
  { id: "colour", label: "Colour", hint: "full colour accents" },
  { id: "protanopia", label: "Protanopia", hint: "red-blind · blue palette" },
  { id: "deuteranopia", label: "Deuteranopia", hint: "green-blind · purple palette" },
  { id: "tritanopia", label: "Tritanopia", hint: "blue-blind · red palette" },
];

export const DEFAULT_CVD = "default";

// Saved values from before the greyscale default: "off" was the old default, "achromatopsia" is now "default".
const RENAMED = { off: "default", achromatopsia: "default" };

export function normalizeCvd(saved) {
  const id = RENAMED[saved] ?? saved;
  return CVD_MODES.some((mode) => mode.id === id) ? id : DEFAULT_CVD;
}
