// Colour modes for the web chat. The palettes themselves are in styles/tokens.css.
//
// "default" is the achromatopsia (greyscale) palette, so nothing relies on colour alone.
// The other modes are colour-vision palettes.
export const CVD_MODES = [
  { id: "default", label: "Default", hint: "greyscale palette" },
  { id: "protanopia", label: "Protanopia", hint: "red-blind · blue palette" },
  { id: "deuteranopia", label: "Deuteranopia", hint: "green-blind · purple palette" },
  { id: "tritanopia", label: "Tritanopia", hint: "blue-blind · red palette" },
  { id: "deuteranomaly", label: "Deuteranomaly", hint: "weak green · teal palette" },
];

export const DEFAULT_CVD = "default";

// Saved values from earlier versions: "off" and "colour" (full colour) were removed, "achromatopsia" is now "default".
const RENAMED = { off: "default", colour: "default", achromatopsia: "default" };

export function normalizeCvd(saved) {
  const id = RENAMED[saved] ?? saved;
  return CVD_MODES.some((mode) => mode.id === id) ? id : DEFAULT_CVD;
}
