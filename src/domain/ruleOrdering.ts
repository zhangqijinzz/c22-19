import type { BusinessRule } from '../models/ruleModel';

export interface OrderedRule extends BusinessRule {
  resolutionIndex: number;
  tieIndex?: number;
  tieCount?: number;
}

export interface RulePriorityGroup {
  priority: number;
  tied: boolean;
  rules: OrderedRule[];
}

export function compareRulesByResolution(left: BusinessRule, right: BusinessRule, source: BusinessRule[]): number {
  return right.priority - left.priority || source.indexOf(left) - source.indexOf(right);
}

export function orderRulesByResolution(rules: BusinessRule[]): OrderedRule[] {
  const priorityCounts = new Map<number, number>();
  rules.forEach((rule) => priorityCounts.set(rule.priority, (priorityCounts.get(rule.priority) ?? 0) + 1));
  const tiePositions = new Map<number, number>();

  return [...rules]
    .sort((left, right) => compareRulesByResolution(left, right, rules))
    .map((rule, resolutionIndex) => {
      const tieCount = priorityCounts.get(rule.priority) ?? 1;
      if (tieCount === 1) return { ...rule, resolutionIndex };
      const tieIndex = tiePositions.get(rule.priority) ?? 0;
      tiePositions.set(rule.priority, tieIndex + 1);
      return { ...rule, resolutionIndex, tieIndex, tieCount };
    });
}

export function groupRulesByPriority(rules: BusinessRule[]): RulePriorityGroup[] {
  const groups: RulePriorityGroup[] = [];
  orderRulesByResolution(rules).forEach((rule) => {
    const last = groups.at(-1);
    if (last?.priority === rule.priority) last.rules.push(rule);
    else groups.push({ priority: rule.priority, tied: (rule.tieCount ?? 1) > 1, rules: [rule] });
  });
  return groups;
}

export function moveTiedRule(rules: BusinessRule[], ruleId: string, direction: -1 | 1): BusinessRule[] {
  const ordered = orderRulesByResolution(rules);
  const currentIndex = ordered.findIndex((rule) => rule.id === ruleId);
  const current = ordered[currentIndex];
  if (!current || current.tieCount === 1) return rules;

  const swapIndex = currentIndex + direction;
  const next = ordered[swapIndex];
  if (!next || next.priority !== current.priority) return rules;

  const currentSourceIndex = rules.findIndex((rule) => rule.id === current.id);
  const nextSourceIndex = rules.findIndex((rule) => rule.id === next.id);
  const moved = [...rules];
  [moved[currentSourceIndex], moved[nextSourceIndex]] = [moved[nextSourceIndex], moved[currentSourceIndex]];
  return moved;
}
