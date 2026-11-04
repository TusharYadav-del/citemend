export function SparklineChart({ values, label = "Trend" }: { values: number[]; label?: string }) {
  if (values.length < 2 || values.some(value => !Number.isFinite(value))) return <span className="text-xs text-slate-500">Not enough data for {label.toLowerCase()}.</span>;
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${36 - ((value - min) / range) * 30}`).join(" ");
  return <svg role="img" aria-label={`${label}: ${values.join(", ")}`} viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-28 overflow-visible"><polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" points={points} className="text-emerald-400" /></svg>;
}
