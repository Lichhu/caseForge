<template>
  <div class="env-center">
    <div class="env-center-head">
      <strong>环境中心</strong>
      <a-button size="small" type="primary" @click="openCreate">新建环境</a-button>
    </div>
    <a-radio-group v-model:value="apiStore.selectedEnvironmentId" class="env-list">
      <a-radio v-for="env in apiStore.environments" :key="env.id" :value="env.id" class="env-item">
        <span>{{ env.name }}</span>
        <small>{{ env.baseUrl }}</small>
        <a-tag v-if="env.isDefault" color="blue">默认</a-tag>
        <a-button type="link" size="small" @click.stop="openEdit(env)">编辑</a-button>
      </a-radio>
    </a-radio-group>
    <a-empty v-if="!apiStore.environments.length" description="请先创建执行环境" />

    <a-modal v-model:open="modalOpen" :title="editingId ? '编辑环境' : '新建环境'" @ok="onSave">
      <a-form layout="vertical">
        <a-form-item label="环境名称" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="Base URL" required><a-input v-model:value="form.baseUrl" placeholder="https://api.example.com" /></a-form-item>
        <a-form-item label="Token（保存后脱敏）"><a-input-password v-model:value="form.token" placeholder="Bearer token" /></a-form-item>
        <a-form-item label="默认 Headers (JSON)"><a-textarea v-model:value="form.headersJson" :rows="3" /></a-form-item>
        <a-form-item label="变量 (JSON)"><a-textarea v-model:value="form.variablesJson" :rows="2" /></a-form-item>
        <a-form-item label="设为默认"><a-switch v-model:checked="form.isDefault" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiEnvironmentRow } from '@/api/apiTestClient';

const apiStore = useApiTestStore();
const modalOpen = ref(false);
const editingId = ref('');

const form = reactive({
  name: '',
  baseUrl: '',
  token: '',
  headersJson: '{}',
  variablesJson: '{}',
  isDefault: false,
});

function openCreate() {
  editingId.value = '';
  form.name = 'DEV';
  form.baseUrl = 'http://localhost:8080';
  form.token = '';
  form.headersJson = JSON.stringify({ 'Content-Type': 'application/json' }, null, 2);
  form.variablesJson = '{}';
  form.isDefault = apiStore.environments.length === 0;
  modalOpen.value = true;
}

function openEdit(env: ApiEnvironmentRow) {
  editingId.value = env.id;
  form.name = env.name;
  form.baseUrl = env.baseUrl;
  form.token = '';
  form.headersJson = JSON.stringify(env.headers ?? {}, null, 2);
  form.variablesJson = JSON.stringify(env.variables ?? {}, null, 2);
  form.isDefault = env.isDefault;
  modalOpen.value = true;
}

async function onSave() {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  const payload: Record<string, unknown> = {
    name: form.name,
    baseUrl: form.baseUrl,
    headers: JSON.parse(form.headersJson || '{}'),
    variables: JSON.parse(form.variablesJson || '{}'),
    isDefault: form.isDefault,
  };
  if (form.token) payload.token = form.token;
  await apiStore.saveEnvironment(projectId, payload, editingId.value || undefined);
  modalOpen.value = false;
}
</script>

<style scoped>
.env-center { border: 1px solid var(--cf-border, #e2e8f0); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.env-center-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.env-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.env-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.env-item small { color: #64748b; }
</style>
