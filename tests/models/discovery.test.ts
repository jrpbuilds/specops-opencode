import { describe, expect, test } from "bun:test";
import { configuredModels } from "../../src/models.js";
import {
    allProviders,
    providerWithModelProviderID,
    providerWithoutModelProviderID,
} from "../fixtures.js";

describe("configuredModels", () => {
    test("flattens multiple providers into one model list", () => {
        const models = configuredModels(allProviders);
        expect(models).toHaveLength(4);
    });

    test("uses model.providerID when present", () => {
        const [glm] = configuredModels([providerWithModelProviderID]).filter(m =>
            m.id.endsWith("GLM-5.2"),
        );
        expect(glm.id).toBe("openference/GLM-5.2");
        expect(glm.providerID).toBe("openference");
        expect(glm.providerName).toBe("Openference");
        expect(glm.name).toBe("GLM-5.2");
    });

    test("falls back to provider.id when model.providerID is empty", () => {
        const [gpt5] = configuredModels([providerWithoutModelProviderID]).filter(m =>
            m.id.endsWith("gpt-5"),
        );
        expect(gpt5.id).toBe("openai/gpt-5");
        expect(gpt5.providerID).toBe("openai");
    });

    test("sorts variants alphabetically", () => {
        const [glm] = configuredModels([providerWithModelProviderID]).filter(m =>
            m.id.endsWith("GLM-5.2"),
        );
        expect(glm.variants).toEqual(["high", "low", "medium"]);
    });

    test("returns an empty variants array when the model has none", () => {
        const [gpt4o] = configuredModels([providerWithoutModelProviderID]).filter(m =>
            m.id.endsWith("gpt-4o"),
        );
        expect(gpt4o.variants).toEqual([]);
    });

    test("sorts the result by providerName then model name", () => {
        const models = configuredModels(allProviders);
        const names = models.map(m => `${m.providerName}/${m.name}`);
        const sorted = [...names].sort((a, b) => a.localeCompare(b));
        expect(names).toEqual(sorted);
    });

    test("returns an empty list for no providers", () => {
        expect(configuredModels([])).toEqual([]);
    });
});
