"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";
import { SESSION_IDLE_MS, lastActivityAt, markActivity, trackUserActivity } from "@/lib/sessionActivity";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const EXPIRES_AT_KEY = "auth_expires_at"; // epoch ms when token expires
// localStorage, shared by all tabs: when the token was last renewed (epoch ms)
const REFRESHED_AT_KEY = "auth_refreshed_at";

// `secure` keeps the session cookies off plain-http requests; it is only
// possible on an https origin, so local http dev keeps working.
function cookieOptions(days: number): Cookies.CookieAttributes {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  return { expires: days, sameSite: "Lax", secure };
}

// How often to check if session is still valid (ms)
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
// Renew the token at most this often, and only after activity since the last
// renewal. Sign-out happens after SESSION_IDLE_MS (24 h) with NO activity —
// it used to be 60 min without a click or key press, which signed people out
// in the middle of watching a long bulk upload (and killed the upload), and
// the token itself died 24 h after login however active the user was.
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

function readRefreshedAt(): number {
  try {
    return parseInt(localStorage.getItem(REFRESHED_AT_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeRefreshedAt(value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(REFRESHED_AT_KEY);
    else localStorage.setItem(REFRESHED_AT_KEY, String(value));
  } catch {
    // storage unavailable — at worst this tab renews a little more often
  }
}

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
  /** Sign in with a one-time link from AskMira (the HRMS this company runs). */
  loginWithAskmira: (launchToken: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  updateUser: (updates: Partial<AuthUser>) => void;
  /** Swap in a freshly issued token (e.g. after a password change, which
   *  invalidates every earlier token). */
  replaceToken: (accessToken: string, expiresInSec?: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Force logout helper ────────────────────────────────────────────────────
  const forceLogout = useCallback((reason?: string) => {
    Cookies.remove(TOKEN_KEY);
    Cookies.remove(USER_KEY);
    Cookies.remove(EXPIRES_AT_KEY);
    writeRefreshedAt(null);
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      // Store expiry reason so login page can show a notification
      sessionStorage.setItem("session_expired", reason || "Session expired, please login again!");
      window.location.href = "/signin";
    }
  }, []);

  const replaceToken = useCallback((accessToken: string, expiresInSec?: number) => {
    const cookieDays = expiresInSec ? expiresInSec / 86400 : 1;
    Cookies.set(TOKEN_KEY, accessToken, cookieOptions(cookieDays));
    if (expiresInSec) {
      Cookies.set(EXPIRES_AT_KEY, String(Date.now() + expiresInSec * 1000), cookieOptions(cookieDays));
    }
    // The cached profile cookie must outlive the renewed token too, or a page
    // reload a day after login would find no user and look signed out.
    const savedUser = Cookies.get(USER_KEY);
    if (savedUser) Cookies.set(USER_KEY, savedUser, cookieOptions(cookieDays));
    writeRefreshedAt(Date.now());
    setToken(accessToken);
  }, []);

  // ── Activity tracking — any input, in any open tab ─────────────────────────
  useEffect(() => trackUserActivity(), []);

  // ── Periodic session check — token expiry, inactivity, renewal ─────────────
  useEffect(() => {
    if (!token) {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      return;
    }

    const check = () => {
      const now = Date.now();
      // 1. Check token expiry
      const expiresAt = parseInt(Cookies.get(EXPIRES_AT_KEY) || "0", 10);
      if (expiresAt > 0 && now >= expiresAt) {
        console.warn("[Auth] Session expired");
        forceLogout("Session expired, please login again!");
        return;
      }

      // 2. Check inactivity (24 h with no activity in any tab)
      const lastActive = lastActivityAt();
      if (now - lastActive >= SESSION_IDLE_MS) {
        console.warn("[Auth] Logged out due to inactivity");
        forceLogout("Logged out after 24 hours of inactivity. Please login again.");
        return;
      }

      const savedToken = Cookies.get(TOKEN_KEY);
      if (!savedToken) {
        forceLogout();
        return;
      }

      // 3. Active since the last renewal → renew, so working users never hit
      //    the token's expiry. The backend validates the token while renewing.
      const refreshedAt = readRefreshedAt();
      if (lastActive > refreshedAt && now - refreshedAt >= REFRESH_INTERVAL) {
        writeRefreshedAt(now); // claim it, so other tabs don't renew too
        fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then(async (res) => {
            if (res.status === 401 || res.status === 403) {
              const body = await res.json().catch(() => ({}));
              forceLogout(body?.detail || "Session expired, please login again!");
              return;
            }
            if (!res.ok) {
              writeRefreshedAt(refreshedAt); // retry on the next check
              return;
            }
            const data = await res.json();
            if (data?.access_token) replaceToken(data.access_token, data.expires_in);
          })
          .catch(() => {
            // Network error — keep the current token and retry on the next check
            writeRefreshedAt(refreshedAt);
          });
        return;
      }

      // 4. Otherwise just validate the token with the backend
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
    // Coming back to the tab (or waking the laptop): check right away rather
    // than up to 5 min later.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, forceLogout, replaceToken]);

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
              Cookies.set(USER_KEY, JSON.stringify(fresh), cookieOptions(1));
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
    Cookies.set(TOKEN_KEY, accessToken, cookieOptions(cookieDays));
    Cookies.set(USER_KEY, JSON.stringify(userData), cookieOptions(cookieDays));
    if (expiresInSec) {
      const expiresAt = Date.now() + expiresInSec * 1000;
      Cookies.set(EXPIRES_AT_KEY, String(expiresAt), cookieOptions(cookieDays));
    }
    setToken(accessToken);
    setUser(userData);
    markActivity(true);
    writeRefreshedAt(Date.now());
  }, []);


  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      Cookies.set(USER_KEY, JSON.stringify(updated), cookieOptions(1));
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

  const loginWithAskmira = useCallback(async (launchToken: string) => {
    const res = await fetch(`${API_BASE}/auth/askmira/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: launchToken }),
    });
    const data = await res.json().catch(() => ({ detail: "Sign-in from AskMira failed" }));
    if (!res.ok) {
      throw new Error(data.detail || "Sign-in from AskMira failed");
    }
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
    writeRefreshedAt(null);
    setToken(null);
    setUser(null);
    window.location.href = "/signin";
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithAskmira, signup, logout, hasRole, updateUser, replaceToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
