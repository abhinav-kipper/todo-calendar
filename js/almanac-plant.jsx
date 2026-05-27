// Plant mascot — a cute lil' guy who grows as you check off todos.
// 5 stages tied to today's completion %, with a face that blinks + wiggles.

(function () {
  const { useState, useEffect, useRef } = React;

  // ---- Face ----------------------------------------------------------------
  function Face({ mood = "happy", x = 0, y = 0, size = 1 }) {
    // mood: "happy" | "wow" | "sleep" | "wiggle" | "party"
    const INK = "#3D2E5C";
    const HIGHLIGHT = "#FDF8EF";
    const BLUSH = "#F4B6C7";
    const [blink, setBlink] = useState(false);
    useEffect(() => {
      const tick = () => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
      };
      const id = setInterval(tick, 2400 + Math.random() * 1600);
      return () => clearInterval(id);
    }, []);

    const eye = (cx) => {
      if (mood === "sleep") {
        return <path d={`M${cx - 4} ${0} q4 -3 8 0`} stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />;
      }
      if (mood === "wow") {
        return <circle cx={cx} cy={0} r={2.2} fill={INK} />;
      }
      if (blink) {
        return <path d={`M${cx - 3.5} 0 H${cx + 3.5}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />;
      }
      return (
        <g>
          <circle cx={cx} cy={0} r={3} fill={INK} />
          <circle cx={cx + 0.9} cy={-1} r={0.9} fill={HIGHLIGHT} />
        </g>
      );
    };

    const mouth = (() => {
      if (mood === "party") return <path d="M-5 6 q5 6 10 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill={BLUSH} />;
      if (mood === "wow") return <ellipse cx="0" cy="6" rx="3" ry="3.4" fill={INK} />;
      if (mood === "sleep") return <path d="M-3 6 h6" stroke={INK} strokeWidth="2" strokeLinecap="round" />;
      return <path d="M-4 5 q4 4 8 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />;
    })();

    return (
      <g transform={`translate(${x} ${y}) scale(${size})`}>
        {/* blush */}
        <circle cx={-7} cy={3} r={2.4} fill={BLUSH} opacity="0.7" />
        <circle cx={7} cy={3} r={2.4} fill={BLUSH} opacity="0.7" />
        {eye(-4)}
        {eye(4)}
        {mouth}
      </g>
    );
  }

  // ---- Plant Stages --------------------------------------------------------
  // Each returns SVG content sized to a 200x200 viewbox.
  // pot lives at the bottom; plant grows upward from y≈140.

  function Pot({ direction }) {
    const potA = "#F4B6C7"; // blush
    const potB = "#D4B5E0"; // orchid
    const fill = direction === "B" ? potB : potA;
    return (
      <g>
        {/* dirt */}
        <ellipse cx="100" cy="158" rx="40" ry="6" fill="#5C3A1E" stroke="#3D2E5C" strokeWidth="2.5" />
        {/* pot body */}
        <path
          d="M62 160 L70 195 Q70 198 73 198 L127 198 Q130 198 130 195 L138 160 Z"
          fill={fill}
          stroke="#3D2E5C"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* pot rim */}
        <rect x="58" y="152" width="84" height="12" rx="3" fill={fill} stroke="#3D2E5C" strokeWidth="2.5" />
        {/* highlight */}
        <path d="M67 165 L72 188" stroke="#FFF8E7" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      </g>
    );
  }

  function Stage0({ direction, mood }) {
    // Seed in soil — just a peek
    return (
      <g>
        <Pot direction={direction} />
        {/* tiny seed peeking */}
        <ellipse cx="100" cy="154" rx="9" ry="6.5" fill="#8B5A2B" stroke="#3D2E5C" strokeWidth="2.5" />
        <Face mood="sleep" x={100} y={152} size={0.55} />
      </g>
    );
  }

  function Stage1({ direction, mood }) {
    // Sprout — tiny stem with two baby leaves
    return (
      <g>
        <Pot direction={direction} />
        <path d="M100 152 V120" stroke="#3D2E5C" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 152 V120" stroke="#7FB28E" strokeWidth="2.2" strokeLinecap="round" />
        {/* leaves */}
        <path d="M100 132 q-12 -6 -16 -16 q10 -2 18 8 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 128 q12 -6 16 -16 q-10 -2 -18 8 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <Face mood={mood} x={100} y={114} size={0.65} />
      </g>
    );
  }

  function Stage2({ direction, mood }) {
    // Leafy stem
    return (
      <g>
        <Pot direction={direction} />
        <path d="M100 152 V80" stroke="#3D2E5C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M100 152 V80" stroke="#7FB28E" strokeWidth="2.6" strokeLinecap="round" />
        {/* lower leaves */}
        <path d="M100 140 q-18 -4 -26 -18 q14 -4 26 10 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 130 q18 -4 26 -18 q-14 -4 -26 10 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        {/* upper leaves */}
        <path d="M100 108 q-14 -6 -20 -18 q12 -3 22 8 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 100 q14 -6 20 -18 q-12 -3 -22 8 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <Face mood={mood} x={100} y={76} size={0.75} />
      </g>
    );
  }

  function Stage3({ direction, mood }) {
    // Bud forming on top
    return (
      <g>
        <Pot direction={direction} />
        <path d="M100 152 V62" stroke="#3D2E5C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M100 152 V62" stroke="#7FB28E" strokeWidth="2.6" strokeLinecap="round" />
        {/* leaves */}
        <path d="M100 138 q-20 -4 -28 -20 q16 -4 28 12 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 126 q20 -4 28 -20 q-16 -4 -28 12 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 104 q-16 -6 -22 -20 q14 -3 24 10 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 92 q16 -6 22 -20 q-14 -3 -24 10 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        {/* bud */}
        <ellipse cx="100" cy="56" rx="16" ry="18" fill="#F7E1A0" stroke="#3D2E5C" strokeWidth="2.5" />
        <path d="M88 56 q12 -8 24 0" stroke="#3D2E5C" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Face mood={mood} x={100} y={56} size={0.9} />
      </g>
    );
  }

  function Stage4({ direction, mood, dancing }) {
    // Full bloom — flower with petals and sparkles
    return (
      <g>
        <Pot direction={direction} />
        <path d="M100 152 V60" stroke="#3D2E5C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M100 152 V60" stroke="#7FB28E" strokeWidth="2.6" strokeLinecap="round" />
        {/* leaves */}
        <path d="M100 140 q-20 -4 -30 -22 q18 -4 30 12 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 124 q22 -4 30 -22 q-18 -4 -30 12 Z" fill="#C3D9A4" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 104 q-18 -6 -24 -22 q16 -3 26 12 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M100 90 q18 -6 24 -22 q-16 -3 -26 12 Z" fill="#B8DCE8" stroke="#3D2E5C" strokeWidth="2.5" strokeLinejoin="round" />
        {/* flower petals */}
        <g className={dancing ? "plant-dance-flower" : ""}>
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i * 72) - 90;
            const rad = (angle * Math.PI) / 180;
            const cx = 100 + Math.cos(rad) * 18;
            const cy = 56 + Math.sin(rad) * 18;
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx={14}
                ry={11}
                fill="#F4B6C7"
                stroke="#3D2E5C"
                strokeWidth="2.5"
                transform={`rotate(${angle + 90} ${cx} ${cy})`}
              />
            );
          })}
          {/* face center */}
          <circle cx="100" cy="56" r="14" fill="#F7E1A0" stroke="#3D2E5C" strokeWidth="2.5" />
          <Face mood={mood} x={100} y={56} size={1} />
        </g>
        {/* sparkles */}
        {dancing && (
          <g className="plant-sparkles">
            <Sparkle x={60} y={40} />
            <Sparkle x={150} y={36} delay="0.2s" />
            <Sparkle x={150} y={92} delay="0.4s" />
            <Sparkle x={48} y={92} delay="0.6s" />
          </g>
        )}
      </g>
    );
  }

  function Sparkle({ x, y, delay = "0s" }) {
    return (
      <g transform={`translate(${x} ${y})`} className="sparkle" style={{ animationDelay: delay }}>
        <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z"
          fill="#F7E1A0" stroke="#3D2E5C" strokeWidth="2" strokeLinejoin="round" />
      </g>
    );
  }

  // ---- The mascot wrapper --------------------------------------------------
  function PlantMascot({ progress = 0, total = 0, done = 0, direction = "A" }) {
    // progress: 0..1
    const stage = total === 0 ? 0
      : progress >= 1 ? 4
      : progress >= 0.66 ? 3
      : progress >= 0.34 ? 2
      : progress > 0 ? 1
      : 0;

    const mood = total === 0 ? "sleep"
      : progress >= 1 ? "party"
      : progress >= 0.5 ? "happy"
      : "happy";

    // Wiggle whenever stage advances or `done` changes upward.
    const [wiggling, setWiggling] = useState(false);
    const prevDone = useRef(done);
    useEffect(() => {
      if (done > prevDone.current) {
        setWiggling(true);
        const t = setTimeout(() => setWiggling(false), 520);
        prevDone.current = done;
        return () => clearTimeout(t);
      }
      prevDone.current = done;
    }, [done]);

    const StageEl = [Stage0, Stage1, Stage2, Stage3, Stage4][stage];
    const dancing = stage === 4;

    return (
      <div className={`plant-mascot ${wiggling ? "wiggle" : ""} ${dancing ? "dancing" : ""}`}>
        <svg viewBox="0 0 200 210" width="100%" height="100%" aria-label="Your plant friend">
          <StageEl direction={direction} mood={mood} dancing={dancing} />
        </svg>
        <div className="plant-label">
          {total === 0 && <>Plant me a task!</>}
          {total > 0 && progress < 1 && <><b>{done}</b>/{total} — keep growing 🌱</>}
          {total > 0 && progress >= 1 && <>FULL BLOOM ✨</>}
        </div>
      </div>
    );
  }

  window.PlantMascot = PlantMascot;
})();
