import { beforeAll, expect, test } from "bun:test";
import { restyle } from "svjeez";
import { renderFrames, renderReview, type ReviewOptions } from "svjeez/frames";
import { browser } from "../helpers/frames-browser";
import { pngSize, same } from "../helpers/frames";
import { reviewDrawn, reviewScene } from "../helpers/review";

beforeAll(() => expect(browser).toBe(true));

test("R-372: original, still, and exact CSS + SMIL frames are reviewed as images in both schemes", async () => {
  const svg = reviewScene();
  const review = await renderReview(svg, { times: [0.5, 1.5], scale: 2, columns: 1 });
  expect(review.svg).toBe(svg);
  expect(review.still).toBe(restyle(svg, { still: true }));
  expect(review.duration).toBe(2);
  expect(review.width).toBe(40);
  expect(review.height).toBe(20);
  expect(review.scale).toBe(2);

  for (const scheme of ["light", "dark"] as const) {
    const result = review[scheme];
    expect(result.frames.map((frame) => frame.time)).toEqual([0.5, 1.5]);

    for (const frame of result.frames) {
      const expected = await renderFrames(reviewDrawn(frame.time), {
        times: [0],
        scale: 2,
        colorScheme: scheme,
      });

      expect(same(frame.png, expected.frames[0]!.png)).toBe(true);
      expect(pngSize(frame.png)).toEqual({ width: 80, height: 40 });
    }

    expect(pngSize(result.sheet)).toEqual({ width: 128, height: 232 });
  }

  expect(same(review.light.frames[0]!.png, review.dark.frames[0]!.png)).toBe(false);
}, 30_000);

test("R-372: count uses the original inline scene's loop duration", async () => {
  const review = await renderReview(reviewScene(), { count: 4 });
  expect(review.duration).toBe(2);
  expect(review.light.frames.map((frame) => frame.time)).toEqual([0, 0.5, 1, 1.5]);
  expect(review.dark.frames.map((frame) => frame.time)).toEqual([0, 0.5, 1, 1.5]);
}, 30_000);

test("R-372: invalid capture and sheet options fail before Chromium starts", async () => {
  const cases: readonly [unknown, string][] = [
    [{ times: [] }, "at least one time"],
    [{ times: [-1] }, "finite, non-negative times"],
    [{ times: [NaN] }, "finite, non-negative times"],
    [{ times: [Infinity] }, "finite, non-negative times"],
    [{ times: [0], count: 1 }, "times or count, not both"],
    [{}, "positive whole count"],
    [{ count: 0 }, "positive whole count"],
    [{ count: 1.5 }, "positive whole count"],
    [{ count: Infinity }, "positive whole count"],
    [{ count: 1, scale: 0 }, "positive, finite scale"],
    [{ count: 1, scale: NaN }, "positive, finite scale"],
    [{ count: 1, columns: 0 }, "sheet columns"],
    [{ count: 1, columns: 1.5 }, "sheet columns"],
    [{ count: 1, columns: Infinity }, "sheet columns"],
  ];

  for (const [options, error] of cases)
    await expect(
      renderReview(reviewScene(), {
        // SAFETY: Deliberately malformed fixtures bypass types only to exercise the public runtime validation.
        ...(options as ReviewOptions),
        executablePath: "/no-such-browser",
      }),
    ).rejects.toThrow(error);

  await expect(
    renderReview('<svg width="40" height="20"><use href="#missing"/></svg>', {
      count: 1,
      executablePath: "/no-such-browser",
    }),
  ).rejects.toThrow('href="#missing" has no matching id.');
});

test("R-372: even the inline duration probe blocks external requests", async () => {
  let requests = 0;

  const server = Bun.serve({
    port: 0,
    fetch: () => {
      requests++;

      return new Response("rect{fill:red}", { headers: { "content-type": "text/css" } });
    },
  });

  try {
    const svg = reviewScene().replace(
      "<style><![CDATA[",
      `<style><![CDATA[@import url("${server.url}font.css");`,
    );

    await expect(renderReview(svg, { count: 1 })).rejects.toThrow("blocked external request");
    expect(requests).toBe(0);
  } finally {
    await server.stop(true);
  }
}, 30_000);
