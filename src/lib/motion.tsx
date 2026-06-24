import { motion, type HTMLMotionProps, type Transition, type Variants } from "framer-motion";

/**
 * Shared motion vocabulary for MamaSQL.
 *
 * This extends the app's existing CSS pop language — cubic-bezier(0.2, 0.8, 0.3, 1)
 * at ~0.12–0.26s — rather than replacing it. Framer's job here is the things plain
 * CSS can't do on a conditionally-rendered tree: spring physics, **exit** animations,
 * staggered reveals, and gesture feedback. Reduced-motion is honoured globally via
 * <MotionConfig reducedMotion="user"> in main.tsx, which snaps transforms to their
 * resting value while still allowing opacity fades.
 */

export const spring: Transition = { type: "spring", stiffness: 440, damping: 34, mass: 0.85 };
export const springSoft: Transition = { type: "spring", stiffness: 320, damping: 30 };
export const ease: Transition = { duration: 0.2, ease: [0.2, 0.8, 0.3, 1] };
export const easeOut: Transition = { duration: 0.12, ease: [0.4, 0, 0.2, 1] };

/** Full-screen scrim — fade only (any backdrop-blur stays in CSS). */
export const backdropV: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeOut },
  exit: { opacity: 0, transition: easeOut },
};

/** Flex-centered modal / dialog panel — springs up into place, settles back out. */
export const panelV: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: easeOut },
};

/**
 * Variant for `.bud-modal`, which centers itself with CSS `translate(-50%, -50%)`.
 * Framer writes the full transform inline, so we reproduce the centering through
 * x/y (held constant across states) and only animate scale + opacity on top of it.
 */
export const centeredModalV: Variants = {
  hidden: { opacity: 0, scale: 0.955, x: "-50%", y: "-50%" },
  show: { opacity: 1, scale: 1, x: "-50%", y: "-50%", transition: spring },
  exit: { opacity: 0, scale: 0.97, x: "-50%", y: "-50%", transition: easeOut },
};

/** Command palette — drops in from just above its resting position. */
export const commandV: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: -8, scale: 0.985, transition: easeOut },
};

/** Toast — slides in from the right edge, collapses away. */
export const toastV: Variants = {
  hidden: { opacity: 0, x: 28, scale: 0.95 },
  show: { opacity: 1, x: 0, scale: 1, transition: spring },
  exit: { opacity: 0, x: 28, scale: 0.9, transition: easeOut },
};

/** Stagger container + child, for lists that appear all at once. */
export const listV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.022, delayChildren: 0.05 } },
};
export const listItemV: Variants = {
  hidden: { opacity: 0, y: 7 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

/** Top-level view swap (data / design / automation / settings). */
export const viewV: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: ease },
  exit: { opacity: 0, y: -8, transition: easeOut },
};

/** A <button> with a subtle press spring. Drop-in replacement for plain buttons. */
export function MotionButton(props: HTMLMotionProps<"button">) {
  return <motion.button whileTap={{ scale: 0.95 }} transition={springSoft} {...props} />;
}
