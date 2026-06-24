import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { toastV } from "../../lib/motion";
import { useToast } from "../../state/toast";

export function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  return (
    <div className="bud-toasts">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`bud-toast ${t.kind}`}
            variants={toastV}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <span className="bud-toast-ic">
              {t.kind === "success" ? (
                <IconCheck size={15} stroke={2} />
              ) : t.kind === "error" ? (
                <IconAlertTriangle size={15} stroke={1.8} />
              ) : (
                <IconInfoCircle size={15} stroke={1.8} />
              )}
            </span>
            <span className="bud-toast-msg">{t.message}</span>
            <button className="bud-toast-x" onClick={() => dismiss(t.id)} title="Dismiss">
              <IconX size={13} stroke={1.9} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
