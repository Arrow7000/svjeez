import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSvg } from "svjeez";
import { openScene, renderReview } from "svjeez/frames";
import build from "../../skills/svjeez/examples/pr-walkthrough";
import { cli, cliPath } from "../helpers/cli";
import { browser } from "../helpers/frames-browser";
import { same } from "../helpers/frames";

const svg = build();

// Runs in Chromium, reading the actual drawing rather than the scene's timeline internals.
const picture = () => {
  const opacity = (element: Element): number => {
    let value = 1;

    for (let current: Element | null = element; current; current = current.parentElement)
      value *= Number(getComputedStyle(current).opacity);

    return value;
  };

  const labels = [...document.querySelectorAll("text")].filter((text) => opacity(text) > 0.99);

  return {
    text: labels.map((text) => text.textContent),
    clipped: labels.flatMap((text) => {
      const box = text.getBoundingClientRect();

      return box.x < 0 || box.y < 0 || box.right > 640 || box.bottom > 420
        ? [text.textContent]
        : [];
    }),
    items: [...document.querySelectorAll("g[data-arrival]")].map((item) => {
      const box = item.getBoundingClientRect();

      return { x: box.x + box.width / 2, y: box.y + box.height / 2, opacity: opacity(item) };
    }),
  };
};

describe("portable PR walkthrough starter", () => {
  test("is a self-contained, finite SVG with a final reduced-motion frame", () => {
    expect(validateSvg(svg).errors).toEqual([]);
    expect(svg).toContain('width="640" height="420"');
    expect(svg).toContain("prefers-color-scheme:light");
    expect(svg).toContain("prefers-reduced-motion:reduce");
    expect(svg).not.toMatch(
      /<script\b|<foreignObject\b|<image\b|@import|@font-face|(?:href|src)=["']https?:/,
    );
    expect(svg).not.toContain("infinite");
  });

  test("the installed copy builds outside the checkout with only svjeez", () => {
    const dir = mkdtempSync(join(tmpdir(), "svjeez-pr-starter-"));

    try {
      expect(cli("skill", "--install", "--dir", dir).exitCode).toBe(0);
      mkdirSync(join(dir, "node_modules"));
      // Resolve this workspace's package exactly as a consumer would, using its source condition.
      symlinkSync(join(import.meta.dir, "../.."), join(dir, "node_modules/svjeez"));
      const output = join(dir, "walkthrough.svg");

      const result = Bun.spawnSync(
        [
          process.execPath,
          "--conditions=@svjeez/source",
          cliPath,
          "svg",
          join(dir, "svjeez/examples/pr-walkthrough.tsx"),
          "--out",
          output,
        ],
        { cwd: dir },
      );

      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      expect(validateSvg(readFileSync(output, "utf8")).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.if(browser)(
      `${colorScheme}: context, moving check, unique outcome and endpoint hold`,
      async () => {
        const scene = await openScene(svg, { colorScheme });

        try {
          expect(scene.duration).toBe(17);
          await scene.capture(0);
          const initial = await scene.evaluate(picture, undefined);
          expect(initial.text).toContain("1 · Context");
          expect(initial.text).not.toContain("Remember IDs");
          expect(initial.items.map((item) => item.x)).toEqual([84, 84, 84]);
          expect(initial.clipped).toEqual([]);

          await scene.capture(4.9);
          const moving = await scene.evaluate(picture, undefined);
          expect(moving.text).toContain("2 · Change");
          expect(moving.items[0]!.x).toBeGreaterThan(84);
          expect(moving.items[0]!.x).toBeLessThan(320);

          await scene.capture(6.9);
          const checking = await scene.evaluate(picture, undefined);
          expect(checking.text).toContain("A seen");
          expect(checking.items[1]!.x).toBeCloseTo(320, 0);
          expect(checking.items[1]!.opacity).toBe(1);

          for (const time of [11.5, 17, 20]) {
            await scene.capture(time);
            const final = await scene.evaluate(picture, undefined);
            expect(final.text).toContain("3 · Outcome");
            expect(final.text).toContain("A already seen → skip");
            expect(final.text).toContain("B seen");
            expect(final.items[0]!.x).toBeCloseTo(550, 0);
            expect(final.items[1]!.opacity).toBe(0);
            expect(final.items[2]!.x).toBeCloseTo(550, 0);
            expect(final.items.map((item) => item.opacity)).toEqual([1, 0, 1]);
            expect(final.clipped).toEqual([]);
          }
        } finally {
          await scene.close();
        }
      },
      30000,
    );
  }

  test.if(browser)(
    "native reduced-motion images hold the outcome in both schemes",
    async () => {
      const review = await renderReview(svg, { times: [0, 17, 20] });
      expect(review.reducedMotion).toBe("declared");

      for (const scheme of ["light", "dark"] as const) {
        const images = review[scheme];
        expect(same(images.reducedMotionPng, images.frames[0]!.png)).toBe(false);
        expect(same(images.reducedMotionPng, images.frames[1]!.png)).toBe(true);
        expect(same(images.reducedMotionPng, images.frames[2]!.png)).toBe(true);
      }
    },
    30000,
  );
});
