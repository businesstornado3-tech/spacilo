import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type UserMode = "renter" | "host";
export type Profile = Tables<"profiles">;

interface AuthContextValue {
  /** True until the initial session + profile load has settled. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Mode currently in use; falls back to renter before the profile loads. */
  mode: UserMode;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  switchMode: (next: UserMode) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Creates the profile row on first authenticated load, using sign-up metadata. */
async function ensureProfile(user: User): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const initialMode: UserMode = meta["initial_mode"] === "host" ? "host" : "renter";
  const firstName = typeof meta["first_name"] === "string" ? meta["first_name"] : "";
  const lastName = typeof meta["last_name"] === "string" ? meta["last_name"] : "";

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      display_name: firstName || null,
      initial_mode: initialMode,
      current_mode: initialMode,
      renter_enabled: initialMode === "renter",
      host_enabled: initialMode === "host",
      marketing_opt_in: meta["marketing_opt_in"] === true,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadProfile = React.useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await ensureProfile(user));
    } catch {
      setProfile(null);
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    // Listener first, so no auth event is missed during the initial fetch.
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        return;
      }
      if (nextSession?.user) {
        void loadProfile(nextSession.user);
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = React.useCallback(async () => {
    await loadProfile(session?.user ?? null);
  }, [loadProfile, session]);

  const updateProfile = React.useCallback(
    async (patch: Partial<Profile>) => {
      if (!session?.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", session.user.id)
        .select("*")
        .single();
      if (error) throw error;
      setProfile(data);
    },
    [session],
  );

  const switchMode = React.useCallback(
    async (next: UserMode) => {
      await updateProfile({
        current_mode: next,
        ...(next === "host" ? { host_enabled: true } : { renter_enabled: true }),
      });
    },
    [updateProfile],
  );

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      mode: (profile?.current_mode as UserMode | undefined) ?? "renter",
      refreshProfile,
      updateProfile,
      switchMode,
      signOut,
    }),
    [loading, session, profile, refreshProfile, updateProfile, switchMode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
