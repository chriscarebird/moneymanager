/**
 * Strip markdown code fences if Claude wraps its JSON response in them.
 * Handles ```json ... ``` and ``` ... ``` variants.
 */
export function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}
