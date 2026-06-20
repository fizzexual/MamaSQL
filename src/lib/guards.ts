/**
 * Block the common entry points to the browser/webview devtools + page source.
 *
 * Note: in a normal browser these JS guards cover the keyboard shortcuts and the
 * right-click "Inspect" menu, but cannot block the browser's own menu-bar devtools.
 * In a Tauri *release* build devtools are compiled out entirely, so combined with
 * these guards the desktop app has no inspect route.
 */
export function installInspectGuards(): void {
  // Suppress the native right-click menu (and its "Inspect" item) everywhere.
  // In-app context menus use React onContextMenu and keep working.
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        e.key === "F12" ||
        (mod && e.shiftKey && (k === "i" || k === "j" || k === "c")) || // devtools / console / inspect-element
        (mod && k === "u"); // view-source
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true },
  );
}
