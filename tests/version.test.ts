import { writeFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { getSpecOpsVersion } from "../src/version.js";
import { withTempDir } from "./helpers.js";

describe("getSpecOpsVersion", () => {
    test("reads the version from package.json", async () => {
        await withTempDir(async dir => {
            const packageJson = `${dir}/package.json`;
            await writeFile(packageJson, JSON.stringify({ version: "9.9.9" }), "utf8");
            expect(await getSpecOpsVersion(packageJson)).toBe("9.9.9");
        });
    });
});
