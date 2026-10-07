import type { BusinessRule } from '../models/ruleModel';

/**
 * 决胜顺序的唯一来源：优先级高者在前，优先级相同按规则列表顺序决胜。
 * 规则列表展示、样例推演与一致性检查都必须使用这里的排序，不得各自实现。
 */
export interface RankedRule {
  rule: BusinessRule;
  /** 决胜位次，从 1 开始 */
  rank: number;
  /** 规则在项目 rules 数组中的原始位置（列表顺序） */
  listIndex: number;
  /** 同优先级并列组的大小，1 表示没有并列 */
  tieSize: number;
  /** 在并列组内的位次，从 1 开始；组内第 1 位先决胜 */
  tieIndex: number;
}

export function rankRules(rules: BusinessRule[]): RankedRule[] {
  const ranked: RankedRule[] = rules
    .map((rule, listIndex) => ({ rule, listIndex }))
    .sort((a, b) => b.rule.priority - a.rule.priority || a.listIndex - b.listIndex)
    .map((entry, index) => ({ ...entry, rank: index + 1, tieSize: 1, tieIndex: 1 }));
  let groupStart = 0;
  for (let index = 1; index <= ranked.length; index += 1) {
    if (index < ranked.length && ranked[index].rule.priority === ranked[groupStart].rule.priority) continue;
    const tieSize = index - groupStart;
    for (let offset = 0; offset < tieSize; offset += 1) {
      ranked[groupStart + offset].tieSize = tieSize;
      ranked[groupStart + offset].tieIndex = offset + 1;
    }
    groupStart = index;
  }
  return ranked;
}

/** 按决胜顺序排列的规则（与 rankRules 同源）。 */
export function orderRules(rules: BusinessRule[]): BusinessRule[] {
  return rankRules(rules).map((entry) => entry.rule);
}
