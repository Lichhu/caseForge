<template>
  <aside class="project-sidebar">
    <div class="project-section-title">
      <strong>项目管理</strong>
      <span>{{ isApiPlatform ? '以需求为维度，手动新建项目' : '按需求编号或名称检索' }}</span>
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

    <a-input
      v-model:value="keyword"
      class="project-search"
      allow-clear
      :placeholder="isApiPlatform ? '输入需求编号或需求名称' : '输入需求编号/项目名称'"
    >
      <template #prefix><SearchOutlined /></template>
    </a-input>

    <div v-if="deleteMode" class="project-batch-bar action-toolbar action-toolbar--compact">
      <a-checkbox
        :checked="allFilteredSelected"
        :indeterminate="selectionIndeterminate"
        :disabled="!filteredProjects.length"
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

    <div class="project-list">
      <div
        v-for="project in filteredProjects"
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
          @click.stop
          @change="toggleProjectSelection(project.id, $event)"
        />
        <div class="project-main">
          <a-typography-text
            class="project-title"
            :ellipsis="{ tooltip: cleanProjectTitle(project.title) }"
            :content="cleanProjectTitle(project.title)"
          />
          <span v-if="isApiPlatform && project.requirementNo" class="project-requirement">
            {{ project.requirementNo }}
          </span>
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
        <button
          v-if="deleteMode"
          class="project-delete"
          :disabled="deleting"
          aria-label="删除项目"
          @click.stop="deleteSingleProject(project.id)"
        >
          <DeleteOutlined />
        </button>
      </div>
      <a-empty v-if="!filteredProjects.length" class="project-empty" description="暂无匹配项目" />
    </div>

    <a-modal
      v-if="isApiPlatform"
      v-model:open="createModalOpen"
      title="新建项目"
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
      :title="isApiPlatform ? '编辑需求项目' : '编辑项目'"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="submitEditProject"
    >
      <a-form layout="vertical">
        <a-form-item v-if="isApiPlatform" label="需求编号" required>
          <a-input
            v-model:value="editForm.requirementNo"
            maxlength="64"
            placeholder="XQ2026-0818-01"
          />
        </a-form-item>
        <a-form-item :label="isApiPlatform ? '需求名称' : '项目名称'" required>
          <a-input
            v-model:value="editForm.title"
            maxlength="120"
            :placeholder="isApiPlatform ? '请输入需求名称' : '请输入项目名称'"
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
import { computed, ref, watch } from 'vue';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
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
const isApiPlatform = computed(() => props.platform === 'api-test');
const projectList = computed(() =>
  isApiPlatform.value ? apiStore.projects : caseStore.projects,
);
const keyword = ref('');
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

const filteredProjects = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return projectList.value;
  const normalizedKeyword = normalizeSearchText(value);
  return projectList.value.filter((project) => {
    const haystack = [
      cleanProjectTitle(project.title),
      project.description,
      project.requirementNo,
    ]
      .filter(Boolean)
      .join(' ');
    return normalizeSearchText(haystack).includes(normalizedKeyword);
  });
});

const filteredProjectIds = computed(() => filteredProjects.value.map((project) => project.id));
const selectedFilteredCount = computed(
  () => filteredProjectIds.value.filter((projectId) => selectedProjectIdSet.value.has(projectId)).length,
);
const allFilteredSelected = computed(
  () => Boolean(filteredProjectIds.value.length) && selectedFilteredCount.value === filteredProjectIds.value.length,
);
const selectionIndeterminate = computed(
  () => selectedFilteredCount.value > 0 && selectedFilteredCount.value < filteredProjectIds.value.length,
);

watch(
  () => projectList.value.map((project) => project.id).join(','),
  () => {
    const existingIds = new Set(projectList.value.map((project) => project.id));
    selectedProjectIds.value = selectedProjectIds.value.filter((projectId) => existingIds.has(projectId));
  },
);

function onNewProject() {
  if (isApiPlatform.value) {
    createForm.value = {
      requirementNo: '',
      title: '',
      description: '',
    };
    createModalOpen.value = true;
    return;
  }
  void caseStore.newProject();
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
    await apiStore.newProject({
      requirementNo,
      title,
      description: createForm.value.description.trim(),
    });
    createModalOpen.value = false;
  } catch {
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
    selectedProjectIds.value = [...new Set([...selectedProjectIds.value, ...filteredProjectIds.value])];
    return;
  }
  const filteredIds = new Set(filteredProjectIds.value);
  selectedProjectIds.value = selectedProjectIds.value.filter((projectId) => !filteredIds.has(projectId));
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
      if (!projectList.value.length) {
        deleteMode.value = false;
      }
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
    message.warning(isApiPlatform.value ? '请输入需求名称' : '请输入项目名称');
    return Promise.reject();
  }
  if (isApiPlatform.value) {
    const requirementNo = editForm.value.requirementNo.trim();
    if (!requirementNo) {
      message.warning('请输入需求编号');
      return Promise.reject();
    }
    if (!isValidRequirementNo(requirementNo)) {
      message.warning('需求编号格式须为 XQxxxx-xxxx-xx');
      return Promise.reject();
    }
  }
  if (saving.value || !editingProjectId.value) {
    return Promise.reject();
  }
  saving.value = true;
  try {
    if (isApiPlatform.value) {
      await apiStore.updateProjectInfo(editingProjectId.value, {
        title,
        requirementNo: editForm.value.requirementNo.trim(),
        description: editForm.value.description.trim(),
      });
    } else {
      await caseStore.updateProjectInfo(editingProjectId.value, {
        title,
        description: editForm.value.description.trim(),
      });
    }
    editModalOpen.value = false;
  } catch {
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

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[‐‑‒–—―－]/g, '-')
    .replace(/\s+/g, '');
}
</script>
