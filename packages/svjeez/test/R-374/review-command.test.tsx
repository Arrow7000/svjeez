import { beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restyle } from "svjeez";
import { cli } from "../helpers/cli";
import { browser } from "../helpers/frames-browser";
import { reviewScene } from "../helpers/review";

beforeAll(() => expect(browser).toBe(true));

test("R-374: every existing output path is refused before the scene loads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "svjeez-review-"));

  try {
    await mkdir(join(dir, "empty"));
    await writeFile(join(dir, "file"), "user file");
    await symlink(join(dir, "empty"), join(dir, "link"));
    await symlink(join(dir, "missing"), join(dir, "dangling"));

    for (const path of ["empty", "file", "link", "dangling"]) {
      const result = cli("review", join(dir, "absent.svg"), "--out", join(dir, path));
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("already exists");
    }

    expect(await readdir(join(dir, "empty"))).toEqual([]);
    expect(await readFile(join(dir, "file"), "utf8")).toBe("user file");
    expect((await readdir(dir)).sort()).toEqual(["dangling", "empty", "file", "link"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("R-374: CLI writes a complete local bundle and preserves source SVG bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "svjeez-review-"));

  try {
    const file = join(dir, "source.svg");
    const out = join(dir, "review");
    const svg = `<!-- exact input -->\n${reviewScene()}`;
    await writeFile(file, svg);

    const result = cli(
      "review",
      file,
      "--times",
      "0.5,1.5",
      "--scale",
      "2",
      "--columns",
      "1",
      "--out",
      out,
    );

    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect((await readdir(out)).sort()).toEqual([
      "dark",
      "light",
      "review.json",
      "scene.svg",
      "still.svg",
    ]);
    expect(await readFile(join(out, "scene.svg"), "utf8")).toBe(svg);
    expect(await readFile(join(out, "still.svg"), "utf8")).toBe(restyle(svg, { still: true }));

    for (const scheme of ["light", "dark"]) {
      expect((await readdir(join(out, scheme))).sort()).toEqual([
        "frame-00-0_500s.png",
        "frame-01-1_500s.png",
        "reduced-motion.png",
        "sheet.png",
      ]);
    }

    const manifest = JSON.parse(await readFile(join(out, "review.json"), "utf8"));
    expect(manifest.times).toEqual([0.5, 1.5]);
    expect(manifest.context).toBe("img");
    expect(manifest.reducedMotion).toBe("declared");
    expect(manifest.nativeReducedMotionSource).toBe("scene.svg");
    expect(manifest.scale).toBe(2);
    expect(manifest.duration).toBe(2);
    expect(result.stdout.toString()).toContain("not a pixel-quality pass");

    await writeFile(join(out, "keep.txt"), "user file");
    const again = cli("review", file, "--count", "1", "--out", out);
    expect(again.exitCode).toBe(1);
    expect(again.stderr.toString()).toContain("already exists");
    expect(await readFile(join(out, "keep.txt"), "utf8")).toBe("user file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("R-374: module scenes support count and label a missing reduced-motion rule", async () => {
  const dir = await mkdtemp(join(tmpdir(), "svjeez-review-"));

  try {
    const svg = reviewScene(false);
    const file = join(dir, "scene.tsx");
    const out = join(dir, "out");
    await writeFile(file, `export default async () => ${JSON.stringify(svg)};\n`);
    const result = cli("review", file, "--count", "2", "--out", out);
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain("reducedMotion: false");
    expect(result.stdout.toString()).toContain("not-declared");
    expect(await readFile(join(out, "scene.svg"), "utf8")).toBe(svg);
    const manifest = JSON.parse(await readFile(join(out, "review.json"), "utf8"));
    expect(manifest.times).toEqual([0, 1]);
    expect(manifest.reducedMotion).toBe("not-declared");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("R-374: an output created during capture is preserved and staging is cleaned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "svjeez-review-"));

  try {
    const file = join(dir, "scene.tsx");
    const out = join(dir, "out");
    const keep = join(out, "keep.txt");
    await writeFile(
      file,
      `import { mkdir, writeFile } from "node:fs/promises";
await mkdir(${JSON.stringify(out)});
await writeFile(${JSON.stringify(keep)}, "user file");
export default ${JSON.stringify(reviewScene())};\n`,
    );
    const result = cli("review", file, "--count", "1", "--out", out);
    expect(result.exitCode).toBe(1);
    expect(await readFile(keep, "utf8")).toBe("user file");
    expect((await readdir(dir)).sort()).toEqual(["out", "scene.tsx"]);
    expect(await readdir(out)).toEqual(["keep.txt"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("R-374: bad arguments and failed image capture leave no output or staging files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "svjeez-review-"));

  try {
    const file = join(dir, "source.svg");
    await writeFile(file, reviewScene());

    const cases: readonly [readonly string[], string][] = [
      [["--times", ""], "empty entry"],
      [["--times", "0,"], "empty entry"],
      [["--times", "no"], "needs a number"],
      [["--times=-1"], "finite, non-negative times"],
      [["--times", "0", "--count", "1"], "not both"],
      [["--count", "0"], "positive whole number"],
      [["--columns", "0"], "sheet columns"],
      [["--scale", "0"], "positive, finite scale"],
      [["--color-scheme", "light"], "Unknown option"],
      [["extra.svg"], "exactly one"],
    ];

    for (const [args, error] of cases) {
      const result = cli("review", file, ...args, "--out", join(dir, "out"));
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(error);
      expect(await readdir(dir)).toEqual(["source.svg"]);
    }

    await writeFile(file, '<svg width="40" height="20"><use href="#missing"/></svg>');
    const invalid = cli("review", file, "--count", "1", "--out", join(dir, "out"));
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr.toString()).toContain('href="#missing" has no matching id.');
    expect(await readdir(dir)).toEqual(["source.svg"]);

    await writeFile(
      file,
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><g></svg>',
    );
    const failed = cli("review", file, "--count", "1", "--out", join(dir, "out"));
    expect(failed.exitCode).toBe(1);
    expect(await readdir(dir)).toEqual(["source.svg"]);
    expect(cli().stderr.toString()).toContain("svjeez review");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
