<template>
  <div class="env-center">
    <div class="env-center-head">
      <strong>环境中心</strong>
      <a-button size="small" type="primary" @click="openCreate">新建环境</a-button>
    </div>
    <a-radio-group v-model:value="apiStore.selectedEnvironmentId" class="env-list">
      <a-radio v-for="env in apiStore.environments" :key="env.id" :value="env.id" class="env-item">
        <span>{{ env.name }}</span>
        <a-tag size="small">{{ scopeLabel(env.scope) }}</a-tag>
        <a-tag v-if="env.isDefault" color="blue">默认</a-tag>
        <a-button type="link" size="small" @click.stop="openEdit(env)">编辑</a-button>
      </a-radio>
    </a-radio-group>
    <a-empty v-if="!apiStore.environments.length" description="请先创建执行环境" />

    <a-modal v-model:open="modalOpen" :title="editingId ? '编辑环境' : '新建环境'" @ok="onSave">
      <a-form layout="vertical">
        <a-form-item label="环境类型" required>
          <a-radio-group v-model:value="form.scope" :options="scopeOptions" />
        </a-form-item>
        <a-form-item label="环境名称" required>
          <a-auto-complete
            v-model:value="form.name"
            :options="nameOptions"
            placeholder="请输入或选择环境名称"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  API_ENVIRONMENT_PRESET_NAMES,
  API_ENVIRONMENT_SCOPE_LABEL,
  type ApiEnvironmentScope,
} from '@case-forge/shared';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiEnvironmentRow } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const modalOpen = ref(false);
const editingId = ref('');

const form = reactive({
  scope: 'system' as ApiEnvironmentScope,
  name: '',
});

const scopeOptions = Object.entries(API_ENVIRONMENT_SCOPE_LABEL).map(([value, label]) => ({
  label,
  value,
}));

const nameOptions = API_ENVIRONMENT_PRESET_NAMES.map((name) => ({ value: name }));

function scopeLabel(scope?: ApiEnvironmentScope) {
  if (!scope) return API_ENVIRONMENT_SCOPE_LABEL.system;
  return API_ENVIRONMENT_SCOPE_LABEL[scope];
}

function openCreate() {
  editingId.value = '';
  form.scope = 'system';
  form.name = '';
  modalOpen.value = true;
}

function openEdit(env: ApiEnvironmentRow) {
  editingId.value = env.id;
  form.scope = env.scope ?? 'system';
  form.name = env.name;
  modalOpen.value = true;
}

async function onSave() {
  const projectId = apiStore.activeProjectId;
  if (!projectId || !form.name.trim()) return;
  await apiStore.saveEnvironment(
    projectId,
    {
      name: form.name.trim(),
      scope: form.scope,
    },
    editingId.value || undefined,
  );
  modalOpen.value = false;
}
</script>

<style scoped>
.env-center { border: 1px solid var(--cf-border, #e2e8f0); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.env-center-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.env-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.env-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
</style>
