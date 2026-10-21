/**
 * React 19 resets a form after its server action runs. Actions return the submitted text values
 * so the form can render them back as defaults, and a failed submit never wipes what someone typed.
 */
export type FormValues = Partial<Record<string, string>>;

export function pickValues(form: FormData, keys: readonly string[]): FormValues {
  const out: FormValues = {};
  for (const key of keys) {
    const v = form.get(key);
    if (typeof v === "string") out[key] = v.slice(0, 5000);
  }
  return out;
}
