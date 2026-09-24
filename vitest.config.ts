import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["test/**/*.test.ts"],
                    exclude: ["test/**/*.browser.test.ts"],
                    environment: "jsdom",
                },
            },
            {
                test: {
                    name: "browser",
                    include: ["test/**/*.browser.test.ts"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright({
                            launchOptions: {
                                // Optional: point at a preinstalled Chromium instead of `playwright install`.
                                executablePath: process.env.PW_CHROMIUM_PATH ?? undefined,
                                args: [
                                    "--use-angle=swiftshader",
                                    "--enable-unsafe-swiftshader",
                                    "--ignore-gpu-blocklist",
                                ],
                            },
                        }),
                        instances: [{ browser: "chromium" }],
                    },
                },
            },
        ],
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            reporter: ["text", "html", "lcov"],
        },
    },
});
