"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { getTourStepsForRole, type TourStep } from "@/components/product-tour/tour-steps";

interface ProductTourContextType {
  isOpen: boolean;
  steps: TourStep[];
  currentIndex: number;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

const ProductTourContext = createContext<ProductTourContextType | undefined>(undefined);

const STORAGE_KEY = (userId: number | string) => `product_tour_seen:${userId}`;

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const steps = useMemo<TourStep[]>(
    () => (user ? getTourStepsForRole(user.role) : []),
    [user]
  );

  const start = useCallback(() => {
    setCurrentIndex(0);
    setIsOpen(true);
  }, []);

  const stop = useCallback(() => {
    setIsOpen(false);
    if (user) {
      try {
        localStorage.setItem(STORAGE_KEY(user.id), "1");
      } catch {
        // ignore quota errors
      }
    }
  }, [user]);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      if (i >= steps.length - 1) {
        return i;
      }
      return i + 1;
    });
  }, [steps.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.max(0, Math.min(index, steps.length - 1)));
    },
    [steps.length]
  );

  // Auto-start the tour the first time a user lands on the dashboard
  useEffect(() => {
    if (!user) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY(user.id));
      if (!seen && steps.length > 0) {
        // Small delay so the layout/sidebar can mount before we measure targets
        const t = setTimeout(() => {
          setCurrentIndex(0);
          setIsOpen(true);
        }, 800);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable — silently skip
    }
  }, [user, steps.length]);

  const value = useMemo(
    () => ({ isOpen, steps, currentIndex, start, stop, next, prev, goTo }),
    [isOpen, steps, currentIndex, start, stop, next, prev, goTo]
  );

  return (
    <ProductTourContext.Provider value={value}>{children}</ProductTourContext.Provider>
  );
}

export function useProductTour() {
  const ctx = useContext(ProductTourContext);
  if (!ctx) throw new Error("useProductTour must be used within ProductTourProvider");
  return ctx;
}
