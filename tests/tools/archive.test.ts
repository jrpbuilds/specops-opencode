import { describe, expect, test } from "bun:test";
import { archive, type ArchiveDeps } from "../../src/tools/archive.js";

function deps(overrides: Partial<ArchiveDeps> = {}): ArchiveDeps {
    return {
        archiveChange: async () => ({
            ok: true,
            archivedAs: "2026-08-09-example",
            path: "/project/openspec/changes/archive/2026-08-09-example",
        }),
        ...overrides,
    };
}

describe("archive", () => {
    test("rejects an empty change name without invoking OpenSpec", async () => {
        let called = false;
        const result = await archive("  ", {
            archiveChange: async () => {
                called = true;
                return { ok: false, error: "should not be called" };
            },
        });

        expect(result).toContain("change name is required");
        expect(called).toBe(false);
    });

    test("trims the name and reports the native archive result", async () => {
        let received: string | undefined;
        const result = await archive(
            "  example  ",
            deps({
                archiveChange: async change => {
                    received = change;
                    return {
                        ok: true,
                        archivedAs: "2026-08-09-example",
                        path: "/project/openspec/changes/archive/2026-08-09-example",
                    };
                },
            }),
        );

        expect(received).toBe("example");
        expect(result).toContain("2026-08-09-example");
        expect(result).toContain("/project/openspec/changes/archive/2026-08-09-example");
    });

    test("reports native archive failures without retrying", async () => {
        let calls = 0;
        const result = await archive("missing", {
            archiveChange: async () => {
                calls += 1;
                return { ok: false, error: "Change 'missing' not found." };
            },
        });

        expect(result).toContain("Change 'missing' not found.");
        expect(calls).toBe(1);
    });
});
