// context/ModalContext.tsx
"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

type ModalContextType = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(async () => {
    try {
      const res = await api<{ allowed: boolean; message?: string }>("/jobs/can-create");
      if (!res.allowed) {
        toast.error(res.message || "You have exceeded the job limit. Please upgrade your plan.");
        return;
      }
      setIsOpen(true);
    } catch {
      // If the check fails (e.g. network error), still allow opening
      setIsOpen(true);
    }
  }, []);

  const closeModal = () => setIsOpen(false);

  return (
    <ModalContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useGlobalModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useGlobalModal must be used within a ModalProvider");
  }
  return context;
}
