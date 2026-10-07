import { describe, expect, it } from 'vitest';
import { evaluateSample } from '../domain/conditionEvaluator';
import { validateField, validateProject } from '../domain/fieldValidation';
import { moveTiedRule, orderRulesByResolution } from '../domain/ruleOrdering';
import { analyzeRules } from '../domain/ruleAnalysis';
import type { BusinessRule, RuleField, RuleProject } from '../models/ruleModel';

const amount: RuleField = { id: 'amount', name: '金额', type: 'number', min: 0, max: 1000 };
const tier: RuleField = { id: 'tier', name: '等级', type: 'enum', enumValues: ['basic', 'gold'] };
const active: RuleField = { id: 'active', name: '启用', type: 'boolean' };

function makeRule(id: string, conditions: BusinessRule['conditions'], priority = 10, result = id): BusinessRule {
  return { id, name: id, conditions, priority, result };
}

function project(rules: BusinessRule[], fields: RuleField[] = [amount, tier, active]): RuleProject {
  return { id: 'p', title: '测试项目', fields, rules, sampleInputs: {}, versions: [], updatedAt: 1 };
}

const amountAtLeast = (value: number): BusinessRule['conditions'] => ({ kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'gte', value }] });

describe('field and project validation', () => {
  it('accepts inclusive boundary ranges and rejects reversed or empty definitions', () => {
    expect(validateField({ ...amount, min: 5, max: 5 })).toEqual([]);
    expect(validateField({ ...amount, min: 11, max: 10 }).map((issue) => issue.code)).toContain('number-range-order');
    expect(validateField({ id: 'tier', name: '等级', type: 'enum', enumValues: [] }).map((issue) => issue.code)).toContain('enum-values-required');
  });

  it('checks enum and boolean predicate types without depending on React', () => {
    const rules = [
      makeRule('gold', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'tier', operator: 'eq', value: 'gold' }] }),
      makeRule('active', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'active', operator: 'isTrue', value: true }] }),
    ];
    expect(validateProject(project(rules))).toEqual([]);
    expect(evaluateSample(project(rules), { amount: 12, tier: 'gold', active: true }).matchedRules.map((rule) => rule.id)).toEqual(['gold', 'active']);
  });
});

describe('rule consistency analysis', () => {
  it('finds partial overlap, same-priority conflicts, lower-priority shadowing, unreachable rules, and gaps', () => {
    const rules = [
      makeRule('base', amountAtLeast(500), 10, 'standard'),
      makeRule('partial', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'between', value: { min: 300, max: 800 } }] }, 20, 'special'),
      makeRule('conflict', amountAtLeast(700), 20, 'different'),
      makeRule('hidden', amountAtLeast(750), 5, 'hidden'),
      makeRule('impossible', amountAtLeast(1001), 50, 'out of range'),
      makeRule('no-overlap', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'lt', value: 250 }] }, 1, 'separate'),
    ];
    const analysis = analyzeRules(project(rules));
    expect(analysis.overlaps.some((overlap) => overlap.ruleAId === 'partial' && overlap.ruleBId === 'conflict' && overlap.conflict)).toBe(true);
    expect(analysis.overlaps.some((overlap) => overlap.ruleAId === 'base' && overlap.ruleBId === 'no-overlap')).toBe(false);
    expect(analysis.unreachableRuleIds).toContain('impossible');
    expect(analysis.shadowedRuleIds).toContain('hidden');
    expect(analysis.uncoveredExamples.length).toBeGreaterThan(0);
    expect(analysis.checkedCases).toBeGreaterThan(0);
  });

  it('evaluates OR groups and validates missing sample inputs precisely', () => {
    const rule = makeRule('either', { kind: 'group', operator: 'or', conditions: [
      { kind: 'predicate', fieldId: 'tier', operator: 'eq', value: 'gold' },
      { kind: 'predicate', fieldId: 'active', operator: 'isTrue', value: true },
    ] });
    const result = evaluateSample(project([rule]), { amount: 10, tier: 'basic', active: true });
    expect(result.valid).toBe(true);
    expect(result.winner?.id).toBe('either');
    const missing = evaluateSample(project([rule]), { amount: 10, tier: 'gold' });
    expect(missing.errors).toEqual(['请填写“启用”']);
  });
});

describe('rule resolution order', () => {
  it('uses one priority and tie ordering source for samples, visibility, and direct list reordering', () => {
    const activeTrue: BusinessRule['conditions'] = { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'active', operator: 'isTrue', value: true }] };
    const first = makeRule('first', activeTrue, 20, 'first result');
    const blocker = makeRule('blocker', activeTrue, 30, 'blocker result');
    const second = makeRule('second', activeTrue, 20, 'second result');
    const initial = project([first, blocker, second], [active]);

    const ordered = orderRulesByResolution(initial.rules).map((rule) => rule.id);
    expect(ordered).toEqual(['blocker', 'first', 'second']);
    expect(orderRulesByResolution(initial.rules)[1]).toMatchObject({ id: 'first', resolutionIndex: 1, tieIndex: 0, tieCount: 2 });

    const sample = evaluateSample(initial, { active: true });
    expect(sample.matchedRules.map((rule) => rule.id)).toEqual(['blocker', 'first', 'second']);
    expect(sample.winner?.id).toBe('blocker');

    const analysis = analyzeRules(initial);
    const overlap = analysis.overlaps.find((item) => item.ruleAId === 'first' && item.ruleBId === 'second');
    expect(overlap).toMatchObject({ conflict: true });
    expect(analysis.shadowedRuleIds).toEqual(['first', 'second']);

    const reorderedRules = moveTiedRule(initial.rules, 'first', 1);
    expect(reorderedRules.map((rule) => rule.id)).toEqual(['second', 'blocker', 'first']);
    const reordered = project(reorderedRules, [active]);
    expect(evaluateSample(reordered, { active: true }).matchedRules.map((rule) => rule.id)).toEqual(['blocker', 'second', 'first']);
    expect(analyzeRules(reordered).overlaps.find((item) => item.ruleAId === 'second' && item.ruleBId === 'first')?.conflict).toBe(true);
  });
});
