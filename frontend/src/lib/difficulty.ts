import type { Query } from './api';

export function normalizeDifficulty(d?: string): string {
  if (!d) return 'beginner';
  const lower = d.toLowerCase().trim();
  if (lower === 'advanced') return 'difficult';
  if (['beginner', 'intermediate', 'difficult'].includes(lower)) return lower;
  return 'beginner';
}

export function difficultyLabel(d?: string): string {
  const n = normalizeDifficulty(d);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function difficultyIcon(d?: string): string {
  const n = normalizeDifficulty(d);
  return { beginner: '🟢', intermediate: '🟡', difficult: '🔴' }[n] ?? '⚪';
}

export function difficultyRank(d?: string): number {
  return { beginner: 0, intermediate: 1, difficult: 2 }[normalizeDifficulty(d)] ?? 0;
}

export function sortQueries<T extends Query>(queries: T[]): T[] {
  return [...queries].sort((a, b) => {
    const dr = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
    if (dr !== 0) return dr;
    const pa = (a.prompt ?? '').toLowerCase();
    const pb = (b.prompt ?? '').toLowerCase();
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}
