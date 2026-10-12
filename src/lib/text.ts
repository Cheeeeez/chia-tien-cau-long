export function toAsciiUpper(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
