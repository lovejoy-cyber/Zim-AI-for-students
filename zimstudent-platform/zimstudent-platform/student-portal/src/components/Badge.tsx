const docStatusStyles: Record<string, string> = {
  processed: "bg-status-successBg text-status-success border-status-success/30",
  needs_review: "bg-status-warningBg text-status-warning border-status-warning/30",
  received: "bg-status-infoBg text-status-info border-status-info/30",
  processing: "bg-status-infoBg text-status-info border-status-info/30",
  rejected: "bg-status-dangerBg text-status-danger border-status-danger/30",
};

export function DocStatusBadge({ value }: { value: string }) {
  const style = docStatusStyles[value] ?? "bg-paper-line/60 text-slate-muted border-paper-line";
  const label = value === "processed" ? "Processed" : value === "needs_review" ? "Under review" : value;
  return <span className={`seal-badge ${style} capitalize`}>{label.replace(/_/g, " ")}</span>;
}

const decisionStyles: Record<string, string> = {
  approve: "bg-status-successBg text-status-success border-status-success/30",
  conditional: "bg-status-warningBg text-status-warning border-status-warning/30",
  reject: "bg-status-dangerBg text-status-danger border-status-danger/30",
  pending: "bg-paper-line/60 text-slate-muted border-paper-line",
};

const decisionLabels: Record<string, string> = {
  approve: "Approved",
  conditional: "Conditional",
  reject: "Rejected",
  pending: "Under review",
};

export function DecisionBadge({ value }: { value: string }) {
  return <span className={`seal-badge ${decisionStyles[value] ?? decisionStyles.pending}`}>{decisionLabels[value] ?? value}</span>;
}
