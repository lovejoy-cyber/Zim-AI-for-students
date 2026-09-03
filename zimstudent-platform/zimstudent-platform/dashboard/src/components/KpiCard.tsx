export function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-status-danger" : tone === "warning" ? "text-status-warning" : "text-slate-text";

  return (
    <div className="ledger-card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-display text-3xl ${toneClass}`}>{value}</p>
    </div>
  );
}
