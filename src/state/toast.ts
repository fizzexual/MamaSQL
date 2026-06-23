import { create } from "zustand";

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Toast) => void;
  dismiss: (id: number) => void;
}

let _id = 0;

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, t] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Show a transient toast notification. */
export function toast(message: string, kind: ToastKind = "info"): void {
  const id = ++_id;
  useToast.getState().push({ id, message, kind });
  setTimeout(() => useToast.getState().dismiss(id), 2600);
}
