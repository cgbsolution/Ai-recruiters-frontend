"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Renders children only when the current user is a super_admin.
 * Used to gate token/credit analytics sections on the main dashboard.
 */
export default function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || user.role !== "super_admin") return null;

  return <>{children}</>;
}
