/** Returns the manually-edited text for this contentKey if one's been
 * saved (via the right-click editor, see Editable.tsx), else the copy
 * baked into the component. */
export function resolveContent(
  overrides: Record<string, string> | null | undefined,
  key: string,
  fallback: string
): string {
  return overrides?.[key] ?? fallback;
}
