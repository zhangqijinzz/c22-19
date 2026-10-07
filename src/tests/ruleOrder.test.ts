import { describe, expect, it } from 'vitest';
import { evaluateSample } from '../domain/conditionEvaluator';
import { analyzeRules } from '../domain/ruleAnalysis';
import { orderRules, rankRules } from '../domain/ruleOrder';
import { RulesViewModel } from '../features/rules/rulesViewModel';
import type { BusinessRule, RuleField, RuleProject } from '../models/ruleModel';
import { RuleWorkspaceViewModel } from '../viewmodels/workspaceViewModel';

const amount: RuleField = { id: 'amount', name: '金额', type: 'number', min: 0, max: 100 };

function makeRule(id: string, priority: number, threshold = 10): BusinessRule {
  return {
    id, name: id, priority, result: `result-${id}`,
    conditions: { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'gte', value: threshold }] },
  };
}

function project(rules: BusinessRule[]): RuleProject {
  return { id: 'p', title: '测试项目', fields: [amount], rules, sampleInputs: { amount: 50 }, versions: [], updatedAt: 1 };
}

class MemoryRepository {
  async load() { return null; }
  async save() { return undefined; }
}

class FakeChecker {
  run() { return { promise: new Promise<never>(() => undefined), cancel() {} }; }
}

async function setup(rules: BusinessRule[]) {
  const workspace = new RuleWorkspaceViewModel(new MemoryRepository(), new FakeChecker());
  await workspace.start();
  const current = workspace.getSnapshot().project as RuleProject;
  workspace.commitProject({ ...current, fields: [amount], rules }, '准备规则');
  return { workspace, viewModel: new RulesViewModel(workspace) };
}

describe('rankRules 决胜顺序', () => {
  it('按优先级降序排列，同优先级保持列表顺序并标注并列位次', () => {
    const rules = [makeRule('a', 10), makeRule('b', 30), makeRule('c', 30), makeRule('d', 20)];
    const ranked = rankRules(rules);
    expect(ranked.map((entry) => entry.rule.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked[0]).toMatchObject({ tieSize: 2, tieIndex: 1 });
    expect(ranked[1]).toMatchObject({ tieSize: 2, tieIndex: 2 });
    expect(ranked[2]).toMatchObject({ tieSize: 1, tieIndex: 1 });
    expect(orderRules(rules).map((rule) => rule.id)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('样例推演与一致性检查同源', () => {
  it('样例匹配顺序与 rankRules 给出的决胜顺序一致', () => {
    const rules = [makeRule('a', 10), makeRule('b', 30), makeRule('c', 20)];
    const evaluation = evaluateSample(project(rules), { amount: 50 });
    expect(evaluation.matchedRules.map((rule) => rule.id)).toEqual(['b', 'c', 'a']);
    expect(evaluation.matchedRules.map((rule) => rule.id))
      .toEqual(orderRules(rules).map((rule) => rule.id));
  });

  it('同优先级并列时，样例胜者与被遮蔽判定使用同一列表顺序', () => {
    const first = makeRule('first', 10);
    const second = makeRule('second', 10);
    const forward = project([first, second]);
    expect(evaluateSample(forward, { amount: 50 }).winner?.id).toBe('first');
    expect(analyzeRules(forward).shadowedRuleIds).toEqual(['second']);
    const reversed = project([second, first]);
    expect(evaluateSample(reversed, { amount: 50 }).winner?.id).toBe('second');
    expect(analyzeRules(reversed).shadowedRuleIds).toEqual(['first']);
  });
});

describe('moveRule 直接调整决胜先后', () => {
  it('同优先级时只交换列表顺序，样例胜者随之改变', async () => {
    const { workspace, viewModel } = await setup([makeRule('first', 10), makeRule('second', 10)]);
    viewModel.moveRule('second', 'up');
    const project = workspace.getSnapshot().project as RuleProject;
    expect(project.rules.map((rule) => rule.id)).toEqual(['second', 'first']);
    expect(project.rules.every((rule) => rule.priority === 10)).toBe(true);
    expect(evaluateSample(project, { amount: 50 }).winner?.id).toBe('second');
    expect(analyzeRules(project).shadowedRuleIds).toEqual(['first']);
    workspace.dispose();
  });

  it('跨优先级移动时采用相邻规则的优先级，使先后立即生效', async () => {
    const { workspace, viewModel } = await setup([makeRule('high', 30), makeRule('low', 10)]);
    viewModel.moveRule('low', 'up');
    const project = workspace.getSnapshot().project as RuleProject;
    expect(project.rules.map((rule) => rule.id)).toEqual(['low', 'high']);
    expect(project.rules[0]).toMatchObject({ id: 'low', priority: 30 });
    expect(evaluateSample(project, { amount: 50 }).winner?.id).toBe('low');
    workspace.dispose();
  });

  it('向下移动同样交换决胜位次', async () => {
    const { workspace, viewModel } = await setup([makeRule('top', 20), makeRule('bottom', 20)]);
    viewModel.moveRule('top', 'down');
    const project = workspace.getSnapshot().project as RuleProject;
    expect(project.rules.map((rule) => rule.id)).toEqual(['bottom', 'top']);
    expect(evaluateSample(project, { amount: 50 }).winner?.id).toBe('bottom');
    workspace.dispose();
  });

  it('到达边界时不产生任何变化', async () => {
    const { workspace, viewModel } = await setup([makeRule('a', 20), makeRule('b', 10)]);
    const before = workspace.getSnapshot().project as RuleProject;
    viewModel.moveRule('a', 'up');
    viewModel.moveRule('b', 'down');
    expect(workspace.getSnapshot().project).toBe(before);
    workspace.dispose();
  });
});
