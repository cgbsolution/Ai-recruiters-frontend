"use client";

import { toast } from "sonner";

let activeErrorId: string | number | undefined;

export const notifySuccess = (message: string) => {
  toast.success(message, { duration: 3000 });
};

export const notifyError = (message: string) => {
  // Dismiss any existing error toast before showing a new one
  if (activeErrorId !== undefined) {
    toast.dismiss(activeErrorId);
  }
  activeErrorId = toast.error(message, {
    duration: 4000,
    onDismiss: () => { activeErrorId = undefined; },
    onAutoClose: () => { activeErrorId = undefined; },
  });
};
