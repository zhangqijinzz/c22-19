import { groupRulesByPriority, type OrderedRule } from '../../domain/ruleOrdering';
import type { PredicateCondition, RuleField } from '../../models/ruleModel';
import type { WorkspaceState } from '../../viewmodels/workspaceViewModel';
import type { RulesViewModel } from './rulesViewModel';

interface RulesViewProps { state: WorkspaceState; viewModel: RulesViewModel }

export function RulesView({ state, viewModel }: RulesViewProps) {
  const project = state.project;
  const rules = project?.rules ?? [];
  const priorityGroups = groupRulesByPriority(rules);
  return (
    <section className="module-page">
      <div className="page-heading">
        <div><span className="eyebrow">模块 02 / 决策逻辑</span><h1>规则工作台</h1><p>用字段条件描述命中路径；列表按最终判定顺序排列，同优先级自上而下决胜。</p></div>
        <button className="button button-primary" onClick={() => viewModel.addRule()}><span>＋</span> 新建规则</button>
      </div>
      {project?.frozenVersionId && <div className="frozen-notice">◈ 当前项目已冻结。到检查与版本模块复制此版本后继续编辑。</div>}
      {project && project.fields.length === 0 && <div className="inline-issue">先到“字段定义”添加输入字段，再为规则设置条件。</div>}
      {rules.length === 0 ? <div className="empty-card card-surface"><div className="empty-icon">⌘</div><h2>规则还没有开始编织</h2><p>创建第一条规则，组合一个或多个字段条件，并填写命中结果。</p></div> : (
        <div className="rules-list">
          <div className="rule-ordering-note"><b>判定顺序</b><span>优先级数字高的规则在前；优先级相同的规则形成并列组，按列表中的先后决胜。使用 ↑ / ↓ 可直接调整并列规则。</span></div>
          {priorityGroups.map((group) => (
            <section className={`priority-group${group.tied ? ' priority-group-tied' : ''}`} key={group.priority}>
              <header className="priority-group-header">
                <div><b>P{group.priority}</b><span>{group.tied ? `${group.rules.length} 条规则并列` : '独立优先级'}</span></div>
                {group.tied && <span className="tie-direction">本组自上而下决胜 →</span>}
              </header>
              {group.rules.map((rule) => <RuleCard key={rule.id} rule={rule} fields={project?.fields ?? []} selected={state.selectedRuleId === rule.id} viewModel={viewModel} />)}
            </section>
          ))}
        </div>
      )}
      {state.validationIssues.filter((issue) => issue.ruleId).map((issue, index) => <div className="inline-issue" key={`${issue.code}-${index}`}>! {issue.message}</div>)}
    </section>
  );
}

interface RuleCardProps { rule: OrderedRule; fields: RuleField[]; selected: boolean; viewModel: RulesViewModel }

function RuleCard({ rule, fields, selected, viewModel }: RuleCardProps) {
  const tied = (rule.tieCount ?? 1) > 1;
  const updateCondition = (conditionIndex: number, condition: PredicateCondition) => viewModel.updateCondition(rule.id, conditionIndex, condition);
  return (
    <article data-rule-id={rule.id} className={`rule-card card-surface${selected ? ' rule-card-selected' : ''}${tied ? ' rule-card-tied' : ''}`} onFocus={() => viewModel.selectRule(rule.id)}>
      <header className="rule-card-header">
        <div className="rule-order"><span>R{String(rule.resolutionIndex + 1).padStart(2, '0')}</span>{tied && <small>并列 {Number(rule.tieIndex) + 1}/{rule.tieCount}</small>}</div>
        <div className="rule-name-wrap"><input className="rule-name-input" aria-label={`规则${rule.resolutionIndex + 1}名称`} value={rule.name} onChange={(event) => viewModel.updateRule(rule.id, { name: event.target.value })} /><span className="rule-meta">规则 ID · {rule.id.slice(-8)}{tied && ' · 同优先级决胜'}</span></div>
        {tied && <div className="tie-order-control"><button className="icon-button tie-button" aria-label={`将${rule.name}在同优先级中上移`} disabled={rule.tieIndex === 0} onClick={() => viewModel.moveRule(rule.id, -1)}>↑</button><button className="icon-button tie-button" aria-label={`将${rule.name}在同优先级中下移`} disabled={rule.tieIndex === Number(rule.tieCount) - 1} onClick={() => viewModel.moveRule(rule.id, 1)}>↓</button></div>}
        <label className="priority-control"><span>优先级</span><input aria-label={`${rule.name}优先级`} type="number" value={rule.priority} onChange={(event) => viewModel.updateRule(rule.id, { priority: Number(event.target.value) })} /></label>
        <button className="icon-button danger-hover" aria-label={`删除${rule.name}`} onClick={() => viewModel.removeRule(rule.id)}>×</button>
      </header>
      <div className="condition-area">
        <div className="condition-title"><span>满足以下条件</span><select aria-label={`${rule.name}条件组合`} value={rule.conditions.operator} onChange={(event) => viewModel.setGroupOperator(rule.id, event.target.value as 'and' | 'or')}><option value="and">全部满足 · AND</option><option value="or">任一满足 · OR</option></select></div>
        {rule.conditions.conditions.map((condition, conditionIndex) => condition.kind === 'predicate' ? (
          <ConditionRow key={`${rule.id}-${conditionIndex}`} field={fields.find((candidate) => candidate.id === condition.fieldId)} fields={fields} condition={condition} onFieldChange={(fieldId) => viewModel.changeConditionField(rule.id, conditionIndex, fieldId)} onChange={(next) => updateCondition(conditionIndex, next)} onRemove={() => viewModel.removeCondition(rule.id, conditionIndex)} />
        ) : <div className="nested-condition" key={`${rule.id}-${conditionIndex}`}>条件组 · {condition.operator.toUpperCase()} ({condition.conditions.length} 项)</div>)}
        <button className="text-button add-condition" disabled={fields.length === 0} onClick={() => viewModel.addCondition(rule.id)}>＋ 添加条件</button>
      </div>
      <div className="result-row"><div className="result-label"><span className="result-arrow">↳</span><span>命中结果</span></div><input aria-label={`${rule.name}命中结果`} value={rule.result} onChange={(event) => viewModel.updateRule(rule.id, { result: event.target.value })} placeholder="例如：自动通过 / 应用 9 折" /></div>
    </article>
  );
}

interface ConditionRowProps { field?: RuleField; fields: RuleField[]; condition: PredicateCondition; onFieldChange: (fieldId: string) => void; onChange: (condition: PredicateCondition) => void; onRemove: () => void }

function ConditionRow({ field, fields, condition, onFieldChange, onChange, onRemove }: ConditionRowProps) {
  if (!field) return <div className="condition-row condition-error"><span>引用字段已删除</span><button className="icon-button" onClick={onRemove}>×</button></div>;
  const numeric = field.type === 'number';
  const enumField = field.type === 'enum';
  const operatorOptions = numeric
    ? [['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于'], ['eq', '等于'], ['between', '介于']]
    : enumField ? [['eq', '等于'], ['notEq', '不等于']] : [['isTrue', '为真'], ['isFalse', '为假']];
  return (
    <div className="condition-row">
      <select aria-label="条件字段" value={field.id} onChange={(event) => onFieldChange(event.target.value)}>{fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="比较方式" value={condition.operator} onChange={(event) => onChange(changeOperator(condition, event.target.value, field))}>{operatorOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {numeric && condition.operator === 'between' && isNumberRange(condition.value) ? <div className="condition-range"><input aria-label="条件起点" type="number" value={condition.value.min} onChange={(event) => onChange({ ...condition, value: { ...condition.value, min: Number(event.target.value) } })} /><span>至</span><input aria-label="条件终点" type="number" value={condition.value.max} onChange={(event) => onChange({ ...condition, value: { ...condition.value, max: Number(event.target.value) } })} /></div> : numeric ? <input aria-label="条件数值" type="number" value={typeof condition.value === 'number' ? condition.value : ''} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) } as PredicateCondition)} /> : enumField && typeof condition.value === 'string' ? <select aria-label="条件枚举值" value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value } as PredicateCondition)}>{(field.enumValues ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select> : <span className="boolean-value">{condition.operator === 'isTrue' ? '是' : '否'}</span>}
      <button className="icon-button condition-remove" aria-label="移除此条件" onClick={onRemove}>×</button>
    </div>
  );
}

function changeOperator(condition: PredicateCondition, operator: string, field: RuleField): PredicateCondition {
  if (field.type === 'number') return operator === 'between'
    ? { kind: 'predicate', fieldId: field.id, operator: 'between', value: { min: field.min ?? 0, max: field.max ?? 100 } }
    : { kind: 'predicate', fieldId: field.id, operator: operator as 'eq' | 'gt' | 'gte' | 'lt' | 'lte', value: typeof condition.value === 'number' ? condition.value : field.min ?? 0 };
  if (field.type === 'enum') return { kind: 'predicate', fieldId: field.id, operator: operator as 'eq' | 'notEq', value: field.enumValues?.[0] ?? '' };
  return { kind: 'predicate', fieldId: field.id, operator: operator as 'isTrue' | 'isFalse', value: operator === 'isTrue' };
}

function isNumberRange(value: PredicateCondition['value']): value is { min: number; max: number } {
  return typeof value === 'object' && value !== null && 'min' in value && 'max' in value;
}
