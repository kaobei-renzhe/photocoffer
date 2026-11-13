import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

const { personScoreFromLogits } = await import('./portrait')

const CLASSES = 92
const PERSON = 1

function logitsOf(rows: Array<Record<number, number>>): Float32Array {
  const data = new Float32Array(rows.length * CLASSES)
  rows.forEach((row, q) => {
    for (const [cls, value] of Object.entries(row)) data[q * CLASSES + Number(cls)] = value
  })
  return data
}

describe('personScoreFromLogits', () => {
  it('只认 argmax 是 person 的 query', () => {
    const data = logitsOf([
      { [PERSON]: 4 },
      // person 分数不低，但 argmax 是猫，不能算人像
      { [PERSON]: 5, 17: 6 },
      { 91: 7 }
    ])
    expect(personScoreFromLogits(data, 3, CLASSES)).toBeCloseTo(0.982, 2)
  })

  it('没有 person query 时返回 0', () => {
    const data = logitsOf([{ 91: 8 }, { 3: 6 }])
    expect(personScoreFromLogits(data, 2, CLASSES)).toBe(0)
  })

  it('多个人像 query 取最高分', () => {
    const data = logitsOf([{ [PERSON]: 0.5 }, { [PERSON]: 3 }])
    expect(personScoreFromLogits(data, 2, CLASSES)).toBeCloseTo(0.953, 2)
  })
})
