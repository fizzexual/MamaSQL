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
  /** Optional checkbox shown in a confirm dialog; resolves { ok, checked }. */
  checkbox?: string;
  resolve: (value: boolean | string | { ok: boolean; checked: boolean } | null) => void;
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

/**
 * Confirm a deletion with an optional "skip foreign-key checks" toggle.
 * Resolves { ok, skipFk } — ok=false means cancelled.
 */
export function confirmDelete(opts: { title: string; message?: string; confirmLabel?: string }): Promise<{ ok: boolean; skipFk: boolean }> {
  return new Promise((resolve) => {
    useDialog.getState().open({
      kind: "confirm",
      danger: true,
      checkbox: "Skip foreign-key checks (force delete even if other rows reference it)",
      ...opts,
      resolve: (v) =>
        v && typeof v === "object" ? resolve({ ok: v.ok, skipFk: v.checked }) : resolve({ ok: v === true, skipFk: false }),
    });
  });
}
