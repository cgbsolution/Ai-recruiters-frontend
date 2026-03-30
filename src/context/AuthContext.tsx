"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

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

  // Restore session from cookies on mount, then sync with backend
  useEffect(() => {
    const savedToken = Cookies.get(TOKEN_KEY);
    const savedUser = Cookies.get(USER_KEY);

    if (savedToken && savedUser) {
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
              };
              Cookies.set(USER_KEY, JSON.stringify(fresh), { expires: 7, sameSite: "Lax" });
              setUser(fresh);
            }
          })
          .catch(() => {
            // Network error — keep cached data
          });
      } catch {
        Cookies.remove(TOKEN_KEY);
        Cookies.remove(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const saveSession = useCallback((accessToken: string, userData: AuthUser) => {
    // Cookie expires in 7 days, sameSite strict for security
    Cookies.set(TOKEN_KEY, accessToken, { expires: 7, sameSite: "Lax" });
    Cookies.set(USER_KEY, JSON.stringify(userData), { expires: 7, sameSite: "Lax" });
    setToken(accessToken);
    setUser(userData);
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      Cookies.set(USER_KEY, JSON.stringify(updated), { expires: 7, sameSite: "Lax" });
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
    saveSession(data.access_token, data.user as AuthUser);
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

    saveSession(data.access_token, data.user as AuthUser);
  }, [saveSession]);

  const logout = useCallback(() => {
    Cookies.remove(TOKEN_KEY);
    Cookies.remove(USER_KEY);
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
