import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The static Space imports ./shared/* files copied from web/src. Keep the three in step.
const here = dirname(fileURLToPath(import.meta.url));
const webSrc = resolve(here, "..");
const space = resolve(here, "../../../deploy/static-space");

const listed = readFileSync(resolve(space, "shared-files.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const appSource = readFileSync(resolve(space, "app.js"), "utf8");

// app.js without comments, so words inside comments are not mistaken for code.
const appCode = appSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const imported = [...appSource.matchAll(/from "\.\/shared\/([^"]+)"/g)].map((m) => m[1]);

// Names listed in app.js's `import { a, b as c } from "./shared/..."`.
const importedNames = new Set(
  [...appSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\/shared\//g)].flatMap((m) =>
    m[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop())
  )
);

const wordPattern = (name) => new RegExp("(?<![\\w$.])" + name.replace(/\$/g, "\\$") + "(?![\\w$])");
const declaredInApp = (name) => new RegExp("(?:const|let|function)\\s+" + name + "\\b").test(appCode);

describe("static Space shared modules", () => {
  it("lists only files that exist in web/src", () => {
    for (const file of listed) expect(existsSync(resolve(webSrc, file)), file).toBe(true);
  });

  it("copies every module that app.js imports", () => {
    const copied = listed.map((file) => file.split("/").pop());
    for (const name of imported) expect(copied, name).toContain(name);
  });

  it("only shares modules that import nothing else", () => {
    for (const file of listed) {
      const source = readFileSync(resolve(webSrc, file), "utf8");
      expect(/^\s*import\s/m.test(source), `${file} has imports`).toBe(false);
    }
  });

  it("imports every shared name that app.js uses", () => {
    for (const file of listed) {
      const source = readFileSync(resolve(webSrc, file), "utf8");
      const defined = [
        ...source.matchAll(/^(?:export\s+)?(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm),
      ].map((m) => m[1]);
      for (const name of defined) {
        if (wordPattern(name).test(appCode) && !declaredInApp(name)) {
          expect(importedNames.has(name), `${name} (from ${file}) is used but not imported`).toBe(true);
        }
      }
    }
  });

  it("loads app.js as a module", () => {
    const html = readFileSync(resolve(space, "index.html"), "utf8");
    expect(html).toContain('<script type="module" src="app.js">');
  });
});
