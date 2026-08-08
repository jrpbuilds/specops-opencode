import { describe, expect, test } from "bun:test";
import { configuredModels, clearConfiguredModel, selectConfiguredModel } from "../../src/models.js";
import { allProviders } from "../fixtures.js";

const models = configuredModels(allProviders);
const glm = models.find(m => m.id.endsWith("GLM-5.2"))!;
const gpt4o = models.find(m => m.id.endsWith("gpt-4o"))!;

describe("selectConfiguredModel", () => {
    test("sets the entry model to the selected model id", () => {
        expect(selectConfiguredModel({}, glm)).toEqual({
            model: "openference/GLM-5.2",
        });
    });

    test("retains a variant the selected model supports", () => {
        expect(selectConfiguredModel({ variant: "high" }, glm)).toEqual({
            model: "openference/GLM-5.2",
            variant: "high",
        });
    });

    test("drops a variant the selected model does not support", () => {
        expect(selectConfiguredModel({ variant: "thinking" }, glm)).toEqual({
            model: "openference/GLM-5.2",
        });
    });

    test("adds no variant when the entry had none", () => {
        expect(selectConfiguredModel({ model: "old/model" }, gpt4o)).toEqual({
            model: "openai/gpt-4o",
        });
    });
});

describe("clearConfiguredModel", () => {
    test("clears the model override and variant", () => {
        expect(clearConfiguredModel()).toEqual({});
    });
});
