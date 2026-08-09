import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { isOpenSpecInitialized } from "../../src/openspec/init.js";
import { withTempDir } from "../helpers.js";

describe("isOpenSpecInitialized", () => {
    test("returns false when no openspec directory exists", async () => {
        await withTempDir(async dir => {
            expect(await isOpenSpecInitialized(dir)).toBe(false);
        });
    });

    test("returns true when openspec/config.yaml exists in the directory", async () => {
        await withTempDir(async dir => {
            await mkdir(path.join(dir, "openspec"), { recursive: true });
            await writeFile(path.join(dir, "openspec", "config.yaml"), "schema: spec-driven\n");
            expect(await isOpenSpecInitialized(dir)).toBe(true);
        });
    });
});
