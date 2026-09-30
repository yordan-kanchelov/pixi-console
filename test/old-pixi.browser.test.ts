import { Application, BitmapFont, Cache } from "pixi.js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { DEFAULT_OPTIONS, PixiConsole } from "../src";

// pixi.js 8.1.5: uninstalling a bitmap font throws there, and `skipKerning: true` turns kerning on.
vi.mock("pixi.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("pixi.js")>()),
    VERSION: "8.1.5",
}));

let app: Application;

beforeAll(async () => {
    app = new Application();
    await app.init({ width: 800, height: 600, preference: "webgl" });
    document.body.appendChild(app.canvas);
});

afterAll(() => {
    app.destroy(true);
});

it("works around the bitmap font bugs of older pixi.js versions", () => {
    const install = vi.spyOn(BitmapFont, "install");
    const uninstall = vi.spyOn(BitmapFont, "uninstall");
    const name = `pixi-console:${DEFAULT_OPTIONS.fontFamily}:${DEFAULT_OPTIONS.fontSize}:${app.renderer.resolution}`;
    const mount = () => {
        const pixiConsole = new PixiConsole({ visible: true, toggleKey: null, autoResize: { renderer: app.renderer } });

        app.stage.addChild(pixiConsole);
        pixiConsole.log("hello");
        app.renderer.render(app.stage);

        return pixiConsole;
    };

    mount().destroy();

    // Passed so that kerning is skipped on these versions.
    expect(install).toHaveBeenCalledWith(expect.objectContaining({ name, skipKerning: false }));
    // Kept installed rather than uninstalled, and reused by the next console.
    expect(uninstall).not.toHaveBeenCalled();
    expect(Cache.has(`${name}-bitmap`)).toBe(true);

    install.mockClear();
    mount().destroy();

    expect(install).not.toHaveBeenCalled();
    expect(uninstall).not.toHaveBeenCalled();
});
