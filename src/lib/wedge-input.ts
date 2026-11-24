/** inputMode for the DataWedge field. "none" keeps the on-screen keyboard closed. */
export function wedgeInputMode(typeManually: boolean): "none" | "text" {
  return typeManually ? "text" : "none";
}

/** After a tap, put focus back on the wedge input unless a keep-focus field is active. */
export function shouldRestoreWedgeFocus(input: {
  activeIsKeepFocus: boolean;
}): boolean {
  return !input.activeIsKeepFocus;
}
