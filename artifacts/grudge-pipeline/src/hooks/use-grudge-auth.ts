import { create } from "zustand";
import type { GrudgeUser } from "../types/grudge";

interface AuthState {
  token: string | null;
  user: GrudgeUser | null;
  setAuth: (token: string, user: GrudgeUser) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("grudge_token"),
  user: (() => {
    try {
      const u = localStorage.getItem("grudge_user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })(),
  setAuth: (token, user) => {
    localStorage.setItem("grudge_token", token);
    localStorage.setItem("grudge_user", JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    localStorage.removeItem("grudge_token");
    localStorage.removeItem("grudge_user");
    set({ token: null, user: null });
  },
}));

export function useAuthHeaders(): Record<string, string> {
  const token = useAuthStore((s) => s.token);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
