<template>
  <aside
    class="project-sidebar"
    :class="{
      'is-collapsed': sidebarCollapsed,
      'is-api-platform': isApiPlatform,
      'is-resizing': sidebarResizing,
      'is-revealing': sidebarRevealing,
    }"
    :style="sidebarStyle"
  >
    <div v-if="sidebarCollapsed" class="project-sidebar-projects">
      <a-popover
        v-for="project in projectList"
        :key="project.id"
        trigger="hover"
        placement="right"
        :overlay-style="{ width: '270px' }"
        :mouse-enter-delay="0.05"
        :mouse-leave-delay="0.15"
      >
        <button
          type="button"
          class="project-sidebar-shortcut"
          :class="{ active: project.id === activeProjectId }"
          :title="cleanProjectTitle(project.title)"
          :aria-label="`切换到需求：${cleanProjectTitle(project.title)}`"
          @click="selectQuickProject(project.id)"
        >
          {{ projectShortcutLabel(project) }}
        </button>
        <template #content>
          <div class="project-shortcut-info">
            <strong>{{ cleanProjectTitle(project.title) }}</strong>
            <span>{{ project.requirementNo || "无需求编号" }}</span>
            <span v-if="project.applicationName">
              归属应用：{{ project.applicationName }}
            </span>
            <span>{{ project.caseCount }} 条案例</span>
          </div>
        </template>
      </a-popover>
    </div>
    <div
      v-if="!isApiPlatform && !deleteMode"
      class="project-action-row action-toolbar action-toolbar--block"
    >
      <a-button type="primary" block @click="onNewProject">
        <template #icon><PlusOutlined /></template>
        新建项目
      </a-button>
      <a-button @click="toggleDeleteMode">
        批量删除
      </a-button>
    </div>

    <div class="project-filter-panel">
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

      <div v-if="isApiPlatform" class="project-status-tabs" role="tablist" aria-label="需求状态筛选">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="project-status-tab"
          :class="{ active: requirementStatus === tab.value }"
          :aria-selected="requirementStatus === tab.value"
          @click="handleRequirementStatusChange(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="selectedMonth" class="project-month-chip">
        <span>{{ selectedMonth }} · {{ monthCaseCount }} 条案例</span>
        <button type="button" aria-label="清除年月筛选" @click="clearMonthFilter">
          <CloseOutlined />
        </button>
      </div>
    </div>

    <div v-if="deleteMode" class="project-batch-bar action-toolbar action-toolbar--compact">
      <div class="project-batch-summary">
        <a-checkbox
          :checked="allFilteredSelected"
          :indeterminate="selectionIndeterminate"
          :disabled="!projectList.length"
          aria-label="全选当前页项目"
          @change="toggleSelectAll"
        />
      </div>
      <div class="project-batch-actions">
        <a-button size="small" @click="toggleDeleteMode">退出</a-button>
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
    </div>

    <div class="project-list-shell">
      <div class="project-list">
        <a-spin :spinning="listLoading">
          <div
            v-for="project in projectList"
            :key="project.id"
            class="project-item"
            :class="{
              active: project.id === activeProjectId,
              batch: deleteMode,
              'is-completed': isApiPlatform && project.requirementStatus === 'completed',
            }"
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
              <div v-if="isApiPlatform" class="project-card-kicker">
                <span class="project-code">{{ project.requirementNo || "需求编号待补充" }}</span>
                <span
                  v-if="project.requirementStatus"
                  class="project-status-badge"
                  :class="`status-${project.requirementStatus}`"
                >
                  {{ requirementStatusLabel(project.requirementStatus) }}
                </span>
              </div>
              <a-tooltip :title="cleanProjectTitle(project.title)">
                <span class="project-title">{{ cleanProjectTitle(project.title) }}</span>
              </a-tooltip>
              <div class="project-meta-row">
                <span v-if="!isApiPlatform && project.requirementNo" class="project-requirement-no">
                  {{ project.requirementNo }}
                </span>
                <span v-if="isApiPlatform && project.applicationName" class="project-application-name">
                  {{ project.applicationName }}
                </span>
                <span class="project-case-badge">{{ project.caseCount }} 个案例</span>
              </div>
              <div v-if="isApiPlatform && project.requirementCreatedAt" class="project-time-row">
                <span class="project-time">创建于 {{ formatProjectTime(project.requirementCreatedAt) }}</span>
                <button
                  v-if="project.requirementId && project.requirementStatus === 'testing'"
                  type="button"
                  class="project-complete-btn"
                  :disabled="saving"
                  @click.stop="markRequirementCompleted(project)"
                >
                  标记已完成
                </button>
                <button
                  v-else-if="project.requirementId && project.requirementStatus === 'returned'"
                  type="button"
                  class="project-complete-btn"
                  :disabled="saving"
                  @click.stop="restoreRequirementTesting(project)"
                >
                  恢复为测试中
                </button>
              </div>
            </div>
            <button
              v-if="!deleteMode && !isApiPlatform"
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
      v-if="!isApiPlatform"
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
    <div
      class="project-sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      :aria-label="`调整${sidebarModuleLabel}侧栏宽度`"
      :aria-valuemin="40"
      :aria-valuemax="SIDEBAR_MAX_WIDTH"
      :aria-valuenow="sidebarCollapsed ? 40 : sidebarWidth"
      tabindex="0"
      @pointerdown="startSidebarResize"
      @keydown="handleSidebarResizeKeydown"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { setRequirementStatus } from '@/api/requirementPlatform';

const props = withDefaults(
  defineProps<{
    platform?: 'case-forge' | 'api-test';
  }>(),
  { platform: 'case-forge' },
);

const caseStore = useCaseForgeStore();
const apiStore = useApiTestStore();
const isApiPlatform = computed(() => props.platform === 'api-test');
const sidebarModuleLabel = computed(() =>
  isApiPlatform.value ? '需求接口测试' : '项目管理',
);
const SIDEBAR_DEFAULT_WIDTH = 292;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_COLLAPSE_THRESHOLD = 250;
const SIDEBAR_EXPAND_DRAG_DISTANCE = 12;
const SIDEBAR_REVEAL_DELAY = 160;
const sidebarStorageKey = computed(
  () => `case-forge:${props.platform}-sidebar-collapsed`,
);
const sidebarWidthStorageKey = computed(
  () => `case-forge:${props.platform}-sidebar-width`,
);
const sidebarCollapsed = ref(
  localStorage.getItem(sidebarStorageKey.value) === '1',
);
const savedSidebarWidthValue = localStorage.getItem(
  sidebarWidthStorageKey.value,
);
const savedSidebarWidth = Number(savedSidebarWidthValue);
const sidebarWidth = ref(
  savedSidebarWidthValue !== null && Number.isFinite(savedSidebarWidth)
    ? Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, savedSidebarWidth),
      )
    : SIDEBAR_DEFAULT_WIDTH,
);
const sidebarResizing = ref(false);
const sidebarRevealing = ref(false);
const isMobileViewport = ref(
  typeof window !== 'undefined' && window.innerWidth <= 820,
);
const sidebarStyle = computed(() =>
  isMobileViewport.value
    ? {}
    : { width: sidebarCollapsed.value ? '40px' : `${sidebarWidth.value}px` },
);

let sidebarRefreshFrame: number | undefined;
watch([sidebarCollapsed, sidebarWidth], ([collapsed, width]) => {
  localStorage.setItem(sidebarStorageKey.value, collapsed ? '1' : '0');
  localStorage.setItem(sidebarWidthStorageKey.value, String(width));
  if (sidebarRefreshFrame != null) return;
  sidebarRefreshFrame = window.requestAnimationFrame(() => {
    sidebarRefreshFrame = undefined;
    window.dispatchEvent(new Event('resize'));
  });
});

let stopSidebarResize: (() => void) | null = null;
let sidebarRevealTimer: number | undefined;

function revealSidebarContent() {
  sidebarRevealing.value = true;
  if (sidebarRevealTimer != null) window.clearTimeout(sidebarRevealTimer);
  sidebarRevealTimer = window.setTimeout(() => {
    sidebarRevealTimer = undefined;
    sidebarRevealing.value = false;
  }, SIDEBAR_REVEAL_DELAY);
}

function maxSidebarWidth() {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 360),
  );
}

function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0 || isMobileViewport.value) return;
  event.preventDefault();
  stopSidebarResize?.();
  sidebarResizing.value = true;
  document.body.classList.add("project-sidebar-resizing");
  const sidebar = (event.currentTarget as HTMLElement).closest(
    ".project-sidebar",
  ) as HTMLElement;
  const sidebarLeft = sidebar.getBoundingClientRect().left;
  const startedCollapsed = sidebarCollapsed.value;
  const dragStartX = event.clientX;
  let expandedDuringDrag = !startedCollapsed;

  const onMove = (moveEvent: PointerEvent) => {
    if (
      startedCollapsed &&
      !expandedDuringDrag &&
      moveEvent.clientX - dragStartX < SIDEBAR_EXPAND_DRAG_DISTANCE
    ) {
      return;
    }
    if (startedCollapsed && !expandedDuringDrag) {
      expandedDuringDrag = true;
      revealSidebarContent();
      sidebarCollapsed.value = false;
      sidebarWidth.value = Math.min(maxSidebarWidth(), sidebarWidth.value);
      return;
    }
    sidebarCollapsed.value = false;
    const desiredWidth = moveEvent.clientX - sidebarLeft;
    sidebarWidth.value = Math.min(
      maxSidebarWidth(),
      Math.max(SIDEBAR_MIN_WIDTH, desiredWidth),
    );
  };
  const finish = () => {
    if (
      !startedCollapsed &&
      sidebarWidth.value < SIDEBAR_COLLAPSE_THRESHOLD
    ) {
      if (sidebarRevealTimer != null) window.clearTimeout(sidebarRevealTimer);
      sidebarRevealTimer = undefined;
      sidebarRevealing.value = false;
      sidebarCollapsed.value = true;
    } else if (!sidebarCollapsed.value) {
      sidebarWidth.value = Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth.value);
    }
    sidebarResizing.value = false;
    document.body.classList.remove("project-sidebar-resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    stopSidebarResize = null;
  };
  stopSidebarResize = finish;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", finish, { once: true });
}

function handleSidebarResizeKeydown(event: KeyboardEvent) {
  if (event.key === "Home") {
    event.preventDefault();
    if (sidebarRevealTimer != null) window.clearTimeout(sidebarRevealTimer);
    sidebarRevealTimer = undefined;
    sidebarRevealing.value = false;
    sidebarCollapsed.value = true;
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  if (event.key === "ArrowRight") {
    if (sidebarCollapsed.value) {
      revealSidebarContent();
      sidebarCollapsed.value = false;
      sidebarWidth.value = SIDEBAR_MIN_WIDTH;
      return;
    }
    sidebarWidth.value = Math.min(
      maxSidebarWidth(),
      sidebarWidth.value + 16,
    );
    return;
  }
  const nextWidth = sidebarWidth.value - 16;
  if (nextWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
    sidebarCollapsed.value = true;
    return;
  }
  sidebarWidth.value = Math.max(SIDEBAR_MIN_WIDTH, nextWidth);
}

const projectList = computed(() =>
  isApiPlatform.value ? apiStore.projects : caseStore.projects,
);
const keyword = ref('');
const selectedMonth = ref('');
const requirementStatus = ref(
  isApiPlatform.value
    ? apiStore.projectListRequirementStatus || 'testing'
    : 'testing',
);

/** 需求状态筛选 Tab（结构改版：由下拉改为顶部 Tab） */
const statusTabs = [
  { value: 'testing', label: '测试中' },
  { value: 'completed', label: '已完成' },
  { value: 'returned', label: '已打回' },
  { value: 'all', label: '全部' },
];

const requirementStatusLabels: Record<string, string> = {
  testing: '测试中',
  pending_dispatch: '待分发',
  pending_claim: '待受理',
  completed: '已完成',
  returned: '已打回',
};

function requirementStatusLabel(status: string) {
  return requirementStatusLabels[status] || status;
}

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
  requirementStatus?: string;
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

function handleRequirementStatusChange(value: string) {
  requirementStatus.value = value;
  void reloadProjects({ page: 1, requirementStatus: value });
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

function updateSidebarViewportMode() {
  isMobileViewport.value = window.innerWidth <= 820;
  if (!isMobileViewport.value) {
    sidebarWidth.value = Math.min(maxSidebarWidth(), sidebarWidth.value);
  }
}

onMounted(() => {
  keyword.value = isApiPlatform.value ? apiStore.projectListKeyword : caseStore.projectListKeyword;
  selectedMonth.value = isApiPlatform.value ? apiStore.projectListMonth : caseStore.projectListMonth;
  if (isApiPlatform.value) {
    requirementStatus.value = apiStore.projectListRequirementStatus || 'testing';
  }
  skipKeywordWatch.value = false;
  updateSidebarViewportMode();
  window.addEventListener('resize', updateSidebarViewportMode);
});

onBeforeUnmount(() => {
  stopSidebarResize?.();
  if (sidebarRevealTimer != null) {
    window.clearTimeout(sidebarRevealTimer);
  }
  if (sidebarRefreshFrame != null) {
    window.cancelAnimationFrame(sidebarRefreshFrame);
  }
  window.removeEventListener('resize', updateSidebarViewportMode);
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

watch(
  () => apiStore.projectListRequirementStatus,
  (value) => {
    if (isApiPlatform.value && value) {
      requirementStatus.value = value;
    }
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

function selectQuickProject(projectId: string) {
  deleteMode.value = false;
  handleProjectClick(projectId);
}

function projectShortcutLabel(project: ProjectListItem) {
  const requirementNo = project.requirementNo?.trim();
  if (requirementNo) {
    const parts = requirementNo.split("-").filter(Boolean);
    return parts[1] || parts[parts.length - 1]?.slice(-2) || "需";
  }
  return cleanProjectTitle(project.title).slice(0, 1).toUpperCase() || "需";
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

function formatProjectTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function markRequirementCompleted(project: ProjectListItem) {
  if (!project.requirementId || saving.value) return;
  saving.value = true;
  try {
    await setRequirementStatus(project.requirementId, 'completed');
    message.success('需求已标记为已完成');
    await reloadProjects({ page: listPage.value });
  } catch (error) {
    message.error((error as Error)?.message || '状态更新失败');
  } finally {
    saving.value = false;
  }
}

async function restoreRequirementTesting(project: ProjectListItem) {
  if (!project.requirementId || saving.value) return;
  saving.value = true;
  try {
    await setRequirementStatus(project.requirementId, 'testing');
    message.success('需求已恢复为测试中');
    await reloadProjects({ page: listPage.value, requirementStatus: 'testing' });
    requirementStatus.value = 'testing';
  } catch (error) {
    message.error((error as Error)?.message || '状态更新失败');
  } finally {
    saving.value = false;
  }
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

.project-sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  width: 7px;
  cursor: col-resize;
  outline: none;
  touch-action: none;
}

.project-sidebar-resizer::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
  content: "";
  transition: background-color 0.15s ease;
}

.project-sidebar-resizer:hover::after,
.project-sidebar-resizer:focus-visible::after,
.project-sidebar.is-resizing .project-sidebar-resizer::after {
  background: var(--cf-brand);
}

.project-sidebar.is-collapsed {
  width: 40px;
  padding: 8px 4px;
  gap: 8px;
}

.project-sidebar.is-collapsed
  > :not(.project-sidebar-resizer):not(.project-sidebar-projects) {
  display: none;
}

.project-sidebar-projects {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
  padding: 2px 0 4px;
  overflow-y: auto;
  scrollbar-width: none;
}

.project-sidebar-projects::-webkit-scrollbar {
  display: none;
}

.project-sidebar-shortcut {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fff;
  color: #475467;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.project-sidebar-shortcut:hover {
  border-color: #f1b8c3;
  background: #fff7f8;
  color: var(--cf-brand);
}

.project-sidebar-shortcut.active {
  border-color: var(--cf-brand);
  background: var(--cf-brand);
  color: #fff;
}

.project-shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  color: #667085;
  font-size: 12px;
}

.project-shortcut-info strong {
  overflow: hidden;
  color: #1d2939;
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.project-shortcut-info em {
  margin-top: 2px;
  color: var(--cf-brand);
  font-style: normal;
}

.project-list :deep(.ant-spin-nested-loading),
.project-list :deep(.ant-spin-container) {
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
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

/* ===== 侧栏 2026 UI refresh ===== */
.project-sidebar {
  gap: 10px;
  padding: 14px 12px 12px;
  overflow: visible;
}

.project-sidebar.is-resizing {
  will-change: width;
  transition:
    width 110ms ease-out,
    padding 110ms ease-out,
    gap 110ms ease-out;
}

.project-sidebar.is-revealing
  > :not(.project-sidebar-resizer) {
  visibility: hidden;
}

:global(body.project-sidebar-resizing) {
  cursor: col-resize;
  user-select: none;
}

.project-action-row {
  grid-template-columns: minmax(0, 1fr) 84px;
  gap: 8px;
  margin-top: 2px;
}

.project-action-row :deep(.ant-btn) {
  height: 34px;
  border-radius: 8px;
  font-size: 13px;
}

.project-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #f8f9fb;
}

.project-filter-row {
  gap: 7px;
}

.project-filter-row .project-search {
  height: 34px;
  border-color: #dfe3e8;
  border-radius: 8px;
  background: #fff;
}

.project-search input {
  font-size: 12px;
}

.filter-icon-wrap,
.filter-icon-btn {
  width: 34px;
  height: 34px;
}

.filter-icon-btn {
  border-color: #dfe3e8;
  border-radius: 8px;
}

.project-status-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #eef0f3;
}

.project-status-tab {
  min-width: 0;
  padding: 5px 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #667085;
  font-size: 11px;
  line-height: 1.45;
  text-align: center;
}

.project-status-tab:hover {
  background: rgb(255 255 255 / 65%);
}

.project-status-tab.active {
  border: 0;
  background: #fff;
  color: var(--cf-brand);
  box-shadow: 0 1px 3px rgb(16 24 40 / 12%);
}

.project-month-chip {
  margin: 0;
  padding: 5px 7px;
  border-style: solid;
  border-color: #e4e7ec;
  border-radius: 7px;
  background: #fff;
}

.project-batch-bar {
  min-height: 36px;
  border-radius: 8px;
  background: #f8f9fb;
}

.project-list-shell {
  margin-top: 0;
  padding: 8px 8px 0;
  border: 1px solid #eaecf0;
  border-radius: 12px;
  background: #f8f9fb;
  overflow: hidden;
}

.project-list {
  width: 100%;
  gap: 8px;
  padding: 0 0 8px;
  scrollbar-gutter: auto;
  scrollbar-width: none;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.project-list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.project-item {
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: start;
  gap: 6px;
  box-sizing: border-box;
  padding: 10px 9px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #fff;
  box-shadow: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.project-item.batch {
  grid-template-columns: 20px minmax(0, 1fr) 28px;
}

.project-batch-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.project-batch-bar {
  flex-wrap: wrap;
}

.project-batch-summary {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  min-width: 0;
}

.project-batch-actions :deep(.ant-btn) {
  height: 28px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12px;
}

.project-item:hover:not(.active) {
  border-color: #d0d5dd;
  background: #fff;
  box-shadow: 0 4px 12px rgb(16 24 40 / 6%);
}

.project-item.active {
  border-color: #e7b8c0;
  background: #fff;
  color: #1d2939;
  box-shadow:
    0 0 0 1px rgb(182 15 45 / 10%),
    0 6px 16px rgb(182 15 45 / 8%);
}

.project-main {
  gap: 4px;
  min-height: 0;
}

.project-card-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.project-code {
  overflow: hidden;
  min-width: 0;
  color: #98a2b3;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-status-badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 17px;
}

.project-title-row .project-title,
.project-title {
  display: -webkit-box;
  width: 100%;
  overflow: hidden;
  color: #1d2939 !important;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  text-wrap: pretty;
  white-space: normal;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.project-item.active .project-title {
  color: #8f0b20 !important;
}

.project-meta-row {
  gap: 5px;
  margin-top: 1px;
}

.project-application-name,
.project-case-badge {
  max-width: 100%;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #667085;
  font-size: 10px;
  font-weight: 400;
  line-height: 17px;
  white-space: nowrap;
}

.project-application-name {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
}

.project-case-badge {
  flex-shrink: 0;
  background: #fff5f6;
  color: #a30d27;
}

.project-time-row {
  margin-top: 1px;
}

.project-time {
  font-size: 10px;
}

.project-complete-btn {
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
}

.project-item.is-completed {
  opacity: 0.78;
}

.project-edit,
.project-delete {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}

.project-item.batch .project-delete:not(:disabled) {
  background: #fff1f3;
  color: var(--cf-brand);
}

.project-list-pagination {
  margin-top: 0;
  padding: 8px 2px 7px;
  border-top-color: #e4e7ec;
}

.project-page-total {
  color: #98a2b3;
}

.project-page-nav {
  border-color: #dfe3e8;
  border-radius: 6px;
}

.project-page-indicator {
  color: #667085;
  font-size: 11px;
}

.project-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  min-height: 160px;
}

@media (max-width: 820px) {
  .project-sidebar-resizer {
    display: none;
  }
}
</style>
