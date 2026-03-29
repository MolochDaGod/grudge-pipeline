import { create } from "zustand";
import type { GrudgeUser } from "../types/grudge";

// ── Global puter type (loaded via CDN script tag) ────────────────────────────
declare const puter: {
  auth: {
    signIn: () => Promise<unknown>;
    signOut: () => void;
    isSignedIn: () => boolean;
    getUser: () => Promise<{
      uuid: string;
      username: string;
      email_confirmed: boolean;
      is_temp: boolean;
    }>;
  };
};

// ── Auth state ───────────────────────────────────────────────────────────────

export interface AuthState {
  /** Auth has been checked at least once */
  ready: boolean;
  /** Currently resolving puter → grudge */
  loading: boolean;
  user: GrudgeUser | null;
  wallet: { address: string; provisioned: boolean } | null;

  /** Trigger Puter sign-in popup, then resolve Grudge ID */
  login: () => Promise<void>;
  /** Sign out of both Puter and Grudge */
  logout: () => void;
  /** Check existing Puter session on app load */
  restore: () => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function resolvePuterToGrudge(
  puter_uuid: string,
  username: string,
): Promise<{ user: GrudgeUser; wallet: { address: string; provisioned: boolean } }> {
  const res = await fetch(`${API_BASE}/api/auth/puter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ puter_uuid, username }),
  });
  if (!res.ok) throw new Error("Grudge auth failed");
  const data = (await res.json()) as {
    valid: boolean;
    user: GrudgeUser & { wallet?: { address: string; provisioned: boolean } };
  };
  const { wallet, ...userData } = data.user;
  return {
    user: userData as GrudgeUser,
    wallet: wallet ?? { address: "", provisioned: false },
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  loading: false,
  user: null,
  wallet: null,

  login: async () => {
    set({ loading: true });
    try {
      await puter.auth.signIn();
      const puterUser = await puter.auth.getUser();
      const { user, wallet } = await resolvePuterToGrudge(
        puterUser.uuid,
        puterUser.username,
      );
      set({ user, wallet, ready: true, loading: false });
    } catch (err) {
      console.error("[grudge-auth] login failed", err);
      set({ loading: false });
    }
  },

  logout: () => {
    try {
      puter.auth.signOut();
    } catch {
      // puter may not be loaded
    }
    set({ user: null, wallet: null });
  },

  restore: async () => {
    try {
      if (typeof puter === "undefined" || !puter.auth.isSignedIn()) {
        set({ ready: true });
        return;
      }
      set({ loading: true });
      const puterUser = await puter.auth.getUser();
      const { user, wallet } = await resolvePuterToGrudge(
        puterUser.uuid,
        puterUser.username,
      );
      set({ user, wallet, ready: true, loading: false });
    } catch {
      set({ ready: true, loading: false });
    }
  },
}));

export function useAuthHeaders(): Record<string, string> {
  const user = useAuthStore((s) => s.user);
  if (!user) return {};
  // For service calls, pass the grudge_id as a header
  return { "X-Grudge-ID": user.grudge_id };
}
