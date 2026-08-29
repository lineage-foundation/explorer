interface Delta {
  gains: number[];
  spends: number[];
}

/**
 * Pure in-memory accumulator of per-address token output gains/spends
 * observed while processing a single block. No DB access.
 */
export class BalanceTracker {
  private data = new Map<string, Delta>();

  private entry(address: string): Delta {
    let d = this.data.get(address);
    if (!d) {
      d = { gains: [], spends: [] };
      this.data.set(address, d);
    }
    return d;
  }

  addGain(address: string, outId: number): void {
    this.entry(address).gains.push(outId);
  }

  addSpend(address: string, outId: number): void {
    this.entry(address).spends.push(outId);
  }

  touched(): string[] {
    return [...this.data.keys()];
  }

  delta(address: string): Delta {
    return this.data.get(address) ?? { gains: [], spends: [] };
  }

  /**
   * Computes previous - spends + gains, deduped, for the given address.
   */
  mergeFinal(previous: number[], address: string): number[] {
    const { gains, spends } = this.delta(address);
    const spent = new Set(spends);
    const result = new Set<number>();
    for (const id of previous) if (!spent.has(id)) result.add(id);
    for (const id of gains) result.add(id);
    return [...result];
  }
}
