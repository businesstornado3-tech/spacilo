import { toast as sonner } from "sonner";

/** Application-wide toast helpers. */
export const toast = {
  success: (message: string, description?: string) =>
    sonner.success(message, description ? { description } : undefined),
  error: (message: string, description?: string) =>
    sonner.error(message, description ? { description } : undefined),
  info: (message: string, description?: string) =>
    sonner(message, description ? { description } : undefined),
  warning: (message: string, description?: string) =>
    sonner.warning(message, description ? { description } : undefined),
};
