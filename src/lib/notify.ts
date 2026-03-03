"use client";

import { toast } from "sonner";

export const notifySuccess = (message: string) => {
  toast.success(message, { duration: 3000 });
};

export const notifyError = (message: string) => {
  toast.error(message, { duration: 4000 });
};
