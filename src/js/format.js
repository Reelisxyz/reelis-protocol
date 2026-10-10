const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export function usd(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

// Small prices use subscript zero counts: 0.00001234 becomes $0.0₄4123
export function price(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return '$' + n.toFixed(2);
  if (a >= 0.01) return '$' + n.toFixed(4);
  if (a === 0) return '$0';
  const zeros = Math.floor(-Math.log10(a)) - 0;
  if (zeros < 3) return '$' + n.toFixed(zeros + 4);
  const digits = String(Math.round(a * Math.pow(10, zeros + 4))).slice(0, 4).padEnd(4, '0');
  const sub = String(zeros).split('').map((d) => SUB[Number(d)]).join('');
  return '$0.0' + sub + digits;
}

export function pct(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n) >= 1000 ? Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : Math.abs(n).toFixed(2);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s + '%';
}
