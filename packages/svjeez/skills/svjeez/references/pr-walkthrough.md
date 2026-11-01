# A small pull-request walkthrough

Use an animation when movement explains a mechanism: an item takes a different route, ownership moves, a repeated event stops at a check. For a static relationship, prefer a small static diagram. Neither replaces the PR's written context, evidence, limitations or review instructions.

## Copy, then edit

`examples/pr-walkthrough.tsx` is a complete, portable starter. It imports only `svjeez` and `svjeez/extras`, uses system fonts, and needs no font downloads, images, sibling modules or network access. Its two JSX pragmas let it work outside the original checkout.

```sh
npx svjeez skill --install
cp .agents/skills/svjeez/examples/pr-walkthrough.tsx walkthrough.tsx
```

The default destination is the agent-neutral `.agents/skills` directory. Clients
with another discovery path can use `--dir`, such as `.claude/skills`; the skill
itself is the same portable `SKILL.md`, references and examples.

Use an available trusted installation and check that it contains this starter.
A source branch can be newer than npm: pushing the branch does not make its new
starter or commands available through `npx`. Work from that trusted checkout or
an installed version containing these features; do not silently install a
prerelease or alter the application's dependencies.

Edit `FACTS` first. The default example is deliberately concrete: arrivals `A, A, B` pass through an ID check; the second `A` stops, while `A` and `B` remain stored. The compact layout is for three short input IDs. For another mechanism, change the labels, routes and conclusion together; do not just rename an unrelated diagram.

The scene is 640 × 420, plays once, and holds its last frame. Default beats are **context 0–4s**, **change 4–11s**, **outcome 11–17s**. Caption edits can lengthen the reading beats through `readingTime`; update inspection times and the storyboard comment when that happens.

```sh
npx svjeez review walkthrough.tsx --times 0,4.9,6.9,8.2,9.5,11.5,17 --out review/
```

First confirm that the available CLI advertises `review`. If it does not, use
the existing `svg` and `frames` commands below, and `restyle(svg, { still: true })`
for a still. Ordinary frames inspect inline SVG; separately check image playback
and native reduced motion before publishing it as an image.

Choose a fresh output directory for each pass. Open the review output and inspect both light and dark sheets, the final still, and the native reduced-motion preview. The review command packages those checks together; it does not decide whether the explanation is true. For individual frames, use:

```sh
npx svjeez frames walkthrough.tsx --times 0,4.9,6.9,8.2,9.5,11.5,17 --color-scheme light --sheet --out review-light/
npx svjeez frames walkthrough.tsx --times 0,4.9,6.9,8.2,9.5,11.5,17 --color-scheme dark --sheet --out review-dark/
```

In an isolated scratch workspace, frames and review need `npm i -D playwright-core`
and `npx playwright-core install chromium-headless-shell`. Under Node, loading
`.tsx` also needs `npm i -D tsx`; under Bun use `bunx --bun svjeez`. Reuse trusted
available dependencies instead of installing them into the application repository
just to illustrate a PR. Ensure the scratch scene can resolve svjeez and its JSX
runtime; the CLI's location alone does not provide that resolution.

## Existing helpers, one shared clock

| Need | Use |
| --- | --- |
| Name context, change and outcome in seconds | `timeline({ context, change, outcome })` |
| Give a caption enough reading time | `readingTime(text)` plus an explicit hold |
| Keep the opening visible immediately, then remove it | `cut(tl.context)` |
| Fade a temporary caption in and out | `shot(tl.change, { enter: "fade", exit: "fade" })` |
| Keep the result after playback ends | `tl.enter("outcome")`, **not** `cut(tl.outcome)` |
| Reveal a remembered ID at a mechanism's event time | `enter({ at, over })` |
| Move the actual item through the check | `motion().at(...).to(...)` |
| Follow the viewer's light/dark setting | `adaptive({ dark: systemDark, light: systemLight })` |
| Show the conclusion without motion | `reducedMotion: { at: tl.end }` with persistent outcome content |
| Play once and preserve the final state | `loop: false` |

Read `references/explainers.md` for these helpers' full contracts. The starter adds no storyboard or card API: its named facts, timing, geometry and three-beat comment are ordinary scene code.

## Tell the mechanism, not a slide deck

- Explain the existing situation **before** naming the change. A reader should understand why repeated arrivals matter without knowing the PR.
- Keep one small diagram on screen. Move the item that changes; do not substitute pages of animated prose for a mechanism.
- Use short, literal labels at 16px or larger. At 640px wide, keep captions to one short line; shorten text rather than shrinking it. Check at the actual embedded size, not only at 2× scale.
- Leave time to read after movement settles. Preserve the result and its explanation at the exact endpoint, after playback, and under reduced motion.
- Inspect the repeated item at the check, not just the initial and final pictures. Verify that a new ID still passes through.
- Treat `A, A, B → A, B` as an illustrative input/output example, not benchmark or production evidence. Cite real tests or measurements separately; invent no speedups, counts or guarantees.
- A PR can use separate small context and change diagrams. Choose animation only where it adds understanding, and keep the written description understandable without playing it.
