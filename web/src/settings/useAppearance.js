import { useEffect, useState } from "react";
import { K_CVD, K_THEME } from "../storage/keys.js";
import { CVD_MODES, normalizeCvd } from "./cvdModes.js";

export { CVD_MODES };

export const THEMES = [
  { id: "system", label: "System", icon: "fa-desktop" },
  { id: "light", label: "Light", icon: "fa-sun" },
  { id: "dark", label: "Dark", icon: "fa-moon" },
];

// Theme and colour-vision mode, saved in localStorage and applied to <html>.
export function useAppearance() {
  const [themePref, setThemePref] = useState(
    () => localStorage.getItem(K_THEME) ?? "system"
  );
  const [cvd, setCvd] = useState(() => normalizeCvd(localStorage.getItem(K_CVD)));
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(K_THEME, themePref);
  }, [theme, themePref]);

  useEffect(() => {
    document.documentElement.dataset.cb = cvd;
    localStorage.setItem(K_CVD, cvd);
  }, [cvd]);

  return { themePref, setThemePref, cvd, setCvd };
}
