import type { DecisionValue, RiskLevel, Severity } from "../lib/types";

const decisionStyles: Record<DecisionValue, string> = {
  approve: "bg-status-successBg text-status-success border-status-success/30",
  conditional: "bg-status-warningBg text-status-warning border-status-warning/30",
  reject: "bg-status-dangerBg text-status-danger border-status-danger/30",
  pending: "bg-paper-line/60 text-slate-muted border-paper-line",
};

const decisionLabels: Record<DecisionValue, string> = {
  approve: "Approved",
  conditional: "Conditional",
  reject: "Rejected",
  pending: "Pending",
};

export function DecisionBadge({ value }: { value: DecisionValue }) {
  return <span className={`seal-badge ${decisionStyles[value]}`}>{decisionLabels[value]}</span>;
}

const riskStyles: Record<RiskLevel, string> = {
  none: "bg-paper-line/60 text-slate-muted border-paper-line",
  low: "bg-status-successBg text-status-success border-status-success/30",
  medium: "bg-status-warningBg text-status-warning border-status-warning/30",
  high: "bg-status-dangerBg text-status-danger border-status-danger/30",
  critical: "bg-ink text-white border-ink",
};

const riskLabels: Record<RiskLevel, string> = {
  none: "No risk flags",
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical",
};

export function RiskBadge({ value }: { value: RiskLevel }) {
  return <span className={`seal-badge ${riskStyles[value]}`}>{riskLabels[value]}</span>;
}

const severityStyles: Record<Severity, string> = {
  info: "bg-status-infoBg text-status-info border-status-info/30",
  low: "bg-status-successBg text-status-success border-status-success/30",
  medium: "bg-status-warningBg text-status-warning border-status-warning/30",
  high: "bg-status-dangerBg text-status-danger border-status-danger/30",
  critical: "bg-ink text-white border-ink",
};

export function SeverityBadge({ value }: { value: Severity }) {
  return <span className={`seal-badge ${severityStyles[value]} capitalize`}>{value}</span>;
}

const docStatusStyles: Record<string, string> = {
  processed: "bg-status-successBg text-status-success border-status-success/30",
  needs_review: "bg-status-warningBg text-status-warning border-status-warning/30",
  received: "bg-status-infoBg text-status-info border-status-info/30",
  processing: "bg-status-infoBg text-status-info border-status-info/30",
  rejected: "bg-status-dangerBg text-status-danger border-status-danger/30",
};

export function DocStatusBadge({ value }: { value: string }) {
  const style = docStatusStyles[value] ?? "bg-paper-line/60 text-slate-muted border-paper-line";
  return <span className={`seal-badge ${style}`}>{value.replace(/_/g, " ")}</span>;
}
