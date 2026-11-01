import { def, motion, render } from "svjeez";

const css = `:root{--ink:#246}@media(prefers-color-scheme:dark){:root{--ink:#fc8}}
svg:has(> style:last-child) .witness{fill:#ff0000}`;

export const reviewScene = (reducedMotion: { at: number } | false = { at: 1.5 }) =>
  render(
    {
      width: 40,
      height: 20,
      duration: 2,
      title: "Review",
      // An inline SVG is not the document root; image capture must not paint this trap color.
      css: `${css}\nsvg:not(:root){--ink:#ff00ff!important}`,
      reducedMotion,
    },
    <>
      <rect
        width={20}
        height={20}
        fill="var(--ink)"
        animation={motion({ opacity: 0.25 }).at(1).set({ opacity: 0.75 })}
      />
      <rect
        x={20}
        width={20}
        height={20}
        filter={def.filter(
          { filterUnits: "userSpaceOnUse", x: 20, y: 0, width: 20, height: 20 },
          <feFlood
            floodColor="#ff0000"
            animation={motion({ floodColor: "#ff0000" }).at(1).set({ floodColor: "#0000ff" })}
          />,
        )}
      />
      <rect class="witness" x={35} y={15} width={5} height={5} fill="#008000" />
    </>,
  );

/** The known drawing, not an animation paused by the code under test. */
export const reviewDrawn = (time: number, frozenCopy = true) =>
  render(
    { width: 40, height: 20, duration: 2, title: "Known frame", css },
    <>
      <rect width={20} height={20} fill="var(--ink)" opacity={time < 1 ? 0.25 : 0.75} />
      <rect
        x={20}
        width={20}
        height={20}
        filter={def.filter(
          { filterUnits: "userSpaceOnUse", x: 20, y: 0, width: 20, height: 20 },
          <feFlood floodColor={time < 1 ? "#ff0000" : "#0000ff"} />,
        )}
      />
      <rect x={35} y={15} width={5} height={5} fill={frozenCopy ? "#ff0000" : "#008000"} />
    </>,
  );
