import { Container, Graphics, Sprite, Text, type Application, type Texture } from "pixi.js";

const COLORS = [0xff4f9a, 0xffb86b, 0x58a6ff, 0x3fd68f, 0xb48bff, 0xffe066];

/** Some eye candy for the console to sit on top of. Returns an update function driven by elapsed ms. */
export function createScene(app: Application): (elapsedMs: number) => void {
    const world = new Container({ label: "scene" });
    app.stage.addChild(world);

    const textures: Texture[] = COLORS.map((color) =>
        app.renderer.generateTexture(new Graphics().roundRect(0, 0, 30, 30, 8).fill(color)),
    );
    const dot = app.renderer.generateTexture(new Graphics().circle(0, 0, 2).fill(0xffffff));

    const stars = Array.from({ length: 90 }, (_, i) => {
        const star = world.addChild(new Sprite(dot));
        star.anchor.set(0.5);
        star.alpha = 0.15 + ((i * 37) % 60) / 100;
        return { star, x: ((i * 7919) % 1000) / 1000, y: ((i * 104729) % 1000) / 1000 };
    });

    const orbiters = Array.from({ length: 36 }, (_, i) => {
        const sprite = world.addChild(new Sprite(textures[i % textures.length]));
        sprite.anchor.set(0.5);
        return { sprite, phase: (i / 36) * Math.PI * 2, radius: 1 + (i % 4) * 0.22 };
    });

    const title = world.addChild(
        new Text({
            text: "pixi-console",
            style: {
                fill: 0xffffff,
                fontSize: 52,
                fontWeight: "800",
                fontFamily: "Inter, system-ui, sans-serif",
                letterSpacing: -1,
            },
        }),
    );
    title.anchor.set(0.5);

    const subtitle = world.addChild(
        new Text({
            text: "for PixiJS v8",
            style: { fill: 0xff4f9a, fontSize: 20, fontWeight: "600", fontFamily: "Inter, system-ui, sans-serif" },
        }),
    );
    subtitle.anchor.set(0.5);

    return (elapsedMs: number) => {
        const t = elapsedMs / 1000;
        const { width, height } = app.screen;
        const cx = width / 2;
        const cy = height * 0.3;
        const scale = Math.min(1, width / 700);

        for (const { star, x, y } of stars) {
            star.position.set(x * width, y * height);
        }

        title.position.set(cx, cy - 6 * scale);
        title.scale.set(scale * (1 + Math.sin(t * 2) * 0.03));
        subtitle.position.set(cx, cy + 38 * scale);
        subtitle.scale.set(scale);

        for (const { sprite, phase, radius } of orbiters) {
            const angle = phase + t * 0.6;
            const depth = Math.sin(angle);
            sprite.position.set(cx + Math.cos(angle) * 230 * radius * scale, cy + depth * 46 * radius * scale);
            sprite.rotation = angle * 2;
            sprite.scale.set(scale * (0.75 + depth * 0.25));
            sprite.alpha = 0.55 + depth * 0.45;
        }
    };
}
