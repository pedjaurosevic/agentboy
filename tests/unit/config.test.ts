import "./helpers/scratch-home"; // MUST be first: repoints HOME before config.ts loads
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../../src/main/config";

const configPath = () => join(process.env.HOME!, ".agentboy.json");
const onDisk = () => JSON.parse(readFileSync(configPath(), "utf8"));

test("first load creates the default file", () => {
  const def = loadConfig();
  assert.equal(def.theme, 1);
  assert.ok(existsSync(configPath()));
});

test("full patch persists and unrelated fields survive", () => {
  const before = loadConfig();
  assert.equal(
    saveConfig({
      theme: 4, light: true, worn: true, crtMode: "glass", crtIntensity: 12,
      outerStyle: "red", innerStyle: null, fontSize: 16, sfxMuted: false,
    }),
    true
  );
  const after = loadConfig();
  assert.equal(after.theme, 4);
  assert.equal(after.light, true);
  assert.equal(after.worn, true);
  assert.equal(after.crtMode, "glass");
  assert.equal(after.crtIntensity, 12);
  assert.equal(after.outerStyle, "red");
  assert.equal(after.innerStyle, null);
  assert.equal(after.fontSize, 16);
  assert.equal(after.sfxMuted, false);
  assert.equal(after.shell, before.shell);
});

test("partial patch does not clobber other fields", () => {
  saveConfig({ crtIntensity: 3 });
  const after = loadConfig();
  assert.equal(after.crtIntensity, 3);
  assert.equal(after.theme, 4);
  assert.equal(after.worn, true);
});

test("unknown keys are filtered out of the file", () => {
  saveConfig({ theme: 2, evil: "yes" } as never);
  const raw = onDisk();
  assert.equal(raw.theme, 2);
  assert.equal(raw.evil, undefined);
});

test("garbage patch is rejected and the file untouched", () => {
  assert.equal(saveConfig(null as never), false);
  assert.equal(saveConfig("x" as never), false);
  assert.equal(onDisk().theme, 2);
});

test("no .tmp leftovers after writes", () => {
  assert.ok(!existsSync(configPath() + ".tmp"));
});
