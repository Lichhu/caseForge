export type SceneTag =
  | 'positive'
  | 'negative'
  | 'exception'
  | 'boundary'
  | 'permission'
  | 'e2e'
  | 'api'
  | 'ui'
  | 'concurrency';

export type TestDimension = 'functional' | 'interface' | 'ui' | 'data' | 'nonFunctional';

export type GroupingStrategy = 'flat' | 'bySystem' | 'byModule' | 'byScenarioType' | 'byPriority';

export type CaseNodeKind =
  | 'root'
  | 'system'
  | 'module'
  | 'requirement'
  | 'case'
  | 'case_title'
  | 'case_condition'
  | 'case_step'
  | 'case_expected'
  | 'scenario'
  | 'section'
  | 'condition'
  | 'step'
  | 'expectation'
  | 'metadata';

export type CaseNature = '正向' | '反向';

export type CasePriority = '高' | '中' | '低';

export const DEFAULT_CASE_PRIORITY: CasePriority = '高';

export interface CaseNodeMetadata {
  /** 案例性质：正向 / 反向 */
  caseNature?: CaseNature;
  /** 优先级：高 / 中 / 低，默认高 */
  priority?: CasePriority;
  caseType?: string;
  source?: string;
  knowledgeBaseIds?: string[];
}

export interface CaseTreeNode {
  id: string;
  title: string;
  kind: CaseNodeKind;
  children: CaseTreeNode[];
  collapsed?: boolean;
  metadata?: CaseNodeMetadata;
}

export interface ConstraintInput {
  scenarioTags: SceneTag[];
  testDimensions: TestDimension[];
  grouping: GroupingStrategy;
  knowledgeBaseIds: string[];
  naturalLanguage: string;
  featureInstructions: FeatureInstruction[];
}

export interface FeatureInstruction {
  moduleId: string;
  system: string;
  featureName: string;
  instruction: string;
}

export interface RequirementModule {
  id: string;
  system: string;
  name: string;
  source: string;
  description: string;
  rules: string[];
  interactions: string[];
}

export interface RequirementAnalysis {
  requirementId: string;
  requirementName: string;
  businessScope: string;
  summary: string;
  modules: RequirementModule[];
  risks: string[];
}

export interface RequirementDocument {
  rawText: string;
  fileName?: string;
  structuredMarkdown: string;
  analysis: RequirementAnalysis;
  updatedAt: string;
}

export interface ConstraintInstruction {
  id: string;
  projectId: string;
  input: ConstraintInput;
  /** @deprecated 案例生成不再使用，仅兼容旧库记录 */
  markdown?: string;
  createdAt: string;
}

/** Mind Elixir 思维导图摘要（画布「摘要」连线标注） */
export interface MindMapSummary {
  id: string;
  label: string;
  parent: string;
  start: number;
  end: number;
  style?: {
    stroke?: string;
    labelColor?: string;
  };
}

/** 案例树节点之外的思维导图扩展数据（摘要、连线等） */
export interface MindMapExtras {
  summaries?: MindMapSummary[];
}

export interface GenerationRun {
  id: string;
  projectId: string;
  constraintId?: string;
  prompt: string;
  model: string;
  tree: CaseTreeNode;
  /** 思维导图摘要等扩展数据，与 tree 一并保存 */
  mindMapExtras?: MindMapExtras;
  /** 本 run 案例树覆盖的测试要点 ID（多次生成会累积合并） */
  sourceTestPointIds?: string[];
  createdAt: string;
}

export interface CaseForgeProject {
  id: string;
  title: string;
  description: string;
  document?: RequirementDocument;
  constraints: ConstraintInstruction[];
  runs: GenerationRun[];
  createdAt: string;
  updatedAt: string;
}

export * from './case-tree';
export * from './api-test';
export * from './platform';
