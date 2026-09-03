<template>
  <aside class="project-sidebar">
    <div class="project-section-title">
      <a-select
        class="module-select"
        value="project"
        :bordered="false"
        :options="moduleOptions"
        aria-label="管理模块"
        @change="handleModuleChange"
      />
      <span>以需求为维度，手动新建项目</span>
    </div>

    <div class="project-action-row action-toolbar action-toolbar--block">
      <a-button type="primary" block @click="onNewProject">
        <template #icon><PlusOutlined /></template>
        新建项目
      </a-button>
      <a-button @click="toggleDeleteMode">
        {{ deleteMode ? '退出' : '删除' }}
      </a-button>
    </div>

    <div class="project-filter-row">
      <a-input
        v-model:value="keyword"
        class="project-search"
        allow-clear
        :placeholder="isApiPlatform ? '搜索需求编号 / 需求名 / 交易码' : '搜索需求编号或需求名称'"
      >
        <template #prefix><SearchOutlined /></template>
      </a-input>
      <div class="filter-icon-wrap">
        <button
          type="button"
          class="filter-icon-btn"
          :class="{ active: Boolean(selectedMonth) }"
          aria-label="筛选年月"
        >
          <CalendarOutlined />
        </button>
        <!-- 透明日期选择器覆盖图标按钮：点击直接弹年月面板 -->
        <a-date-picker
          v-model:value="selectedMonth"
          class="filter-picker-overlay"
          picker="month"
          value-format="YYYY-MM"
          popup-class-name="project-month-popup"
          input-read-only
          placeholder="筛选年月"
          @change="handleMonthChange"
        />
      </div>
    </div>

    <div v-if="selectedMonth" class="project-month-chip">
      <span>{{ selectedMonth }} · {{ monthCaseCount }} 条案例</span>
      <button type="button" aria-label="清除年月筛选" @click="clearMonthFilter">
        <CloseOutlined />
      </button>
    </div>

    <div v-if="deleteMode" class="project-batch-bar action-toolbar action-toolbar--compact">
      <a-checkbox
        :checked="allFilteredSelected"
        :indeterminate="selectionIndeterminate"
        :disabled="!projectList.length"
        @change="toggleSelectAll"
      >
        全选
      </a-checkbox>
      <span>已选 {{ selectedProjectIds.length }} 项</span>
      <a-button
        size="small"
        danger
        :disabled="!selectedProjectIds.length"
        :loading="deleting"
        @click="deleteSelectedProjects([...selectedProjectIds])"
      >
        删除
      </a-button>
    </div>

    <div class="project-list-shell">
      <div class="project-list">
        <a-spin :spinning="listLoading">
          <div
            v-for="project in projectList"
            :key="project.id"
            class="project-item"
            :class="{ active: project.id === activeProjectId, batch: deleteMode }"
            role="button"
            tabindex="0"
            @click="handleProjectClick(project.id)"
            @keydown.enter.prevent="handleProjectClick(project.id)"
            @keydown.space.prevent="handleProjectClick(project.id)"
          >
            <a-checkbox
              v-if="deleteMode"
              class="project-check"
              :checked="selectedProjectIdSet.has(project.id)"
              :disabled="project.isClaimedFromPlatform"
              @click.stop
              @change="toggleProjectSelection(project.id, $event)"
            />
            <div class="project-main">
              <!-- 标题用纯 CSS 单行省略 + 外层 Tooltip：a-typography-text 的 -->
              <!-- :ellipsis="{ tooltip }" 会禁用 CSS 省略并走 ResizeObserver+rAF -->
              <!-- JS 测量，临界条数下滚动条变化会引发测量-重排振荡（列表抖动） -->
              <a-tooltip :title="cleanProjectTitle(project.title)">
                <span class="project-title">{{ cleanProjectTitle(project.title) }}</span>
              </a-tooltip>
              <span v-if="project.requirementNo" class="project-requirement">
                {{ project.requirementNo }} · {{ project.caseCount }} 条案例
              </span>
              <span v-else class="project-requirement">{{ project.caseCount }} 条案例</span>
            </div>
            <button
              v-if="!deleteMode"
              class="project-edit"
              :disabled="saving"
              aria-label="编辑项目"
              @click.stop="openEditProject(project)"
            >
              <EditOutlined />
            </button>
            <a-tooltip
              v-if="deleteMode"
              :title="project.isClaimedFromPlatform ? '该项目由需求管理平台认领创建，无法删除' : ''"
            >
              <button
                class="project-delete"
                :disabled="deleting || project.isClaimedFromPlatform"
                aria-label="删除项目"
                @click.stop="!project.isClaimedFromPlatform && deleteSingleProject(project.id)"
              >
                <DeleteOutlined />
              </button>
            </a-tooltip>
          </div>
          <a-empty v-if="!projectList.length && !listLoading" class="project-empty" description="暂无匹配项目" />
        </a-spin>
      </div>

      <div v-if="listTotal > 0" class="project-list-pagination">
        <span class="project-page-total">共 {{ listTotal }} 项</span>
        <div class="project-pagination-nav">
          <button
            type="button"
            class="project-page-nav"
            :disabled="listPage <= 1 || listLoading"
            aria-label="上一页"
            @click="goPrevPage"
          >
            ‹
          </button>
          <span class="project-page-indicator">{{ listPage }}/{{ totalPages }}</span>
          <button
            type="button"
            class="project-page-nav"
            :disabled="listPage >= totalPages || listLoading"
            aria-label="下一页"
            @click="goNextPage"
          >
            ›
          </button>
        </div>
        <a-select
          size="small"
          class="project-page-size"
          :value="listPageSize"
          :options="pageSizeSelectOptions"
          aria-label="每页条数"
          @change="handlePageSizeSelect"
        />
      </div>
    </div>

    <a-modal
      v-model:open="createModalOpen"
      :title="isApiPlatform ? '新建项目' : '新建需求项目'"
      ok-text="创建"
      cancel-text="取消"
      :confirm-loading="creating"
      @ok="submitCreateProject"
    >
      <a-form layout="vertical">
        <a-form-item label="需求编号" required>
          <a-input
            v-model:value="createForm.requirementNo"
            maxlength="64"
            placeholder="XQ2026-0818-01"
          />
        </a-form-item>
        <a-form-item label="需求名称" required>
          <a-input v-model:value="createForm.title" maxlength="120" placeholder="请输入需求名称" />
        </a-form-item>
        <a-form-item label="项目描述">
          <a-textarea
            v-model:value="createForm.description"
            maxlength="800"
            :rows="3"
            placeholder="可选，补充需求说明"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="editModalOpen"
      title="编辑需求项目"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="submitEditProject"
    >
      <a-form layout="vertical">
        <a-form-item label="需求编号" required>
          <a-input
            v-model:value="editForm.requirementNo"
            maxlength="64"
            placeholder="XQ2026-0818-01"
            disabled
          />
        </a-form-item>
        <a-form-item label="需求名称" required>
          <a-input
            v-model:value="editForm.title"
            maxlength="120"
            placeholder="请输入需求名称"
          />
        </a-form-item>
        <a-form-item label="项目描述">
          <a-textarea v-model:value="editForm.description" maxlength="800" :rows="4" placeholder="请输入项目描述" />
        </a-form-item>
      </a-form>
    </a-modal>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  CalendarOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { PROJECT_PAGE_SIZE_OPTIONS } from '@case-forge/shared';
import { useCaseForgeStore } from '@/stores/caseForge';
import { useApiTestStore } from '@/stores/apiTest';
import type { ProjectListItem } from '@/api/client';

const props = withDefaults(
  defineProps<{
    platform?: 'case-forge' | 'api-test';
  }>(),
  { platform: 'case-forge' },
);

const caseStore = useCaseForgeStore();
const apiStore = useApiTestStore();
const router = useRouter();
const isApiPlatform = computed(() => props.platform === 'api-test');

/** 管理模块下拉：案例管理待后续开发 */
const moduleOptions = [
  { value: 'requirement', label: '需求管理' },
  { value: 'project', label: '项目管理' },
  { value: 'case', label: '案例管理（待开发）', disabled: true },
];

function handleModuleChange(value: string) {
  if (value === 'requirement') {
    router.push({ path: '/api-test/requirement' });
  }
  // 项目管理即当前侧栏列表，无需跳转
}
const projectList = computed(() =>
  isApiPlatform.value ? apiStore.projects : caseStore.projects,
);
const keyword = ref('');
const selectedMonth = ref('');
const listLoading = ref(false);
const deleteMode = ref(false);
const deleting = ref(false);
const saving = ref(false);
const creating = ref(false);
const selectedProjectIds = ref<string[]>([]);
const createModalOpen = ref(false);
const editModalOpen = ref(false);
const editingProjectId = ref('');
const createForm = ref({
  requirementNo: '',
  title: '',
  description: '',
});
const editForm = ref({
  requirementNo: '',
  title: '',
  description: '',
});

const REQUIREMENT_NO_PATTERN = /^XQ\d{4}-\d{4}-\d{2}$/i;

const selectedProjectIdSet = computed(() => new Set(selectedProjectIds.value));

const activeProjectId = computed(() =>
  isApiPlatform.value ? apiStore.activeProjectId : caseStore.activeProject?.id,
);

const listPage = computed(() =>
  isApiPlatform.value ? apiStore.projectListPage : caseStore.projectListPage,
);
const listPageSize = computed(() =>
  isApiPlatform.value ? apiStore.projectListPageSize : caseStore.projectListPageSize,
);
const listTotal = computed(() =>
  isApiPlatform.value ? apiStore.projectListTotal : caseStore.projectListTotal,
);
const monthCaseCount = computed(() => isApiPlatform.value ? apiStore.projectListCaseCount : caseStore.projectListCaseCount);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(listTotal.value / listPageSize.value) || 1),
);
const pageSizeSelectOptions = computed(() =>
  PROJECT_PAGE_SIZE_OPTIONS.map((value) => ({
    label: String(value),
    value,
  })),
);

const currentPageProjectIds = computed(() => projectList.value.map((project) => project.id));
const selectedFilteredCount = computed(
  () => currentPageProjectIds.value.filter((projectId) => selectedProjectIdSet.value.has(projectId)).length,
);
const allFilteredSelected = computed(
  () => Boolean(currentPageProjectIds.value.length) && selectedFilteredCount.value === currentPageProjectIds.value.length,
);
const selectionIndeterminate = computed(
  () => selectedFilteredCount.value > 0 && selectedFilteredCount.value < currentPageProjectIds.value.length,
);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

const skipKeywordWatch = ref(true);

async function reloadProjects(options?: {
  page?: number;
  size?: number;
  keyword?: string;
  month?: string;
  resetPage?: boolean;
}) {
  listLoading.value = true;
  try {
    if (isApiPlatform.value) {
      await apiStore.refreshProjects(options);
    } else {
      await caseStore.refreshProjects(options);
    }
  } finally {
    listLoading.value = false;
  }
}

function handleMonthChange(value: string | null) {
  void reloadProjects({ page: 1, month: value || '' });
}

function clearMonthFilter() {
  selectedMonth.value = '';
  void reloadProjects({ page: 1, month: '' });
}

function goPrevPage() {
  if (listPage.value <= 1 || listLoading.value) return;
  void reloadProjects({ page: listPage.value - 1 });
}

function goNextPage() {
  if (listPage.value >= totalPages.value || listLoading.value) return;
  void reloadProjects({ page: listPage.value + 1 });
}

function handlePageSizeSelect(value: number) {
  void reloadProjects({ page: 1, size: value });
}

watch(keyword, (value) => {
  if (skipKeywordWatch.value) {
    return;
  }
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    void reloadProjects({ page: 1, keyword: value.trim() });
  }, 300);
});

onMounted(() => {
  keyword.value = isApiPlatform.value ? apiStore.projectListKeyword : caseStore.projectListKeyword;
  selectedMonth.value = isApiPlatform.value ? apiStore.projectListMonth : caseStore.projectListMonth;
  skipKeywordWatch.value = false;
});

onBeforeUnmount(() => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }
});

watch(
  () => projectList.value.map((project) => project.id).join(','),
  () => {
    const existingIds = new Set(projectList.value.map((project) => project.id));
    selectedProjectIds.value = selectedProjectIds.value.filter((projectId) => existingIds.has(projectId));
  },
);

function onNewProject() {
  createForm.value = {
    requirementNo: '',
    title: '',
    description: '',
  };
  createModalOpen.value = true;
}

function isValidRequirementNo(value: string) {
  return REQUIREMENT_NO_PATTERN.test(value.trim());
}

async function submitCreateProject() {
  const requirementNo = createForm.value.requirementNo.trim();
  const title = createForm.value.title.trim();
  if (!requirementNo) {
    message.warning('请输入需求编号');
    return Promise.reject();
  }
  if (!isValidRequirementNo(requirementNo)) {
    message.warning('需求编号格式须为 XQxxxx-xxxx-xx');
    return Promise.reject();
  }
  if (!title) {
    message.warning('请输入需求名称');
    return Promise.reject();
  }
  if (creating.value) {
    return Promise.reject();
  }
  creating.value = true;
  try {
    if (isApiPlatform.value) {
      await apiStore.newProject({
        requirementNo,
        title,
        description: createForm.value.description.trim(),
      });
    } else {
      await caseStore.newProject({
        requirementNo,
        title,
        description: createForm.value.description.trim(),
      });
    }
    createModalOpen.value = false;
    message.success(isApiPlatform.value ? '项目已创建' : '需求项目已创建');
    skipKeywordWatch.value = true;
    keyword.value = isApiPlatform.value ? apiStore.projectListKeyword : caseStore.projectListKeyword;
    skipKeywordWatch.value = false;
  } catch (error) {
    message.error((error as Error)?.message || '创建失败');
    return Promise.reject();
  } finally {
    creating.value = false;
  }
}

function toggleDeleteMode() {
  deleteMode.value = !deleteMode.value;
  selectedProjectIds.value = [];
}

function handleProjectClick(projectId: string) {
  if (deleteMode.value) {
    const project = projectList.value.find((item) => item.id === projectId);
    if (project?.isClaimedFromPlatform) return;
    setProjectSelected(projectId, !selectedProjectIds.value.includes(projectId));
    return;
  }
  if (isApiPlatform.value) {
    void apiStore.selectProject(projectId, false);
    return;
  }
  void caseStore.selectProject(projectId);
}

function toggleProjectSelection(projectId: string, event: { target: { checked: boolean } }) {
  setProjectSelected(projectId, event.target.checked);
}

function toggleSelectAll(event: { target: { checked: boolean } }) {
  if (event.target.checked) {
    const selectableIds = currentPageProjectIds.value.filter(
      (projectId) => !projectList.value.find((p) => p.id === projectId)?.isClaimedFromPlatform,
    );
    selectedProjectIds.value = [...new Set([...selectedProjectIds.value, ...selectableIds])];
    return;
  }
  const pageIds = new Set(currentPageProjectIds.value);
  selectedProjectIds.value = selectedProjectIds.value.filter((projectId) => !pageIds.has(projectId));
}

function setProjectSelected(projectId: string, selected: boolean) {
  if (selected) {
    if (!selectedProjectIds.value.includes(projectId)) {
      selectedProjectIds.value = [...selectedProjectIds.value, projectId];
    }
    return;
  }
  selectedProjectIds.value = selectedProjectIds.value.filter((id) => id !== projectId);
}

async function deleteSingleProject(projectId: string) {
  if (deleting.value) return;
  const project = projectList.value.find((item) => item.id === projectId);
  if (project?.isClaimedFromPlatform) return;
  const projectName = project ? cleanProjectTitle(project.title) : '该项目';
  confirmDeleteProject(`确定删除「${projectName}」？删除后不可恢复。`, async () => {
    deleting.value = true;
    try {
      if (isApiPlatform.value) {
        await apiStore.removeProject(projectId);
      } else {
        await caseStore.removeProject(projectId);
      }
      setProjectSelected(projectId, false);
    } catch (error) {
      message.error((error as Error)?.message || '删除失败');
    } finally {
      deleting.value = false;
    }
  });
}

async function deleteSelectedProjects(projectIds: string[]) {
  const ids = [...new Set(projectIds)];
  if (!ids.length || deleting.value) return;
  confirmDeleteProject(`确定删除选中的 ${ids.length} 个项目？删除后不可恢复。`, async () => {
    deleting.value = true;
    try {
      if (isApiPlatform.value) {
        await apiStore.removeProjects(ids);
      } else {
        await caseStore.removeProjects(ids);
      }
      selectedProjectIds.value = [];
      if (!projectList.value.length && listTotal.value === 0) {
        deleteMode.value = false;
      }
    } catch (error) {
      message.error((error as Error)?.message || '删除失败');
    } finally {
      deleting.value = false;
    }
  });
}

function confirmDeleteProject(content: string, onOk: () => Promise<void>) {
  Modal.confirm({
    title: '删除项目',
    content,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    centered: true,
    onOk,
  });
}

function openEditProject(project: ProjectListItem) {
  editingProjectId.value = project.id;
  editForm.value = {
    requirementNo: project.requirementNo || '',
    title: cleanProjectTitle(project.title),
    description: project.description || '',
  };
  editModalOpen.value = true;
}

async function submitEditProject() {
  const title = editForm.value.title.trim();
  if (!title) {
    message.warning('请输入需求名称');
    return Promise.reject();
  }
  if (saving.value || !editingProjectId.value) {
    return Promise.reject();
  }
  saving.value = true;
  try {
    if (isApiPlatform.value) {
      await apiStore.updateProjectInfo(editingProjectId.value, {
        title,
        description: editForm.value.description.trim(),
      });
    } else {
      await caseStore.updateProjectInfo(editingProjectId.value, {
        title,
        description: editForm.value.description.trim(),
      });
    }
    editModalOpen.value = false;
    message.success('项目信息已保存');
  } catch (error) {
    message.error((error as Error)?.message || '保存失败');
    return Promise.reject();
  } finally {
    saving.value = false;
  }
}

function cleanProjectTitle(title: string) {
  return (
    title
      .replace(/^#+\s*/, '')
      .replace(/^[：:\s·。|]+/, '')
      .replace(/\s+-\s+测试分析$/, '')
      .replace(/\s+-\s+测试案例$/, '')
      .replace(/\.(docx?|md)$/i, '')
      .trim() || '未命名项目'
  );
}

function projectMeta(project: { runCount: number; requirementNo?: string | null }) {
  const requirementNo = project.requirementNo?.trim();
  return requirementNo ? `${requirementNo} · ${project.runCount} 次生成` : `${project.runCount} 次生成`;
}
</script>

<style scoped>
/* 搜索行：输入框占满 + 年月筛选收进图标按钮，避免并排双框 */
.project-filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.project-filter-row .project-search {
  flex: 1;
  min-width: 0;
}

.filter-icon-wrap {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.filter-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #fff;
  color: #667085;
  font-size: 15px;
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    color 0.12s ease,
    background-color 0.12s ease;
}

.filter-icon-wrap:hover .filter-icon-btn {
  border-color: var(--cf-brand);
  color: var(--cf-brand);
}

.filter-icon-btn.active {
  border-color: var(--cf-brand);
  background: #fff5f6;
  color: var(--cf-brand);
}

/* 透明日期选择器覆盖图标按钮，点击直接弹出年月面板 */
.filter-picker-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

/* 已选年月的轻量提示条，可一键清除 */
.project-month-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -6px;
  padding: 3px 8px;
  border: 1px dashed #e4e7ec;
  border-radius: 4px;
  background: #f9fafb;
  color: #667085;
  font-size: 11px;
}

.project-month-chip button {
  display: inline-flex;
  align-items: center;
  padding: 0 2px;
  border: none;
  background: none;
  color: #98a2b3;
  font-size: 10px;
  cursor: pointer;
  transition: color 0.12s ease;
}

.project-month-chip button:hover {
  color: var(--cf-brand);
}

/* 管理模块下拉：替代原标题文本，保持标题字号与字重 */
.module-select {
  width: 100%;
  margin-left: -8px;
}

.module-select :deep(.ant-select-selector) {
  padding-inline: 8px !important;
  border-radius: 6px;
  transition: background-color 0.12s ease;
}

.module-select :deep(.ant-select-selector:hover) {
  background: #f5f6f8;
}

.module-select :deep(.ant-select-selection-item) {
  color: #1d2939;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.project-list :deep(.ant-spin-nested-loading),
.project-list :deep(.ant-spin-container) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.project-list-pagination {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding: 8px 0 4px;
  border-top: 1px solid #eef2f6;
}

.project-page-total {
  flex-shrink: 0;
  color: #667085;
  font-size: 11px;
  line-height: 24px;
  white-space: nowrap;
}

.project-page-size {
  width: 52px;
}

.project-page-size :deep(.ant-select-selector) {
  height: 24px !important;
  padding-inline: 4px !important;
}

.project-page-size :deep(.ant-select-selection-item) {
  line-height: 22px !important;
}

.project-pagination-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
}

.project-page-nav {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #d0d5dd;
  border-radius: 5px;
  background: #fff;
  color: #344054;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    color 0.12s ease,
    background-color 0.12s ease;
}

.project-page-nav:hover:not(:disabled) {
  border-color: var(--cf-brand);
  color: var(--cf-brand);
  background: #fff5f6;
}

.project-page-nav:disabled {
  border-color: #eaecf0;
  background: #f9fafb;
  color: #d0d5dd;
  cursor: not-allowed;
}

.project-page-indicator {
  flex-shrink: 0;
  min-width: 36px;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  text-align: center;
  user-select: none;
}
</style>
