"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const EXPIRES_AT_KEY = "auth_expires_at"; // epoch ms when token expires

// How often to check if session is still valid (ms)
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
// Inactivity timeout — log out if no mouse/keyboard/touch for this long
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 60 minutes

export type UserRole = "super_admin" | "admin" | "recruiter";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  designation: string | null;
  is_email_verified: boolean;
  organization_id: number | null;
  organization_name: string | null;
  allow_code_editor: boolean;
  allow_whatsapp: boolean;
  allow_fit_score: boolean;
  google_connected: boolean;
  google_email: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Force logout helper ────────────────────────────────────────────────────
  const forceLogout = useCallback((reason?: string) => {
    Cookies.remove(TOKEN_KEY);
    Cookies.remove(USER_KEY);
    Cookies.remove(EXPIRES_AT_KEY);
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      // Store expiry reason so login page can show a notification
      sessionStorage.setItem("session_expired", reason || "Session expired, please login again!");
      window.location.href = "/signin";
    }
  }, []);

  // ── Activity tracking — reset inactivity timer on user interaction ─────────
  useEffect(() => {
    const resetActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetActivity));
    };
  }, []);

  // ── Periodic session check — token expiry + inactivity ─────────────────────
  useEffect(() => {
    if (!token) {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      return;
    }

    const check = () => {
      // 1. Check token expiry
      const expiresAt = parseInt(Cookies.get(EXPIRES_AT_KEY) || "0", 10);
      if (expiresAt > 0 && Date.now() >= expiresAt) {
        console.warn("[Auth] Session expired");
        forceLogout("Session expired, please login again!");
        return;
      }

      // 2. Check inactivity
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_TIMEOUT) {
        console.warn("[Auth] Logged out due to inactivity");
        forceLogout("Logged out due to inactivity. Please login again.");
        return;
      }

      // 3. Validate token with backend periodically
      const savedToken = Cookies.get(TOKEN_KEY);
      if (!savedToken) {
        forceLogout();
        return;
      }
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      }).then((res) => {
        if (res.status === 401 || res.status === 403) {
          console.warn("[Auth] Backend rejected token");
          forceLogout("Session expired, please login again!");
        }
      }).catch(() => {
        // Network error — don't log out, might be transient
      });
    };

    sessionTimerRef.current = setInterval(check, SESSION_CHECK_INTERVAL);
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [token, forceLogout]);

  // ── Restore session from cookies on mount, then sync with backend ──────────
  useEffect(() => {
    const savedToken = Cookies.get(TOKEN_KEY);
    const savedUser = Cookies.get(USER_KEY);

    if (savedToken && savedUser) {
      // Check if token has expired
      const expiresAt = parseInt(Cookies.get(EXPIRES_AT_KEY) || "0", 10);
      if (expiresAt > 0 && Date.now() >= expiresAt) {
        Cookies.remove(TOKEN_KEY);
        Cookies.remove(USER_KEY);
        Cookies.remove(EXPIRES_AT_KEY);
        setIsLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(savedUser) as AuthUser;
        setToken(savedToken);
        setUser(parsed);

        // Sync user profile from backend (role/org may have changed)
        fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => {
            if (res.status === 401 || res.status === 403) {
              // Token expired or user deactivated — force logout
              Cookies.remove(TOKEN_KEY);
              Cookies.remove(USER_KEY);
              Cookies.remove(EXPIRES_AT_KEY);
              setToken(null);
              setUser(null);
              return null;
            }
            return res.json();
          })
          .then((data) => {
            if (data && data.id) {
              const fresh: AuthUser = {
                id: data.id,
                name: data.name,
                email: data.email,
                role: data.role,
                phone: data.phone ?? null,
                designation: data.designation ?? null,
                is_email_verified: data.is_email_verified,
                organization_id: data.organization_id,
                organization_name: data.organization_name,
                allow_code_editor: data.allow_code_editor ?? false,
                allow_whatsapp: data.allow_whatsapp ?? false,
                allow_fit_score: data.allow_fit_score ?? false,
                google_connected: data.google_connected ?? false,
                google_email: data.google_email ?? null,
              };
              Cookies.set(USER_KEY, JSON.stringify(fresh), { expires: 1, sameSite: "Lax" });
              setUser(fresh);
            }
          })
          .catch(() => {
            // Network error — keep cached data
          });
      } catch {
        Cookies.remove(TOKEN_KEY);
        Cookies.remove(USER_KEY);
        Cookies.remove(EXPIRES_AT_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const saveSession = useCallback((accessToken: string, userData: AuthUser, expiresInSec?: number) => {
    // Cookie expires when token expires (default 1 day)
    const cookieDays = expiresInSec ? expiresInSec / 86400 : 1;
    Cookies.set(TOKEN_KEY, accessToken, { expires: cookieDays, sameSite: "Lax" });
    Cookies.set(USER_KEY, JSON.stringify(userData), { expires: cookieDays, sameSite: "Lax" });
    if (expiresInSec) {
      const expiresAt = Date.now() + expiresInSec * 1000;
      Cookies.set(EXPIRES_AT_KEY, String(expiresAt), { expires: cookieDays, sameSite: "Lax" });
    }
    setToken(accessToken);
    setUser(userData);
    lastActivityRef.current = Date.now();
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      Cookies.set(USER_KEY, JSON.stringify(updated), { expires: 1, sameSite: "Lax" });
      return updated;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(body.detail || "Login failed");
    }

    const data = await res.json();
    saveSession(data.access_token, data.user as AuthUser, data.expires_in);
  }, [saveSession]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json().catch(() => ({ detail: "Signup failed" }));

    // 202 = account created but pending admin approval
    if (res.status === 202 && data.pending_approval) {
      throw new Error("__PENDING_APPROVAL__");
    }

    if (!res.ok) {
      throw new Error(data.detail || "Signup failed");
    }

    saveSession(data.access_token, data.user as AuthUser, data.expires_in);
  }, [saveSession]);

  const logout = useCallback(() => {
    Cookies.remove(TOKEN_KEY);
    Cookies.remove(USER_KEY);
    Cookies.remove(EXPIRES_AT_KEY);
    setToken(null);
    setUser(null);
    window.location.href = "/signin";
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout, hasRole, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
