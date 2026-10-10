/**
 * KpiRow — responsive grid of KpiCard children
 * 2 cols on phone, up to 5 on desktop
 */
export default function KpiRow({ children, className = '' }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : 1;
  const cols = Math.min(count, 5);

  return (
    <div
      className={`grid gap-4 mb-6 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${Math.min(cols, 2)}, 1fr)`,
        // Responsive via media queries via CSS
      }}
    >
      <style>{`
        @media (min-width: 640px) {
          .kpi-row-inner { grid-template-columns: repeat(${Math.min(cols, 3)}, 1fr) !important; }
        }
        @media (min-width: 1024px) {
          .kpi-row-inner { grid-template-columns: repeat(${cols}, 1fr) !important; }
        }
      `}</style>
      {children}
    </div>
  );
}
