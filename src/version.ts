import { readFile } from "node:fs/promises";

/** Read this package's published version from package.json. */
export async function getSpecOpsVersion(
    packageJsonPath: string | URL = new URL("../package.json", import.meta.url),
): Promise<string> {
    const value: unknown = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim()) {
        throw new Error("package.json does not contain a valid version");
    }
    return value.version;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
