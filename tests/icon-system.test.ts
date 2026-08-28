import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const icon = read("components/icon.tsx");
const seed = read("lib/seed.ts");
const fab = read("lib/fab.ts");
const dashboard = read("lib/dashboard.ts");
const formKit = read("components/form-kit.tsx");
const schema = read("db/schema.ts");
const migration = readFileSync(new URL("../drizzle/0010_semantic_icon_keys.sql", import.meta.url), "utf8");

/** Every key declared in the ICONS registry literal. */
function registryKeys(): Set<string> {
  const body = icon.slice(icon.indexOf("const ICONS = {"), icon.indexOf("} satisfies Record<string, IconDef>"));
  const keys = new Set<string>();
  // Entries are `name: {` or `"quoted-name": {` at two-space indentation.
  for (const match of body.matchAll(/^ {2}"?([a-z][a-z-]*)"?:\s*\{/gm)) keys.add(match[1]);
  return keys;
}

/** icon → key pairs from the LEGACY_EMOJI map. */
function legacyPairs(): Array<[string, string]> {
  const body = icon.slice(icon.indexOf("const LEGACY_EMOJI"), icon.indexOf("export function resolveIconName"));
  return [...body.matchAll(/^\s*"([^"]+)":\s*"([a-z-]+)",/gm)].map((m) => [m[1], m[2]] as [string, string]);
}

/** Values of every `icon: "…"` literal in a source file. */
function iconLiterals(source: string): string[] {
  return [...source.matchAll(/\bicon:\s*"([^"]*)"/g)].map((m) => m[1]);
}

test("the icon registry covers every key the product writes into the database", () => {
  const keys = registryKeys();
  assert.ok(keys.size > 40, `expected a populated registry, got ${keys.size}`);

  // seed.ts feeds BOTH the demo world and bootstrap-user.ts (every real signup),
  // so an unknown key here means a category row that renders no icon at all.
  for (const value of iconLiterals(seed)) {
    assert.ok(keys.has(value), `seed.ts uses icon "${value}" which is not in the registry`);
  }
  for (const value of iconLiterals(fab)) {
    assert.ok(keys.has(value), `fab.ts uses icon "${value}" which is not in the registry`);
  }
  for (const value of iconLiterals(dashboard)) {
    assert.ok(keys.has(value), `dashboard.ts uses icon "${value}" which is not in the registry`);
  }
});

test("legacy emoji all map onto real registry keys", () => {
  const keys = registryKeys();
  const pairs = legacyPairs();
  assert.ok(pairs.length > 30, `expected the legacy map to be populated, got ${pairs.length}`);
  for (const [emoji, key] of pairs) {
    assert.ok(keys.has(key), `LEGACY_EMOJI maps ${emoji} to unknown key "${key}"`);
  }
});

/*
 * Migration 0010 rewrites `categories.icon` / `goals.icon` in place. If it and
 * LEGACY_EMOJI disagree, rows written before the deploy render one glyph while
 * rows written after render another — a split-brain that only shows up in
 * production data, never in a fresh seed.
 */
test("migration 0010 agrees with the runtime legacy-emoji map", () => {
  for (const [emoji, key] of legacyPairs()) {
    if (!migration.includes(`WHEN '${emoji}'`)) continue;
    assert.ok(
      migration.includes(`WHEN '${emoji}' THEN '${key}'`),
      `migration 0010 maps ${emoji} differently from LEGACY_EMOJI (expected "${key}")`,
    );
  }
  // The two defaults the migration sets must match the Drizzle schema, or the
  // next generated migration would try to "fix" the drift.
  assert.match(migration, /ALTER TABLE "categories" ALTER COLUMN "icon" SET DEFAULT 'dot'/);
  assert.match(migration, /ALTER TABLE "goals" ALTER COLUMN "icon" SET DEFAULT 'target'/);
  assert.match(schema, /icon: text\("icon"\)\.notNull\(\)\.default\("dot"\)/);
  assert.match(schema, /icon: text\("icon"\)\.notNull\(\)\.default\("target"\)/);
});

test("the Mini App renders icons as SVG, not as emoji text", () => {
  // A stored legacy value must resolve to an SVG fallback, never a platform
  // emoji that would break the visual language on a different device.
  assert.match(icon, /const STANDARD_ICONS/);
  assert.match(icon, /absoluteStrokeWidth/);
  assert.match(icon, /fallback = "tag"/);
  assert.match(icon, /export function resolveIconName/);

  // The account-type table drives the account chips in every sheet.
  for (const value of iconLiterals(formKit)) {
    assert.ok(registryKeys().has(value), `form-kit.tsx uses icon "${value}" which is not in the registry`);
  }

  // Emoji in a native <option> label cannot be replaced by an SVG, so those
  // labels must have dropped the icon entirely rather than printing a raw key.
  const providers = read("components/providers.tsx");
  assert.doesNotMatch(providers, /label: `\$\{c\.icon\}/);
});
