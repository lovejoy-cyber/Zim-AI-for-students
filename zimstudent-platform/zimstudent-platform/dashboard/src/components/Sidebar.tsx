import { NavLink } from "react-router-dom";
import { LayoutGrid, ClipboardList, Users, HeartPulse, FileBarChart } from "lucide-react";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/decisions", label: "Decision Queue", icon: ClipboardList },
  { to: "/students", label: "Student Register", icon: Users },
  { to: "/welfare", label: "Welfare Board", icon: HeartPulse },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

export function Sidebar() {
  const { staff, signOut } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col bg-ink text-white">
      <div className="border-b border-ink-border px-6 py-6">
        <p className="eyebrow text-gold/80">Embassy of Zimbabwe · Algeria</p>
        <h1 className="mt-1 font-display text-xl leading-tight">ZimStudent AI</h1>
        <p className="text-xs text-white/50">Command Centre</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-seal px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-ink-light text-gold" : "text-white/75 hover:bg-ink-light hover:text-white"
              }`
            }
          >
            <Icon size={17} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-border px-6 py-4">
        <p className="text-sm font-medium">{staff?.name}</p>
        <p className="text-xs capitalize text-white/50">{staff?.role.replace("_", " ")}</p>
        <button
          onClick={() => void signOut()}
          className="mt-3 text-xs text-white/60 underline decoration-white/30 underline-offset-2 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
