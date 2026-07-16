export type MaskableValue = string | null | undefined;

function clean(value: MaskableValue): string {
  return value?.trim() ?? "";
}

export function maskName(value: MaskableValue): string {
  const text = clean(value);
  if (!text) return "";
  if (text.length === 1) return "*";
  return `${text[0]}*${text.at(-1)}`;
}

/** Public-page mask: never reveal the final character of a person's name. */
export function maskNameStrict(value: MaskableValue): string {
  const characters = [...clean(value)];
  if (characters.length === 0) return "";
  if (characters.length === 1) return "○";
  return `${characters[0]}${"○".repeat(characters.length - 1)}`;
}

export function maskPhone(value: MaskableValue): string {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 7) return "*".repeat(text.length);
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
}

export function maskAddress(value: MaskableValue): string {
  const text = clean(value);
  if (!text) return "";

  const region = text.match(/^(.+?[縣市])(.+?(?:區|鄉|鎮|市))(.*)$/);
  if (!region) return "*";
  return `${region[1]}${region[2]}${region[3] ? "*" : ""}`;
}

export function maskEmail(value: MaskableValue): string {
  const text = clean(value);
  if (!text) return "";

  const at = text.lastIndexOf("@");
  if (at <= 0 || at === text.length - 1) return "***";
  return `${text.slice(0, Math.min(2, at))}***@${text.slice(at + 1)}`;
}

export function maskLineId(value: MaskableValue): string {
  const text = clean(value);
  if (!text) return "";
  return `${text.slice(0, 2)}***`;
}
