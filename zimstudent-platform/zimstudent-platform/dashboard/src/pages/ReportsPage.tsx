import { useState } from "react";
import { generateReport } from "../lib/api";

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsPage() {
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [reportType, setReportType] = useState<"full" | "stipend_only" | "welfare_only">("full");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setMarkdown(null);
    try {
      const { report_markdown } = await generateReport({
        period_start: periodStart,
        period_end: periodEnd,
        report_type: reportType,
      });
      setMarkdown(report_markdown);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zimstudent-report-${periodStart}-to-${periodEnd}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Leadership briefing</p>
        <h2 className="mt-1 font-display text-2xl">Reports</h2>
      </div>

      <div className="ledger-card flex flex-wrap items-end gap-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted">From</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-seal border border-paper-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted">To</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-seal border border-paper-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-muted">Scope</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as typeof reportType)}
            className="rounded-seal border border-paper-line px-3 py-2 text-sm"
          >
            <option value="full">Full report</option>
            <option value="stipend_only">Stipend activity only</option>
            <option value="welfare_only">Welfare only</option>
          </select>
        </div>
        <button
          onClick={() => void handleGenerate()}
          disabled={loading}
          className="rounded-seal bg-ink px-5 py-2 text-sm font-medium text-white hover:bg-ink-light disabled:opacity-60"
        >
          {loading ? "Drafting…" : "Generate report"}
        </button>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      {markdown && (
        <div className="ledger-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Draft — review before sharing</p>
            <button onClick={handleDownload} className="text-sm font-medium text-petrol underline">
              Download as .md
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{markdown}</pre>
        </div>
      )}
    </div>
  );
}
