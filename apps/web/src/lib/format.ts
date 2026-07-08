export function formatCompactTitle(title: string, max = 72): string {
  const compact = title.trim();
  if (compact.length <= max) return compact;
  const [first, ...rest] = compact.split(/\s+/);
  if (/^[a-f0-9]{24,}$/i.test(first)) {
    const tail = rest.length > 0 ? ` ${rest.join(" ")}` : "";
    return `${first.slice(0, 8)}…${first.slice(-6)}${tail}`;
  }
  return `${compact.slice(0, max)}…`;
}
