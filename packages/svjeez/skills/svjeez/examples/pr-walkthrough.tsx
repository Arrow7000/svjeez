/** @jsxImportSource svjeez */
/** @jsxRuntime automatic */
import { ease, enter, motion, render } from "svjeez";
import { adaptive, cut, readingTime, shot, systemDark, systemLight, timeline } from "svjeez/extras";

/* ANIMATION STORYBOARD — seconds, not milliseconds
 *   0s  context: arrivals A, A, B explain why repeats matter
 *   4s  change: each item moves through an ID check; the second A stops
 *  11s  outcome: A and B stay stored, with time to read the conclusion
 *  17s  playback ends and holds; reduced motion shows this same outcome
 */
// Edit these facts first. Keep three short IDs; change the diagram for a different mechanism.
const FACTS = {
  title: "Store each ID once",
  ids: ["A", "A", "B"],
  context: "Arrivals can repeat and create duplicate records.",
  change: "Remember each ID before storing the item.",
  outcome: "Each ID is stored once; repeats are skipped.",
};

const TIMING = { change: 7, hold: 2, start: 0.6, step: 1.65, travel: 0.6, check: 0.35, fade: 0.25 };

const tl = timeline({
  context: Math.max(4, Math.ceil(readingTime(FACTS.context))),
  change: TIMING.change,
  outcome: Math.ceil(readingTime(FACTS.outcome)) + TIMING.hold,
});

const FRAME = { width: 640, height: 420 };

const DIAGRAM = {
  incoming: 84,
  check: 320,
  stored: 550,
  firstRow: 196,
  step: 56,
  checkY: 252,
  storedY: 224,
};

const { theme, css } = adaptive({ dark: systemDark, light: systemLight });
const unique = [...new Set(FACTS.ids)];

export default function build(): string {
  return render(
    {
      ...FRAME,
      duration: tl.end,
      loop: false,
      reducedMotion: { at: tl.end },
      title: FACTS.title,
      desc: `Arrivals ${FACTS.ids.join(", ")} pass through an ID check. Repeats stop; ${unique.join(", ")} remain stored once.`,
      css,
    },
    <g fontFamily="system-ui, sans-serif" fontSize={16} fill={theme.base05}>
      <rect width={FRAME.width} height={FRAME.height} fill={theme.base00} />
      <text x={32} y={46} fontSize={28} fontWeight={650}>
        {FACTS.title}
      </text>
      <g animation={cut(tl.context)}>
        <text x={32} y={88} fontWeight={650}>
          1 · Context
        </text>
        <text x={32} y={118}>
          {FACTS.context}
        </text>
      </g>
      <g animation={shot(tl.change, { enter: "fade", exit: "fade", over: TIMING.fade })}>
        <text x={32} y={88} fontWeight={650}>
          2 · Change
        </text>
        <text x={32} y={118}>
          {FACTS.change}
        </text>
      </g>
      {/* Unlike cut/shot, enter keeps the outcome visible at and after tl.end. */}
      <g animation={tl.enter("outcome")}>
        <text x={32} y={88} fontWeight={650}>
          3 · Outcome
        </text>
        <text x={32} y={118}>
          {FACTS.outcome}
        </text>
        <text x={32} y={394}>
          Repeated IDs stop; new IDs continue.
        </text>
      </g>
      <text x={DIAGRAM.incoming} y={158} textAnchor="middle" fontWeight={650}>
        Arrivals
      </text>
      <text x={DIAGRAM.incoming} y={352} textAnchor="middle">
        {FACTS.ids.join(", ")}
      </text>
      <g animation={tl.enter("change")}>
        <text x={DIAGRAM.check} y={158} textAnchor="middle" fontWeight={650}>
          Remember IDs
        </text>
        <text x={DIAGRAM.stored} y={158} textAnchor="middle" fontWeight={650}>
          Store once
        </text>
        <rect
          x={250}
          y={180}
          width={140}
          height={152}
          rx={12}
          fill={theme.base01}
          stroke={theme.base04}
        />
        <path
          d="M130 252H232m-8-6 8 6-8 6M408 252H494m-8-6 8 6-8 6"
          fill="none"
          stroke={theme.base04}
          strokeWidth={2}
        />
      </g>
      {FACTS.ids.map((id, i) => {
        const repeat = FACTS.ids.indexOf(id) < i;
        const slot = unique.indexOf(id);
        const y = DIAGRAM.firstRow + i * DIAGRAM.step;
        const at = tl.change.at + TIMING.start + i * TIMING.step;
        const checked = at + TIMING.travel + TIMING.check;

        const arrival = motion({ x: 0, y: 0, opacity: 1 })
          .at(at)
          .to(
            { x: DIAGRAM.check - DIAGRAM.incoming, y: DIAGRAM.checkY - y },
            TIMING.travel,
            ease.inOut,
          )
          .wait(TIMING.check);

        const destination = repeat
          ? arrival.to({ opacity: 0 }, TIMING.fade)
          : arrival.to(
              {
                x: DIAGRAM.stored - DIAGRAM.incoming,
                y: DIAGRAM.storedY + slot * DIAGRAM.step - y,
              },
              TIMING.travel,
              ease.inOut,
            );

        return (
          <g>
            <g data-arrival={i} animation={destination}>
              <rect
                x={DIAGRAM.incoming - 24}
                y={y - 18}
                width={48}
                height={36}
                rx={8}
                fill={theme.base01}
                stroke={theme.base0D}
                strokeWidth={2}
              />
              <text
                x={DIAGRAM.incoming}
                y={y + 6}
                textAnchor="middle"
                fontSize={20}
                fontWeight={650}
              >
                {id}
              </text>
            </g>
            {!repeat && (
              <text
                x={DIAGRAM.check}
                y={212 + slot * DIAGRAM.step}
                textAnchor="middle"
                animation={enter({ at: checked, over: TIMING.fade })}
              >
                {id} seen
              </text>
            )}
            {repeat && (
              <text
                x={DIAGRAM.check}
                y={366}
                textAnchor="middle"
                animation={enter({ at: checked, over: TIMING.fade })}
              >
                {id} already seen → skip
              </text>
            )}
          </g>
        );
      })}
    </g>,
  );
}
