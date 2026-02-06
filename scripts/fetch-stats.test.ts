import { describe, expect, it } from 'vitest'
import { calculateStats, getPreviousWeekRange } from './fetch-stats'

describe('getPreviousWeekRange', () => {
  it('should correctly calculate previous week for a given date', () => {
    // Reference Date: Wednesday, Feb 4, 2026 (Mid-week)
    // Current Week: Mon Feb 2 - Sun Feb 8
    // Previous Week: Mon Jan 26 - Sun Feb 1
    const referenceDate = new Date('2026-02-04T12:00:00Z')

    const range = getPreviousWeekRange(referenceDate)

    // Expected Start: Mon Jan 26 2026 00:00:00 UTC
    const expectedStart = new Date('2026-01-26T00:00:00Z').getTime() / 1000
    // Expected End: Sun Feb 1 2026 23:59:59 UTC
    const expectedEnd = new Date('2026-02-01T23:59:59.999Z').getTime() / 1000

    expect(range.start).toBe(expectedStart)
    expect(range.end).toBe(Math.floor(expectedEnd))
    expect(range.year).toBe(2026)
    expect(range.weekNum).toBe(5) // Jan 26 is in Week 5 of 2026
  })

  it('should handle year boundary correctly (January)', () => {
    // Reference Date: Monday, Jan 5, 2026
    // Current Week: Mon Jan 5 - Sun Jan 11
    // Previous Week: Mon Dec 29, 2025 - Sun Jan 4, 2026
    const referenceDate = new Date('2026-01-05T10:00:00Z')

    const range = getPreviousWeekRange(referenceDate)

    // Expected Start: Mon Dec 29 2025 00:00:00 UTC
    const expectedStart = new Date('2025-12-29T00:00:00Z').getTime() / 1000

    expect(range.start).toBe(expectedStart)
    expect(range.year).toBe(2025) // Should belong to 2025 year group based on start date
  })
})

describe('calculateStats', () => {
  it('should correctly parse and aggregate swap messages', () => {
    const messages = [
      // Valid Swap 1 (A -> B)
      'chain: 1\ntokenIn: 0xA\ntokenOut: 0xB\nswapKind: GivenIn\nswapAmount: 100',
      // Valid Swap 1 (A -> B) - Same pair, different amount/kind
      'chain: 1\ntokenIn: 0xA\ntokenOut: 0xB\nswapKind: GivenOut\nswapAmount: 200',
      // Valid Swap 2 (C -> D) on different chain
      'chain: 137\ntokenIn: 0xC\ntokenOut: 0xD\nswapKind: GivenIn\nswapAmount: 50',
      // Invalid Message (should be ignored)
      'Just a random chat message',
      // Partial match (should be ignored)
      'chain: 1\ntokenIn: 0xA',
    ]

    const stats = calculateStats(messages)

    // Should result in 2 entries
    expect(stats).toHaveLength(2)

    // First entry (Most frequent: A->B, count 2)
    expect(stats[0]).toEqual({
      chain: '1',
      tokenIn: '0xA',
      tokenOut: '0xB',
      frequency: 2,
    })

    // Second entry (Less frequent: C->D, count 1)
    expect(stats[1]).toEqual({
      chain: '137',
      tokenIn: '0xC',
      tokenOut: '0xD',
      frequency: 1,
    })
  })

  it('should handle empty input', () => {
    const stats = calculateStats([])
    expect(stats).toEqual([])
  })

  it('should sort results by frequency descending', () => {
    const messages = [
      // Swap X (1 time)
      'chain: 1\ntokenIn: X\ntokenOut: Y\nswapKind: GivenIn\nswapAmount: 1',
      // Swap A (3 times)
      'chain: 1\ntokenIn: A\ntokenOut: B\nswapKind: GivenIn\nswapAmount: 1',
      'chain: 1\ntokenIn: A\ntokenOut: B\nswapKind: GivenIn\nswapAmount: 1',
      'chain: 1\ntokenIn: A\ntokenOut: B\nswapKind: GivenIn\nswapAmount: 1',
      // Swap M (2 times)
      'chain: 1\ntokenIn: M\ntokenOut: N\nswapKind: GivenIn\nswapAmount: 1',
      'chain: 1\ntokenIn: M\ntokenOut: N\nswapKind: GivenIn\nswapAmount: 1',
    ]

    const stats = calculateStats(messages)

    expect(stats).toHaveLength(3)
    expect(stats[0].tokenIn).toBe('A') // 3
    expect(stats[1].tokenIn).toBe('M') // 2
    expect(stats[2].tokenIn).toBe('X') // 1
  })
})
