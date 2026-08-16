import parser from "@typescript-eslint/parser";
import plugin from "@typescript-eslint/eslint-plugin";

export default [
    {
        files: ["src/**/*.ts", "scripts/**/*.ts"],
        ignores: ["dist/**", "node_modules/**", "coverage/**"],
        languageOptions: {
            parser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "@typescript-eslint": plugin,
        },
        rules: {
            ...plugin.configs.recommended.rules,
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
];
