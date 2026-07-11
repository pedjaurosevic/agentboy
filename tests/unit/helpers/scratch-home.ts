// Imported FIRST by tests that touch ~/.agentboy.json — repoints HOME to a
// fresh temp dir before config.ts computes its module-level paths.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HOME = mkdtempSync(join(tmpdir(), "agentboy-test-"));
