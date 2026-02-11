import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAY, reply, resetBookings } from "./demoEngine.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../../guide.html"), "utf8");
const sidebar = readFileSync(resolve(here, "../components/Sidebar.jsx"), "utf8");

const phrases = [...page.matchAll(/<p class="ask">([^<]+)<\/p>/g)].map((m) =>
  m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim()
);

const NOT_UNDERSTOOD = [SAY.outOfScope, SAY.fallback, SAY.guard];
const alice = () => reply("My name is Alice Johnson", null).student;

describe("quick start guide page", () => {
  it("lists example phrases for every supported conversation", () => {
    expect(phrases.length).toBeGreaterThanOrEqual(25);
    for (const topic of ["lectures", "teacher", "book an office hour", "appointments", "timetable", "support lecture", "library", "borrow", "parking", "Help"]) {
      expect(phrases.join("\n").toLowerCase()).toContain(topic.toLowerCase());
    }
  });

  it("only suggests phrases the chat understands", () => {
    for (const phrase of phrases) {
      resetBookings();
      const texts = reply(phrase, alice(), new Date(2026, 10, 16)).texts;
      expect(NOT_UNDERSTOOD, phrase).not.toContain(texts[0]);
    }
  });

  it("takes its colours from the site's own palettes", () => {
    expect(page).toContain('href="/src/styles/tokens.css"');
    expect(page).toContain("attendance-bot-theme");
    expect(page).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("answers every example as Alice Johnson", () => {
    expect(page).toContain("Alice Johnson");
    expect(page).toContain('<p class="bot">');
  });

  it("has no comments and a way back to the chat", () => {
    expect(page).not.toMatch(/<!--/);
    expect(page).toContain('href="./"');
  });
});

describe("sidebar", () => {
  it("opens the guide in a new tab from the very top of Ask about", () => {
    const label = sidebar.indexOf("Ask about");
    const link = sidebar.indexOf("guide.html");
    const firstShortcut = sidebar.indexOf("SIDEBAR_QUESTIONS.map");
    expect(label).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(label);
    expect(link).toBeLessThan(firstShortcut);
    expect(sidebar).toContain('target="_blank"');
    expect(sidebar).toContain("Quick start guide");
  });
});
