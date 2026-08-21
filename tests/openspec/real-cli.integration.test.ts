import { describe, expect, test } from "bun:test";
import { isOpenSpecAvailable } from "../../src/openspec/cli.js";
import { probeCompatibility } from "../../src/openspec/compatibility.js";
import { getOpenSpecContext } from "../../src/openspec/context.js";
import { archiveChange } from "../../src/openspec/archive.js";
import { createOpenSpecChange } from "../../src/openspec/create-change.js";
import { runOpenSpecDoctor } from "../../src/openspec/doctor.js";
import { getOpenSpecInstructions } from "../../src/openspec/instructions.js";
import { getOpenSpecStatus } from "../../src/openspec/status.js";
import { validateChange } from "../../src/openspec/validate.js";
import { runCaptureStdout } from "../../src/helpers.js";
import { withTempDir } from "../helpers.js";

const realCliAvailable = await isOpenSpecAvailable();
const realCliTest = realCliAvailable ? test : test.skip;

describe("real OpenSpec CLI compatibility", () => {
    realCliTest(
        "accepts the installed CLI and all supported wrapper response shapes (skipped when unavailable)",
        async () => {
            const compatibility = await probeCompatibility(process.cwd());
            expect(compatibility.compatible).toBe(true);
            expect(compatibility.missingCapabilities).toEqual([]);

            await withTempDir(async directory => {
                const initialized = await runCaptureStdout(
                    "openspec",
                    ["init", "--tools", "none", "--no-animation"],
                    directory,
                );
                expect(initialized.exitCode).toBe(0);

                const change = "real-cli-wrapper-fixture";
                const created = await createOpenSpecChange(change, directory);
                expect(created.ok).toBe(true);

                const instructions = await getOpenSpecInstructions("proposal", change, directory);
                expect(instructions.ok).toBe(true);

                const status = await getOpenSpecStatus(change, directory);
                expect(status.ok).toBe(true);

                const validation = await validateChange(change, directory);
                // A newly-created change is intentionally incomplete; this verifies
                // the real validation response, including its nested summary shape.
                expect(validation.valid).toBe(false);
                expect(validation.issues.length).toBeGreaterThan(0);

                const doctor = await runOpenSpecDoctor(directory);
                expect(doctor.incompatible).toBeNull();
                expect(doctor.initialized).toBe(true);

                const context = await getOpenSpecContext(directory);
                expect(context.available).toBe(true);
                expect(context.initialized).toBe(true);

                const archived = await archiveChange(change, directory);
                expect(archived.ok).toBe(true);
            });
        },
        30_000,
    );
});
