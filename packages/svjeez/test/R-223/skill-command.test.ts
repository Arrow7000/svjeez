import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, cliPath } from "../helpers/cli";

const skill = readFileSync(join(import.meta.dir, "../../skills/svjeez/SKILL.md"), "utf8");

test("svjeez skill prints the skill", () => {
  expect(cli("skill").stdout.toString()).toBe(skill);
});

test("svjeez skill --install defaults to shared .agents/skills without creating .claude", () => {
  const dir = mkdtempSync(join(tmpdir(), "svjeez-skill-"));

  try {
    const result = Bun.spawnSync([process.execPath, cliPath, "skill", "--install"], { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(".agents/skills/svjeez");
    expect(readFileSync(join(dir, ".agents/skills/svjeez/SKILL.md"), "utf8")).toBe(skill);
    expect(existsSync(join(dir, ".claude"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("svjeez skill --install --dir supports client-specific paths, copies the complete skill, and can run again", () => {
  const dir = mkdtempSync(join(tmpdir(), "svjeez-skill-"));
  const target = join(dir, ".claude/skills/svjeez");

  try {
    for (let run = 0; run < 2; run++) {
      const result = Bun.spawnSync(
        [process.execPath, cliPath, "skill", "--install", "--dir", ".claude/skills"],
        { cwd: dir },
      );

      expect(result.exitCode).toBe(0);
    }

    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe(skill);
    expect(existsSync(join(dir, ".agents"))).toBe(false);

    for (const sub of ["examples", "references"]) {
      const shipped = readdirSync(join(import.meta.dir, "../../skills/svjeez", sub)).sort();
      expect(shipped.length).toBeGreaterThan(0);
      expect(readdirSync(join(target, sub)).sort()).toEqual(shipped);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
