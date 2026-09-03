import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import type { StaffUser } from "./types";

interface AuthState {
  session: Session | null;
  staff: StaffUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  staff: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadStaff(data.session.user.id);
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) void loadStaff(newSession.user.id);
      else {
        setStaff(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadStaff(authUserId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_users")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load staff record:", error.message);
    }
    setStaff(data ?? null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Wrap protected routes with this. Redirects to /login if not authenticated,
 * and shows a plain notice if the account has no linked, active staff_users row. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, staff, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-muted">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!staff) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="font-display text-lg">No staff record is linked to this account.</p>
        <p className="text-sm text-slate-muted">
          Ask an admin to link your login in <code>staff_users</code> before you can access the Command Centre.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
