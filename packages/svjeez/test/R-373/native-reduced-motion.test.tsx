import { beforeAll, expect, test } from "bun:test";
import { renderFrames, renderReview } from "svjeez/frames";
import { browser } from "../helpers/frames-browser";
import { same } from "../helpers/frames";
import { reviewDrawn, reviewScene } from "../helpers/review";

beforeAll(() => expect(browser).toBe(true));

test("R-373: native image previews honor the browser-level preference and capture the unmodified original", async () => {
  const review = await renderReview(reviewScene(), { times: [0.5] });
  expect(review.reducedMotion).toBe("declared");

  for (const scheme of ["light", "dark"] as const) {
    const expected = await renderFrames(reviewDrawn(1.5, false), {
      times: [0],
      colorScheme: scheme,
    });

    expect(same(review[scheme].reducedMotionPng, expected.frames[0]!.png)).toBe(true);
    expect(same(review[scheme].reducedMotionPng, review[scheme].frames[0]!.png)).toBe(false);
  }
}, 30_000);

test("R-373: a scene with reducedMotion:false is labeled, not claimed compliant", async () => {
  const review = await renderReview(reviewScene(false), { count: 1 });
  expect(review.reducedMotion).toBe("not-declared");
  expect(review.warnings.join("\n")).toContain("reducedMotion: false");
  expect(review.warnings.join("\n")).toContain("may still animate");
}, 30_000);
