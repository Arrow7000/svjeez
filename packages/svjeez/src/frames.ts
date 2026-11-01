import type { Seconds } from "./motion";
import { loopLength, seek } from "./page";
import { restyle } from "./restyle";
import { systemColorScheme } from "./scheme";
import { validateSvg } from "./validate";

export type ColorScheme = "light" | "dark";

/** When to capture: exact playback times, or `count` frames spread evenly over one loop. */
export type FrameTimes =
  | { readonly times: readonly Seconds[]; readonly count?: never }
  | { readonly count: number; readonly times?: never };

export interface SceneOptions {
  /** Device pixel ratio. Default 1. */
  readonly scale?: number;
  /** Which side of `prefers-color-scheme` to render. Default "system", this machine's appearance setting. */
  readonly colorScheme?: ColorScheme | "system";
  /** CSS background behind the SVG. Default `Canvas`, the scheme's page color. Pass "transparent" for alpha. */
  readonly background?: string;
  /** A Chromium or Chrome binary to use instead of Playwright's own. */
  readonly executablePath?: string;
}

export type FrameOptions = FrameTimes &
  SceneOptions & {
    /** Also lay the frames out on one labelled contact sheet. */
    readonly sheet?: boolean | { readonly columns?: number };
  };

/** An SVG open in headless Chromium, paused, ready to capture at any playback time. Close it when done. */
export interface Scene {
  /** The SVG's size in CSS pixels. Captures are `scale` times larger. */
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  /** The longest animation in the SVG, in playback seconds: one loop of the scene. */
  readonly duration: Seconds;
  /** The scheme the scene renders in, after resolving "system". */
  readonly colorScheme: ColorScheme;
  /** Seek every animation to `time` and return a PNG of the SVG. */
  capture(time: Seconds): Promise<Uint8Array>;
  /** Run `fn` in the page. It is serialized, so it can use only `arg` and the page's globals. */
  evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  /** Load a classic script file into the page. */
  addScript(path: string): Promise<void>;
  close(): Promise<void>;
}

export interface Frame {
  readonly time: Seconds;
  readonly png: Uint8Array;
}

export interface Frames {
  /** The scheme the frames were rendered in, after resolving "system". */
  readonly colorScheme: ColorScheme;
  /** The longest animation in the SVG, in playback seconds: one loop of the scene. */
  readonly duration: Seconds;
  readonly frames: readonly Frame[];
  readonly sheet?: Uint8Array;
}

/** A review always captures both schemes as images and includes labelled sheets. */
export type ReviewOptions = FrameTimes &
  Pick<SceneOptions, "scale" | "executablePath"> & {
    /** Contact-sheet columns. Default 4. */
    readonly columns?: number;
  };

export interface ReviewImages {
  readonly frames: readonly Frame[];
  readonly sheet: Uint8Array;
  /** The unmodified SVG as an image in a browser launched with reduced motion, not a forced still copy. */
  readonly reducedMotionPng: Uint8Array;
}

/** Local review evidence, not a pixel-quality or accessibility verdict. No files are written. */
export interface Review {
  /** The input, byte for byte when encoded as UTF-8. */
  readonly svg: string;
  /** A separate, explicitly forced still from restyle(svg, { still: true }). */
  readonly still: string;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly duration: Seconds;
  /** Whether a reduced-motion media query was found, not whether it is correct. */
  readonly reducedMotion: "declared" | "not-declared";
  readonly warnings: readonly string[];
  readonly light: ReviewImages;
  readonly dark: ReviewImages;
}

const launch = async (caller: string, executablePath?: string, reducedMotion = false) => {
  const { chromium } = await import("playwright-core").catch(() => {
    throw new Error(
      `${caller} needs playwright-core. Install it with \`npm i -D playwright-core\`, then \`npx playwright-core install chromium-headless-shell\`.`,
    );
  });

  // Context emulation alone does not propagate into SVG images in Chromium (R-373).
  const args = reducedMotion ? ["--force-prefers-reduced-motion"] : undefined;

  try {
    return await chromium.launch({ executablePath, args });
  } catch (error) {
    if (executablePath) throw error;

    return chromium.launch({ channel: "chrome", args }).catch(() => {
      throw new Error(
        `No Chromium to render with. Run \`npx playwright-core install chromium-headless-shell\`, or pass executablePath.\n${error instanceof Error ? error.message : error}`,
      );
    });
  }
};

const size = (caller: string, svg: string) => {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const width = parseFloat(/\swidth="([\d.]+)"/.exec(root)?.[1] ?? "");
  const height = parseFloat(/\sheight="([\d.]+)"/.exec(root)?.[1] ?? "");

  if (!(width > 0 && height > 0))
    throw new Error(
      `${caller} needs an <svg> root with numeric width and height, got ${width} by ${height}.`,
    );

  return { width, height };
};

// Chromium cannot capture past 16384 device pixels on a side, so a big sheet renders at a lower scale.
const MAX_CAPTURE = 16000;
const GAP = 12;
const CAPTION = 20;

const label = (time: Seconds): string => `${Number(time.toFixed(3))}s`;

const sheetHtml = (
  frames: readonly Frame[],
  width: number,
  columns: number,
): string => `<!doctype html>
<style>
  :root { color-scheme: light dark; background: Canvas; font: 12px ui-monospace, Menlo, monospace }
  body { margin: 0; padding: ${GAP}px; display: grid; grid-template-columns: repeat(${columns}, ${width}px); gap: ${GAP}px; width: max-content }
  figure { margin: 0 } img { display: block; width: ${width}px; outline: 1px solid GrayText } figcaption { height: ${CAPTION - 4}px; padding-top: 4px }
</style>
${frames.map((frame) => `<figure><img src="data:image/png;base64,${Buffer.from(frame.png).toString("base64")}"><figcaption>t = ${label(frame.time)}</figcaption></figure>`).join("\n")}`;

const isSheetOptions = (sheet: FrameOptions["sheet"]): sheet is { readonly columns?: number } =>
  typeof sheet === "object";

type Browser = Awaited<ReturnType<typeof launch>>;

type Page = Awaited<ReturnType<Browser["newPage"]>>;

type Stage = Pick<Scene, "width" | "height" | "scale" | "colorScheme"> & {
  readonly background: string;
};

/** Validates what every caller shares, before any browser starts, so a bad option fails fast. */
const resolve = (caller: string, svg: string, options: SceneOptions): Stage => {
  const { width, height } = size(caller, svg);
  const scale = options.scale ?? 1;

  if (!(scale > 0 && Number.isFinite(scale)))
    throw new Error(`${caller} needs a positive, finite scale, got ${scale}.`);

  const colorScheme =
    !options.colorScheme || options.colorScheme === "system"
      ? systemColorScheme()
      : options.colorScheme;

  if (colorScheme !== "light" && colorScheme !== "dark")
    throw new Error(`${caller} needs a colorScheme of system, light or dark, got ${colorScheme}.`);

  return {
    width,
    height,
    scale,
    colorScheme,
    background: options.background ?? "Canvas",
  };
};

// WebCodecs, which @svjeez/video encodes with, exists only in a secure context, and about:blank is not one.
const ORIGIN = "https://svjeez.local/";

/** Review pages are self-contained. Abort and report requests instead of silently going online. */
const localPage = async (page: Page, html: string): Promise<() => void> => {
  const blocked: string[] = [];
  await page.route("**/*", (route) => {
    if (route.request().url() === ORIGIN)
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });

    blocked.push(route.request().url());

    return route.abort();
  });
  await page.goto(ORIGIN);

  return () => {
    if (blocked.length > 0)
      throw new Error(
        `renderReview() blocked external request: ${blocked.join(", ")}. Embed resources as data URIs.`,
      );
  };
};

const stage = async (
  browser: Browser,
  svg: string,
  { width, height, scale, colorScheme, background }: Stage,
  offline = false,
): Promise<Omit<Scene, "close">> => {
  const page = await browser.newPage({
    viewport: { width: Math.ceil(width), height: Math.ceil(height) },
    deviceScaleFactor: scale,
    colorScheme,
    reducedMotion: "no-preference",
    javaScriptEnabled: offline ? false : undefined,
    serviceWorkers: offline ? "block" : undefined,
  });

  const html = `<!doctype html><style>:root{color-scheme:${colorScheme}}body{margin:0}#stage{display:inline-block;line-height:0;background:${background}}</style><div id="stage">${svg}</div>`;

  const checkRequests = offline ? await localPage(page, html) : undefined;

  if (!offline) {
    await page.route(ORIGIN, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
    );
    await page.goto(ORIGIN);
  }

  await page.evaluate(() => document.fonts.ready);
  checkRequests?.();
  const duration = await page.evaluate(loopLength, undefined);
  const locator = page.locator("#stage");

  return {
    width,
    height,
    scale,
    colorScheme,
    duration,
    capture: async (time) => {
      await page.evaluate(seek, time);

      return new Uint8Array(
        await locator.screenshot({ animations: "allow", omitBackground: true }),
      );
    },
    // SAFETY: Playwright types the argument as Unboxed<A>, which is A itself for the plain data a Scene passes.
    evaluate: <A, R>(fn: (arg: A) => R | Promise<R>, arg: A) =>
      page.evaluate<R, A>(fn as Parameters<typeof page.evaluate<R, A>>[0], arg),
    addScript: async (path) => {
      await page.addScriptTag({ path });
    },
  };
};

const contactSheet = async (
  browser: Browser,
  frames: readonly Frame[],
  { width, height, scale, colorScheme }: Stage,
  columns = 4,
): Promise<Uint8Array> => {
  const across = Math.min(columns, frames.length);

  const sheetSize = Math.max(
    across * (width + GAP) + GAP,
    Math.ceil(frames.length / across) * (height + GAP + CAPTION) + GAP,
  );

  const page = await browser.newPage({
    viewport: { width: 1, height: 1 },
    deviceScaleFactor: Math.min(scale, MAX_CAPTURE / sheetSize),
    colorScheme,
  });

  try {
    await page.setContent(sheetHtml(frames, width, across));

    return new Uint8Array(await page.locator("body").screenshot());
  } finally {
    await page.close();
  }
};

/** An image is decoded anew for every frozen copy; its inaccessible SVG document is never seeked. */
const imageStage = async (
  browser: Browser,
  { width, height, scale, colorScheme, background }: Stage,
  reducedMotion: boolean,
) => {
  const page = await browser.newPage({
    viewport: { width: Math.ceil(width), height: Math.ceil(height) },
    deviceScaleFactor: scale,
    colorScheme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });

  try {
    const checkRequests = await localPage(
      page,
      `<!doctype html><style>:root{color-scheme:${colorScheme}}body{margin:0}#stage{display:inline-block;line-height:0;background:${background}}img{display:block}</style><div id="stage"><img width="${width}" height="${height}"></div>`,
    );

    return {
      capture: async (svg: string): Promise<Uint8Array> => {
        const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await page.evaluate(async (src) => {
          const image = document.querySelector("img")!;
          image.src = src;
          await image.decode();
          // A paused SMIL copy ends after 1ms. Let that interval finish before the screenshot (R-372).
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        }, src);
        checkRequests();

        return new Uint8Array(
          await page.locator("#stage").screenshot({ animations: "allow", omitBackground: true }),
        );
      },
      close: () => page.close(),
    };
  } catch (error) {
    await page.close();
    throw error;
  }
};

/**
 * Open an SVG in headless Chromium, paused at its start, for capturing frames one at a time.
 * Needs `playwright-core` and a Chromium build. `caller` names the function errors report.
 */
export const openScene = async (
  svg: string,
  options: SceneOptions = {},
  caller = "openScene()",
): Promise<Scene> => {
  const settings = resolve(caller, svg, options);
  const browser = await launch(caller, options.executablePath);

  try {
    return { ...(await stage(browser, svg, settings)), close: () => browser.close() };
  } catch (error) {
    await browser.close();
    throw error;
  }
};

/** Rasterize an SVG at chosen playback times in headless Chromium. Needs `playwright-core` and a Chromium build. */
export const renderFrames = async (svg: string, options: FrameOptions): Promise<Frames> => {
  const settings = resolve("renderFrames()", svg, options);

  if (options.times !== undefined) {
    for (const time of options.times)
      if (!(Number.isFinite(time) && time >= 0))
        throw new Error(`renderFrames() needs finite, non-negative times, got ${time}.`);
  } else if (!(Number.isInteger(options.count) && options.count > 0)) {
    throw new Error(`renderFrames() needs a positive whole count, got ${options.count}.`);
  }

  const columns = isSheetOptions(options.sheet) ? options.sheet.columns : undefined;

  if (columns !== undefined && !(Number.isInteger(columns) && columns > 0))
    throw new Error(
      `renderFrames() needs a positive whole number of sheet columns, got ${columns}.`,
    );
  const browser = await launch("renderFrames()", options.executablePath);

  try {
    const { duration, colorScheme, capture } = await stage(browser, svg, settings);

    const times =
      options.times ??
      Array.from({ length: options.count }, (_, i) => (i * duration) / options.count);

    const frames: Frame[] = [];

    for (const time of times) frames.push({ time, png: await capture(time) });

    if (!options.sheet) return { duration, colorScheme, frames };
    const sheet = await contactSheet(browser, frames, settings, columns);

    return { duration, colorScheme, frames, sheet };
  } finally {
    await browser.close();
  }
};

/**
 * R-372/R-373: collect an original, a forced still, exact image-context frames and sheets in both
 * schemes, and native reduced-motion image previews. Needs Playwright and Chromium; never writes files
 * or downloads resources. Times are playback seconds, as in renderFrames().
 */
export const renderReview = async (svg: string, options: ReviewOptions): Promise<Review> => {
  const caller = "renderReview()";
  const validation = validateSvg(svg);

  if (validation.errors.length > 0)
    throw new Error(
      `${caller} needs valid SVG:\n${validation.errors.map((error) => `  - ${error}`).join("\n")}`,
    );
  const settings = resolve(caller, svg, { ...options, colorScheme: "light" });

  if (options.times !== undefined && options.count !== undefined)
    throw new Error(`${caller} needs times or count, not both.`);

  if (options.times !== undefined) {
    if (options.times.length === 0) throw new Error(`${caller} needs at least one time.`);

    for (const time of options.times)
      if (!(Number.isFinite(time) && time >= 0))
        throw new Error(`${caller} needs finite, non-negative times, got ${time}.`);
  } else if (!(Number.isInteger(options.count) && options.count > 0)) {
    throw new Error(`${caller} needs a positive whole count, got ${options.count}.`);
  }

  if (options.columns !== undefined && !(Number.isInteger(options.columns) && options.columns > 0))
    throw new Error(
      `${caller} needs a positive whole number of sheet columns, got ${options.columns}.`,
    );

  const reducedMotion = /@media[^{}]*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(svg)
    ? "declared"
    : "not-declared";

  const warnings = [...validation.warnings];

  if (reducedMotion === "not-declared")
    warnings.push(
      "No reduced-motion rule detected (including scenes rendered with reducedMotion: false). Native previews use the original SVG, which may still animate.",
    );

  const browser = await launch(caller, options.executablePath);

  let duration: Seconds;
  let light: Omit<ReviewImages, "reducedMotionPng">;
  let dark: Omit<ReviewImages, "reducedMotionPng">;

  try {
    // Read the original inline timeline once. An <img> exposes no animation timeline to seek or measure.
    duration = (await stage(browser, svg, settings, true)).duration;

    const times =
      options.times ??
      Array.from({ length: options.count }, (_, i) => (i * duration) / options.count);

    const frozen = times.map((time) => restyle(svg, { at: time, paused: true }));

    const images = async (colorScheme: ColorScheme) => {
      const scene = await imageStage(browser, { ...settings, colorScheme }, false);

      try {
        const frames: Frame[] = [];

        for (const [i, time] of times.entries())
          frames.push({ time, png: await scene.capture(frozen[i]!) });

        return {
          frames,
          sheet: await contactSheet(browser, frames, { ...settings, colorScheme }, options.columns),
        };
      } finally {
        await scene.close();
      }
    };

    light = await images("light");
    dark = await images("dark");
  } finally {
    await browser.close();
  }

  const reducedBrowser = await launch(caller, options.executablePath, true);

  try {
    const native = async (colorScheme: ColorScheme) => {
      const scene = await imageStage(reducedBrowser, { ...settings, colorScheme }, true);

      try {
        return await scene.capture(svg);
      } finally {
        await scene.close();
      }
    };

    return {
      svg,
      still: restyle(svg, { still: true }),
      width: settings.width,
      height: settings.height,
      scale: settings.scale,
      duration,
      reducedMotion,
      warnings,
      light: { ...light, reducedMotionPng: await native("light") },
      dark: { ...dark, reducedMotionPng: await native("dark") },
    };
  } finally {
    await reducedBrowser.close();
  }
};
