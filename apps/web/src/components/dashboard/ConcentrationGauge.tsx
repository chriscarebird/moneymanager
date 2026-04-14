import type { PortfolioSnapshot, UberEquity } from '../../lib/api.js';
import {
  uberConcentrationPct,
  concentrationColor,
  formatPct,
  CONCENTRATION_TARGET,
  CONCENTRATION_WARN,
  CONCENTRATION_DANGER,
} from '../../lib/calc.js';

type Props = {
  snapshot: PortfolioSnapshot | null;
  equity: UberEquity[];
  fxRate?: number;
};

/** SVG semi-circle gauge 0–50% range */
function GaugeSvg({ pct, target }: { pct: number; target: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(50, v));
  const toAngle = (v: number) => (clamp(v) / 50) * 180 - 90; // -90° (left) to +90° (right)
  const polar = (angleDeg: number, r: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: 80 + r * Math.cos(rad), y: 80 + r * Math.sin(rad) };
  };
  const arcPath = (from: number, to: number, r: number) => {
    const s = polar(toAngle(from), r);
    const e = polar(toAngle(to), r);
    const large = to - from > 25 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const color = concentrationColor(pct);
  const needleAngle = toAngle(clamp(pct));
  const needleEnd = polar(needleAngle, 52);

  return (
    <svg viewBox="0 0 160 90" className="w-full max-w-[200px] mx-auto">
      {/* Track segments: green 0-20, orange 20-25, red 25-50 */}
      <path
        d={arcPath(0, CONCENTRATION_TARGET, 60)}
        fill="none"
        stroke="#166534"
        strokeWidth={12}
        strokeLinecap="butt"
      />
      <path
        d={arcPath(CONCENTRATION_TARGET, CONCENTRATION_WARN, 60)}
        fill="none"
        stroke="#92400e"
        strokeWidth={12}
        strokeLinecap="butt"
      />
      <path
        d={arcPath(CONCENTRATION_WARN, 50, 60)}
        fill="none"
        stroke="#7f1d1d"
        strokeWidth={12}
        strokeLinecap="butt"
      />
      {/* Value arc */}
      <path
        d={arcPath(0, clamp(pct), 60)}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="butt"
        opacity={0.9}
      />
      {/* Target marker */}
      {(() => {
        const p = polar(toAngle(target), 60);
        const pi = polar(toAngle(target), 48);
        return <line x1={pi.x} y1={pi.y} x2={p.x} y2={p.y} stroke="#94a3b8" strokeWidth={2} />;
      })()}
      {/* Needle */}
      <line
        x1={80}
        y1={80}
        x2={needleEnd.x}
        y2={needleEnd.y}
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={80} cy={80} r={4} fill="white" />
    </svg>
  );
}

export function ConcentrationGauge({ snapshot, equity, fxRate }: Props) {
  const pct = snapshot ? uberConcentrationPct(snapshot, equity, fxRate) : 0;
  const color = concentrationColor(pct);

  const label =
    pct >= CONCENTRATION_DANGER
      ? 'High — consider selling'
      : pct >= CONCENTRATION_WARN
        ? 'Elevated — monitor'
        : 'On target';

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
        Uber Concentration
      </p>
      <GaugeSvg pct={pct} target={CONCENTRATION_TARGET} />
      <div className="text-center mt-1">
        <span className="text-2xl font-bold" style={{ color }}>
          {formatPct(pct)}
        </span>
        <p className="text-xs mt-1" style={{ color }}>
          {label}
        </p>
        <p className="text-slate-600 text-xs mt-0.5">Target ≤{CONCENTRATION_TARGET}%</p>
      </div>
    </div>
  );
}
