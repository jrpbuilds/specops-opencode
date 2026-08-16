import { readFile } from "node:fs/promises";
import { isRecord } from "./openspec/helpers.js";

/**
 * Read and validate this package's published version from `package.json`.
 *
 * The path is injectable for tests and defaults to the package file relative
 * to this module, which also works from the packed plugin distribution.
 */
export async function getSpecOpsVersion(
    packageJsonPath: string | URL = new URL("../package.json", import.meta.url),
): Promise<string> {
    const value: unknown = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim()) {
        throw new Error("package.json does not contain a valid version");
    }
    return value.version;
}
