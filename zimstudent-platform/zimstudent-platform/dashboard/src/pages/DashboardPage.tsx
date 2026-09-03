import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { KpiCard } from "../components/KpiCard";
import type { RiskLevel, DecisionValue } from "../lib/types";

interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  atRiskCount: number;
  pendingDecisions: number;
  docsProcessedToday: number;
  riskBreakdown: Record<RiskLevel, number>;
  latestTerm: string | null;
  termBreakdown: Record<DecisionValue, number>;
}

const RISK_ORDER: RiskLevel[] = ["critical", "high", "medium", "low", "none"];
const DECISION_ORDER: DecisionValue[] = ["approve", "conditional", "reject", "pending"];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);

    const [{ count: totalStudents }, { count: activeStudents }, { data: riskRows }] = await Promise.all([
      supabase.from("student_profiles").select("*", { count: "exact", head: true }),
      supabase.from("student_profiles").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("student_profiles").select("risk_level").eq("status", "active"),
    ]);

    const riskBreakdown = RISK_ORDER.reduce(
      (acc, level) => ({ ...acc, [level]: 0 }),
      {} as Record<RiskLevel, number>,
    );
    (riskRows ?? []).forEach((row) => {
      const level = row.risk_level as RiskLevel;
      riskBreakdown[level] = (riskBreakdown[level] ?? 0) + 1;
    });
    const atRiskCount = riskBreakdown.medium + riskBreakdown.high + riskBreakdown.critical;

    const { count: pendingDecisions } = await supabase
      .from("stipend_decisions")
      .select("*", { count: "exact", head: true })
      .eq("human_decision", "pending");

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { count: docsProcessedToday } = await supabase
      .from("document_records")
      .select("*", { count: "exact", head: true })
      .gte("processed_at", startOfToday.toISOString());

    const { data: latestTermRow } = await supabase
      .from("stipend_decisions")
      .select("term")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let termBreakdown = DECISION_ORDER.reduce(
      (acc, d) => ({ ...acc, [d]: 0 }),
      {} as Record<DecisionValue, number>,
    );

    if (latestTermRow?.term) {
      const { data: termRows } = await supabase
        .from("stipend_decisions")
        .select("human_decision")
        .eq("term", latestTermRow.term);
      (termRows ?? []).forEach((row) => {
        const d = row.human_decision as DecisionValue;
        termBreakdown[d] = (termBreakdown[d] ?? 0) + 1;
      });
    }

    setStats({
      totalStudents: totalStudents ?? 0,
      activeStudents: activeStudents ?? 0,
      atRiskCount,
      pendingDecisions: pendingDecisions ?? 0,
      docsProcessedToday: docsProcessedToday ?? 0,
      riskBreakdown,
      latestTerm: latestTermRow?.term ?? null,
      termBreakdown,
    });
    setLoading(false);
  }

  if (loading || !stats) {
    return <p className="text-slate-muted">Loading the registry…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Command Centre</p>
        <h2 className="mt-1 font-display text-2xl">Overview</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Total students" value={stats.totalStudents} />
        <KpiCard label="Active" value={stats.activeStudents} />
        <KpiCard label="At risk" value={stats.atRiskCount} tone={stats.atRiskCount > 0 ? "warning" : "default"} />
        <KpiCard
          label="Pending decisions"
          value={stats.pendingDecisions}
          tone={stats.pendingDecisions > 0 ? "warning" : "default"}
        />
        <KpiCard label="Docs processed today" value={stats.docsProcessedToday} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarPanel
          title="Risk breakdown"
          subtitle="Active students, by current risk level"
          data={RISK_ORDER.map((level) => ({ label: level, value: stats.riskBreakdown[level] }))}
          colorFor={(label) =>
            label === "critical" || label === "high"
              ? "bg-status-danger"
              : label === "medium"
                ? "bg-status-warning"
                : label === "low"
                  ? "bg-status-success"
                  : "bg-paper-line"
          }
        />
        <BarPanel
          title={stats.latestTerm ? `Stipend status — ${stats.latestTerm}` : "Stipend status"}
          subtitle="Most recent term on file"
          data={DECISION_ORDER.map((d) => ({ label: d, value: stats.termBreakdown[d] }))}
          colorFor={(label) =>
            label === "approve"
              ? "bg-status-success"
              : label === "conditional"
                ? "bg-status-warning"
                : label === "reject"
                  ? "bg-status-danger"
                  : "bg-slate-muted"
          }
        />
      </div>
    </div>
  );
}

function BarPanel({
  title,
  subtitle,
  data,
  colorFor,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: number }[];
  colorFor: (label: string) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="ledger-card p-6">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mb-4 text-xs text-slate-muted">{subtitle}</p>
      <div className="space-y-3">
        {data.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 capitalize text-slate-muted">{label}</span>
            <div className="h-2.5 flex-1 rounded-full bg-paper-line">
              <div
                className={`h-2.5 rounded-full ${colorFor(label)}`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-xs">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
