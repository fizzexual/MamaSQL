import { create } from "zustand";

export interface DialogReq {
  kind: "confirm" | "prompt";
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: boolean | string | null) => void;
}

interface DialogStore {
  current: DialogReq | null;
  open: (req: DialogReq) => void;
  close: () => void;
}

export const useDialog = create<DialogStore>((set) => ({
  current: null,
  open: (req) => set({ current: req }),
  close: () => set({ current: null }),
}));

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type PromptOpts = {
  title: string;
  label?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
};

/** Themed replacement for window.confirm — resolves true on OK, false on Cancel/Esc. */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.getState().open({ kind: "confirm", ...opts, resolve: (v) => resolve(v === true) });
  });
}

/** Themed replacement for window.prompt — resolves the string on OK, null on Cancel/Esc. */
export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().open({ kind: "prompt", ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) });
  });
}
