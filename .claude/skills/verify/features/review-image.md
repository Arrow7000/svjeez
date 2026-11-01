# Review an image

`svjeez review` makes one local review bundle for a scene that will be embedded as an image. It preserves the animated SVG, exports a frozen still, and captures light/dark image-context frame sheets and the original image under native reduced motion. The author still judges whether the explanation is readable and correct.

## Sub-features

- `review-bundle` writes the original SVG and an authored still alongside previews.
- `review-image-frames` captures requested beats inside an `<img>`, not inline SVG.
- `review-schemes` produces both light and dark sheets in one command.
- `review-native-reduction` captures the unmodified SVG with a browser-level reduced-motion preference, rather than mistaking a transformed still for native behavior.
- `review-local-only` performs no upload, PR edit, or release.

## How to get to it (user POV)

- Run `npx svjeez review walkthrough.tsx --out review` in a project with the browser prerequisites installed.
- Copy the shipped `examples/pr-walkthrough.tsx` after `svjeez skill --install` for a portable context → change → outcome starter.
- Pass `--times 0,3,7` to pick beats or `--count 6` to sample the scene.

## Driving it with verify

Use the baseline setup and run directory from the verification map. Run from the repository root, with an absolute output directory outside the checkout.

1. Run `$V cli review "$PWD/packages/svjeez/skills/svjeez/examples/pr-walkthrough.tsx" --count 6 --out "$VERIFY_RUN/evidence/walkthrough"`.
2. Confirm exit 0 and the printed bundle directory. Inspect its `scene.svg`, `still.svg`, `review.json`, and each scheme's `sheet.png`, `frame-NN-<time>s.png` files and `reduced-motion.png`.
3. Open both sheets: the context is understandable first, the mechanism changes in the middle, and the final outcome remains readable. Inspect the reduced-motion previews for the same useful conclusion.
4. Run the command against the written animated SVG in a fresh output directory and confirm that SVG input is also supported without running a scene module.
5. Try conflicting `--times`/`--count`, an invalid time, and a nonempty output directory. Confirm clear failures and that existing output is not overwritten.

## Gotchas

- Ordinary frame rendering seeks inline SVG. Review's frozen image samples do not by themselves prove untouched animation playback; inspect playback when publishing a new animated scene.
- Chromium context-only reduced-motion emulation does not reliably reach SVG image resources. Native previews use a separate browser launch with the reduced-motion preference forced.
- A scene that disables reduced motion does not gain an accessible final frame merely because review completed. Inspect its native preview and the scene's declaration.
- The command renders trusted authored scenes; it is not a safe executor for untrusted TypeScript or a proof of every browser's behavior.
