import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { RiskBadge } from "../components/Badge";
import type { StudentProfile, StudentStatus, RiskLevel } from "../lib/types";

export function StudentDirectoryPage() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => void loadStudents(), 250); // light debounce on typing
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, riskFilter]);

  async function loadStudents() {
    setLoading(true);
    let query = supabase
      .from("student_profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,student_id.ilike.%${search.trim()}%`);
    }
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (riskFilter !== "all") query = query.eq("risk_level", riskFilter);

    const { data, error } = await query;
    if (error) console.error(error);
    setStudents((data as StudentProfile[]) ?? []);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Records</p>
        <h2 className="mt-1 font-display text-2xl">Student Register</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or student ID…"
          className="w-72 rounded-seal border border-paper-line px-3 py-2 text-sm focus:border-petrol"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StudentStatus | "all")}
          className="rounded-seal border border-paper-line px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="graduated">Graduated</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="suspended">Suspended</option>
          <option value="unreachable">Unreachable</option>
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskLevel | "all")}
          className="rounded-seal border border-paper-line px-3 py-2 text-sm"
        >
          <option value="all">All risk levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">No risk flags</option>
        </select>
      </div>

      <div className="ledger-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-line bg-paper text-xs uppercase tracking-wide text-slate-muted">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3">GPA</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-line">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && students.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-muted">
                  No students match these filters.
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.student_id} className="hover:bg-paper">
                <td className="px-4 py-3">
                  <Link to={`/students/${s.student_id}`} className="font-medium text-petrol hover:underline">
                    {s.full_name}
                  </Link>
                  <p className="font-mono text-xs text-slate-muted">{s.student_id}</p>
                </td>
                <td className="px-4 py-3">
                  {s.program} <span className="text-slate-muted">· {s.degree_level}</span>
                </td>
                <td className="px-4 py-3">{s.university ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{s.current_gpa ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{s.status}</td>
                <td className="px-4 py-3">
                  <RiskBadge value={s.risk_level} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
