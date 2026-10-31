export type MediaCost = {
  currency: 'USD';
  usdMicros: number | null;
  status: 'pending' | 'estimated' | 'unavailable';
  note: string;
  usage?: { inputTokens?: number; outputTokens?: number; thinkingTokens?: number; cachedTokens?: number; toolTokens?: number; outputByModality?: Record<string, number> };
  pricing?: { inputUsdPerMillion: number; textOutputUsdPerMillion: number; mediaOutputUsdPerMillion: number; source: string; checkedAt: string };
};
export type CostTotal = { usdMicros: number; priced: number; unpriced: number; pending: number };
export const usd = (micros: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(micros / 1_000_000);
export const costLabel = (cost?: MediaCost) => cost?.status === 'estimated' && cost.usdMicros !== null ? usd(cost.usdMicros) : cost?.status === 'pending' ? 'Menunggu usage' : 'Belum tercatat';
export const totalLabel = (cost: CostTotal | undefined, total: number | undefined) => cost && (cost.priced > 0 || total === 0) ? usd(cost.usdMicros) : '—';
