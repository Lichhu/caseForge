<template>
  <a-drawer
    :open="open"
    title="批量处理准生产案例"
    placement="right"
    width="min(1480px, 96vw)"
    :z-index="NESTED_OVERLAY_Z_INDEX"
    :footer="null"
    :mask-closable="!saving"
    :closable="!saving"
    :body-style="{ padding: '0' }"
    root-class-name="preproduction-batch-drawer"
    @close="closeDrawer"
  >
    <div class="batch-page">
      <a-spin :spinning="loading">
        <a-alert
          v-if="loadError"
          type="error"
          :message="loadError"
          show-icon
          class="batch-page-alert"
        />

        <template v-if="!loading || rows.length">
          <section class="batch-hero">
            <div>
              <span>准生产案例批量处理</span>
              <strong>共 {{ rows.length }} 个步骤，来自 {{ cases.length }} 条案例</strong>
              <p>
                步骤可以单独勾选：先选步骤一设置为地址 A，保存后再选步骤三设置为地址
                B。SQL 步骤仅展示，不参与请求地址修改。
              </p>
            </div>
            <div class="batch-hero-metrics">
              <div>
                <strong>{{ cases.length }}</strong>
                <span>案例</span>
              </div>
              <div>
                <strong>{{ requestRows.length }}</strong>
                <span>请求步骤</span>
              </div>
              <div>
                <strong>{{ selectedRows.length }}</strong>
                <span>已勾选</span>
              </div>
            </div>
          </section>

          <section class="batch-config-card">
            <div class="batch-section-head">
              <div>
                <strong>批量设置</strong>
                <span>只覆盖已填写的配置项，未填写的项保持步骤原值</span>
              </div>
              <a-tag color="blue">{{ selectedRows.length }} 个步骤</a-tag>
            </div>

            <div class="batch-config-grid">
              <label>
                <span>环境</span>
                <a-select
                  v-model:value="environmentKey"
                  allow-clear
                  show-search
                  option-filter-prop="label"
                  placeholder="可选，按环境选择请求地址"
                  :options="environmentOptions"
                  :loading="environmentsLoading"
                  @change="onEnvironmentChange"
                />
              </label>
              <label>
                <span>请求地址</span>
                <a-select
                  v-model:value="serviceKey"
                  allow-clear
                  show-search
                  option-filter-prop="searchText"
                  :options="serviceOptions"
                  :disabled="!environmentKey"
                  :loading="servicesLoading"
                  placeholder="可选，选择环境下的服务地址"
                >
                  <template #notFoundContent>
                    {{ environmentKey ? "当前环境没有匹配地址" : "请先选择环境" }}
                  </template>
                </a-select>
              </label>
              <div class="batch-address-preview">
                <span>当前目标地址</span>
                <code>{{ selectedAddress || "保持各步骤原地址" }}</code>
              </div>
              <label>
                <span>通讯协议</span>
                <a-select
                  v-model:value="transport"
                  allow-clear
                  placeholder="不修改"
                  :options="transportOptions"
                  @change="onTransportChange"
                />
              </label>
              <label v-if="!transport || transport === 'http'">
                <span>请求方法</span>
                <a-select
                  v-model:value="method"
                  allow-clear
                  placeholder="不修改"
                  :options="methodOptions"
                />
              </label>
              <label>
                <span>编码</span>
                <a-select
                  v-model:value="encoding"
                  allow-clear
                  placeholder="不修改"
                  :options="encodingOptions"
                />
              </label>
              <label class="batch-config-path">
                <span>请求路径</span>
                <a-input
                  v-model:value="path"
                  allow-clear
                  placeholder="不修改"
                />
              </label>
            </div>
          </section>

          <section class="batch-list-card">
            <div class="batch-section-head batch-list-head">
              <div>
                <strong>案例步骤集合</strong>
                <span>按案例分组展示；可以直接勾选全部请求步骤</span>
              </div>
              <div class="batch-list-actions">
                <a-button size="small" @click="selectAllRequestSteps"
                  >全选请求步骤</a-button
                >
                <a-button size="small" @click="clearSelection">清空</a-button>
              </div>
            </div>

            <div class="batch-case-groups">
              <article
                v-for="group in groupedCases"
                :key="group.id"
                class="batch-case-card"
              >
                <header class="batch-case-head">
                  <a-checkbox
                    :checked="group.allRequestsSelected"
                    :indeterminate="
                      group.selectedRequestCount > 0 &&
                      !group.allRequestsSelected
                    "
                    :disabled="!group.requestCount"
                    title="选择该案例下的全部请求步骤"
                    @change="onCaseStepsChange(group.id, $event)"
                  />
                  <div class="batch-case-identity">
                    <strong>{{ group.title || "未命名案例" }}</strong>
                    <span>{{ group.caseNo || "—" }}</span>
                  </div>
                  <div class="batch-case-count">
                    <span>包含 {{ group.steps.length }} 个步骤</span>
                    <strong
                      >{{ group.selectedRequestCount }} /
                      {{ group.requestCount }} 请求步骤已选</strong
                    >
                  </div>
                  <div class="batch-case-actions">
                    <a-button
                      size="small"
                      :disabled="!group.requestCount"
                      @click="selectCaseRequestSteps(group.id)"
                      >全选本案例</a-button
                    >
                    <a-button
                      size="small"
                      :disabled="!group.selectedRequestCount"
                      @click="clearCaseSelection(group.id)"
                      >清空</a-button
                    >
                  </div>
                </header>

                <div class="batch-step-rows">
                  <div
                    v-for="record in group.steps"
                    :key="record.key"
                    class="batch-step-row"
                    :class="{
                      'is-selected': selectedKeys.includes(record.key),
                      'is-disabled': !record.isRequest,
                    }"
                  >
                    <a-checkbox
                      :checked="selectedKeys.includes(record.key)"
                      :disabled="!record.isRequest"
                      :title="
                        record.isRequest
                          ? '选择该请求步骤'
                          : 'SQL 步骤不支持修改请求地址'
                      "
                      @change="onStepChange(record.key, $event)"
                    />
                    <div class="batch-step-name">
                      <span>{{ record.stepIndex + 1 }}</span>
                      <a-tooltip :title="record.stepName">
                        <strong>{{ record.stepName }}</strong>
                      </a-tooltip>
                    </div>
                    <a-tag
                      :color="record.isRequest ? 'blue' : 'purple'"
                      class="batch-transport-tag"
                    >
                      {{ stepTransportLabel(record.step) }}
                    </a-tag>
                    <span class="batch-step-method">
                      {{ stepMethodLabel(record.step) }}
                    </span>
                    <div class="batch-target-cell">
                      <span>
                        {{
                          record.isRequest
                            ? stepTargetLabel(record.step)
                            : "SQL 步骤不支持修改请求地址"
                        }}
                      </span>
                      <code>{{ stepPathLabel(record.step) }}</code>
                    <small
                      v-if="stepErrors[record.key]"
                      class="batch-step-error"
                    >
                      {{ stepErrors[record.key] }}
                    </small>
                    </div>
                    <span class="batch-step-encoding">
                      {{ stepEncodingLabel(record.step) }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </template>
      </a-spin>

      <footer class="batch-footer">
        <span>
          <template v-if="saving">
            正在保存 {{ saveProgress.done }} / {{ saveProgress.total }}
          </template>
          <template v-else>
            已勾选 {{ selectedRows.length }} 个请求步骤
          </template>
        </span>
        <div>
          <a-button :disabled="saving" @click="closeDrawer">取消</a-button>
          <a-button
            type="primary"
            :loading="saving"
            :disabled="!selectedRows.length || !hasPatch"
            @click="saveBatch"
          >
            保存批量设置
          </a-button>
        </div>
      </footer>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type { ApiCaseStep, ApiTransport } from "@case-forge/shared";
import { isDbStep, isHttpStep } from "@case-forge/shared";
import {
  getManagedCaseDetails,
  listApiEnvironments,
  listApiEnvironmentServices,
  updateManagedCaseStep,
  type ApiEnvironmentRow,
  type ApiEnvironmentServiceRow,
  type ManagedCaseRow,
  type UpdateManagedCaseStepPayload,
} from "@/api/apiTestClient";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import { runWithConcurrency } from "@/utils/concurrency";

type BatchStepRow = {
  key: string;
  caseId: string;
  caseNo?: string | null;
  caseTitle: string;
  projectId: string;
  step: ApiCaseStep;
  stepIndex: number;
  stepName: string;
  isRequest: boolean;
};

const props = defineProps<{
  open: boolean;
  caseIds: string[];
}>();

const emit = defineEmits<{
  (event: "update:open", value: boolean): void;
  (event: "updated", rows: ManagedCaseRow[]): void;
}>();

const cases = ref<ManagedCaseRow[]>([]);
const loading = ref(false);
const loadError = ref("");
const saving = ref(false);
const environmentsLoading = ref(false);
const servicesLoading = ref(false);
const environments = ref<ApiEnvironmentRow[]>([]);
const environmentServices = ref<Record<string, ApiEnvironmentServiceRow[]>>({});
const environmentKey = ref<string>();
const serviceKey = ref<string>();
const transport = ref<ApiTransport>();
const method = ref<string>();
const encoding = ref<string>();
const path = ref("");
const selectedKeys = ref<string[]>([]);
const stepErrors = ref<Record<string, string>>({});
const saveProgress = ref({ done: 0, total: 0 });
let loadSequence = 0;

const transportOptions = [
  { label: "HTTP", value: "http" as ApiTransport },
  { label: "Socket", value: "tcp" as ApiTransport },
  { label: "MQ", value: "mq" as ApiTransport },
];
const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE"].map(
  (value) => ({ label: value, value }),
);
const encodingOptions = ["UTF-8", "GBK"].map((value) => ({
  label: value,
  value,
}));

const rows = computed<BatchStepRow[]>(() =>
  cases.value.flatMap((row) => {
    const steps = caseStepRows(row);
    return steps.map((step, stepIndex) => ({
      key: `${row.id}::${step.id}`,
      caseId: row.id,
      caseNo: row.caseNo,
      caseTitle: row.title,
      projectId: row.projectId,
      step,
      stepIndex,
      stepName: step.name || "未命名步骤",
      isRequest: isHttpStep(step),
    }));
  }),
);

const requestRows = computed(() => rows.value.filter((row) => row.isRequest));
const selectedRows = computed(() => {
  const selected = new Set(selectedKeys.value);
  return requestRows.value.filter((row) => selected.has(row.key));
});
const groupedCases = computed(() => {
  const selected = new Set(selectedKeys.value);
  return cases.value.map((row) => {
    const steps = rows.value.filter((item) => item.caseId === row.id);
    const requestSteps = steps.filter((item) => item.isRequest);
    const selectedRequestCount = requestSteps.filter((item) =>
      selected.has(item.key),
    ).length;
    return {
      id: row.id,
      caseNo: row.caseNo,
      title: row.title,
      steps,
      requestCount: requestSteps.length,
      selectedRequestCount,
      allRequestsSelected:
        requestSteps.length > 0 &&
        selectedRequestCount === requestSteps.length,
    };
  });
});

const environmentByKey = computed(
  () =>
    new Map(
      environments.value.map((environment) => [
        environmentOptionKey(environment),
        environment,
      ]),
    ),
);
const selectedEnvironment = computed(() =>
  environmentKey.value
    ? environmentByKey.value.get(environmentKey.value)
    : undefined,
);
const environmentOptions = computed(() => {
  const multipleProjects =
    new Set(environments.value.map((environment) => environment.projectId))
      .size > 1;
  return environments.value
    .filter((environment) => environment.enabled)
    .map((environment) => ({
      value: environmentOptionKey(environment),
      label: `${environment.name}${environment.isDefault ? "（默认）" : ""}${
        multipleProjects ? ` · ${projectLabel(environment.projectId)}` : ""
      }`,
    }));
});
const serviceOptions = computed(() => {
  const currentKey = environmentKey.value;
  if (!currentKey) return [];
  return (environmentServices.value[currentKey] ?? [])
    .filter((service) => {
      if (!service.enabled) return false;
      if (!transport.value) return true;
      const expected = transport.value === "http" ? "http" : "tcp";
      return (service.transport ?? "http") === expected;
    })
    .map((service) => {
      const address = serviceAddress(service);
      return {
        value: service.id,
        label: `${service.name}${address ? ` · ${address}` : ""}`,
        searchText:
          `${service.name} ${address} ${service.host ?? ""} ${service.port ?? ""}`.toLowerCase(),
      };
    });
});
const selectedService = computed(() => {
  if (!environmentKey.value || !serviceKey.value) return undefined;
  return (environmentServices.value[environmentKey.value] ?? []).find(
    (service) => service.id === serviceKey.value,
  );
});
const selectedAddress = computed(
  () =>
    serviceAddress(selectedService.value) ||
    selectedEnvironment.value?.baseUrl?.trim() ||
    "",
);
const hasPatch = computed(
  () =>
    Boolean(selectedAddress.value) ||
    Boolean(transport.value) ||
    Boolean(method.value) ||
    Boolean(encoding.value) ||
    Boolean(path.value.trim()),
);
function environmentOptionKey(environment: ApiEnvironmentRow) {
  return `${environment.projectId}::${environment.id}`;
}

function caseStepRows(row: ManagedCaseRow): ApiCaseStep[] {
  if (row.steps?.length) return row.steps;
  return [
    {
      id: row.id,
      name: row.title,
      isMainRequest: true,
      request: row.request,
      expected: row.expected,
      exports: [],
    },
  ];
}

function projectLabel(projectId: string) {
  return (
    cases.value.find((row) => row.projectId === projectId)?.requirementNo ||
    "当前项目"
  );
}

function serviceAddress(service?: ApiEnvironmentServiceRow) {
  return (
    service?.serverAddress?.trim() ||
    service?.baseUrl?.trim() ||
    (service?.host && service.port ? `${service.host}:${service.port}` : "") ||
    ""
  );
}

function stepTransportLabel(step: ApiCaseStep) {
  if (isDbStep(step)) return "SQL";
  const value = String(step.request.transport ?? "http").toLowerCase();
  if (value === "tcp" || value === "socket") return "SOCKET";
  return value.toUpperCase();
}

function stepMethodLabel(step: ApiCaseStep) {
  return isHttpStep(step) ? step.request.method || "—" : "—";
}

function stepEncodingLabel(step: ApiCaseStep) {
  return isHttpStep(step) ? step.request.encoding || "—" : "—";
}

function stepTargetLabel(step: ApiCaseStep) {
  if (!isHttpStep(step)) return "数据库连接";
  return step.target?.address?.trim() || "未配置环境地址";
}

function stepPathLabel(step: ApiCaseStep) {
  if (!isHttpStep(step)) return step.db?.connectionId || "—";
  return step.request.path?.trim() || "/";
}

async function loadCasesAndEnvironments() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = "";
  try {
    const rowsById = new Map(
      (await getManagedCaseDetails(props.caseIds)).map((row) => [row.id, row]),
    );
    const loaded = props.caseIds
      .map((id) => rowsById.get(id))
      .filter((row): row is ManagedCaseRow => Boolean(row));
    if (sequence !== loadSequence) return;
    cases.value = loaded;
    selectedKeys.value = [];
    environments.value = [];
    environmentServices.value = {};
    const projectIds = [...new Set(loaded.map((row) => row.projectId))];
    environmentsLoading.value = true;
    const environmentGroups = await Promise.all(
      projectIds.map((projectId) => listApiEnvironments(projectId)),
    );
    if (sequence !== loadSequence) return;
    environments.value = environmentGroups.flat();
  } catch (error) {
    if (sequence !== loadSequence) return;
    loadError.value =
      error instanceof Error ? error.message : "加载批量处理案例失败";
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      environmentsLoading.value = false;
    }
  }
}

async function onEnvironmentChange(value?: string) {
  environmentKey.value = value;
  serviceKey.value = undefined;
  if (!value) return;
  const environment = environmentByKey.value.get(value);
  if (!environment || environmentServices.value[value]) return;
  servicesLoading.value = true;
  try {
    environmentServices.value = {
      ...environmentServices.value,
      [value]: await listApiEnvironmentServices(
        environment.projectId,
        environment.id,
      ),
    };
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "加载环境服务地址失败",
    );
  } finally {
    servicesLoading.value = false;
  }
}

function onTransportChange() {
  serviceKey.value = undefined;
  if (transport.value !== "http") method.value = undefined;
}

function selectAllRequestSteps() {
  selectedKeys.value = requestRows.value.map((row) => row.key);
}

function clearSelection() {
  selectedKeys.value = [];
}

function toggleStep(key: string, checked: boolean) {
  selectedKeys.value = checked
    ? [...new Set([...selectedKeys.value, key])]
    : selectedKeys.value.filter((item) => item !== key);
}

function setCaseStepsSelected(caseId: string, checked: boolean) {
  const group = groupedCases.value.find((item) => item.id === caseId);
  if (!group) return;
  const keys = group.steps
    .filter((item) => item.isRequest)
    .map((item) => item.key);
  const next = new Set(selectedKeys.value);
  for (const key of keys) {
    if (checked) next.add(key);
    else next.delete(key);
  }
  selectedKeys.value = [...next];
}

function onCaseStepsChange(caseId: string, event: unknown) {
  const checked = Boolean(
    (event as { target?: { checked?: boolean } } | undefined)?.target?.checked,
  );
  setCaseStepsSelected(caseId, checked);
}

function selectCaseRequestSteps(caseId: string) {
  setCaseStepsSelected(caseId, true);
}

function clearCaseSelection(caseId: string) {
  setCaseStepsSelected(caseId, false);
}

function onStepChange(key: string, event: unknown) {
  const checked = Boolean(
    (event as { target?: { checked?: boolean } } | undefined)?.target?.checked,
  );
  toggleStep(key, checked);
}

function buildPatch(): UpdateManagedCaseStepPayload {
  const patch: UpdateManagedCaseStepPayload = {};
  if (transport.value) {
    patch.transport = transport.value;
    if (transport.value !== "http") patch.method = "";
  }
  if (method.value) patch.method = method.value;
  if (encoding.value) patch.encoding = encoding.value;
  if (path.value.trim()) patch.path = path.value.trim();
  if (selectedAddress.value) {
    const environment = selectedEnvironment.value;
    const service = selectedService.value;
    patch.targetAddress = selectedAddress.value;
    patch.targetName = service?.name || environment?.name || "";
    if (environment) {
      patch.environmentId = environment.id;
      patch.environmentServiceId = service?.id ?? "";
    }
  }
  return patch;
}

async function saveBatch() {
  if (saving.value || !selectedRows.value.length || !hasPatch.value) return;
  const targets = [...selectedRows.value];
  saving.value = true;
  saveProgress.value = { done: 0, total: targets.length };
  stepErrors.value = {};
  try {
    const results = await runWithConcurrency(
      targets.map(
        (row) => () =>
          updateManagedCaseStep(row.caseId, row.step.id, buildPatch()),
      ),
      4,
      (index, result) => {
        if (result.status === "rejected") {
          stepErrors.value = {
            ...stepErrors.value,
            [targets[index].key]:
              result.reason instanceof Error
                ? result.reason.message
                : "保存失败",
          };
        }
        saveProgress.value = {
          done: saveProgress.value.done + 1,
          total: targets.length,
        };
      },
    );
    const successful = results.filter(
      (result): result is PromiseFulfilledResult<ManagedCaseRow> =>
        result.status === "fulfilled",
    ).length;
    const failed = results.length - successful;
    selectedKeys.value = results.flatMap((result, index) =>
      result.status === "rejected" ? [targets[index].key] : [],
    );
    const updatedRows = await getManagedCaseDetails(props.caseIds);
    cases.value = props.caseIds
      .map((id) => updatedRows.find((row) => row.id === id))
      .filter((row): row is ManagedCaseRow => Boolean(row));
    emit("updated", cases.value);
    if (failed) {
      const firstError = Object.values(stepErrors.value)[0];
      message.warning(
        `批量设置完成：成功 ${successful} 个步骤，失败 ${failed} 个步骤${
          firstError ? `；${firstError}` : ""
        }`,
      );
    } else {
      message.success(`已更新 ${successful} 个步骤`);
    }
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "保存批量设置失败",
    );
  } finally {
    saving.value = false;
  }
}

function closeDrawer() {
  if (saving.value) return;
  emit("update:open", false);
}

watch(
  () => [props.open, props.caseIds.join("|")] as const,
  ([open]) => {
    if (!open) return;
    environmentKey.value = undefined;
    serviceKey.value = undefined;
    transport.value = undefined;
    method.value = undefined;
    encoding.value = undefined;
    path.value = "";
    void loadCasesAndEnvironments();
  },
  { immediate: true },
);
</script>

<style scoped>
:global(.preproduction-batch-drawer .ant-drawer-body) {
  overflow: hidden;
  background: #f5f6f8;
}

.batch-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.batch-page > :deep(.ant-spin-nested-loading),
.batch-page > :deep(.ant-spin-container) {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: auto;
}

.batch-page-alert {
  margin: 18px 22px 0;
}

.batch-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 18px 22px;
  padding: 20px 22px;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  background: linear-gradient(118deg, #fff 0%, #f8fbff 100%);
}

.batch-hero > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.batch-hero span {
  color: #667085;
  font-size: 12px;
}

.batch-hero strong {
  color: #1d2939;
  font-size: 18px;
}

.batch-hero p {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.6;
}

.batch-hero-metrics {
  display: flex;
  flex: none;
  gap: 8px;
}

.batch-hero-metrics > div {
  display: flex;
  min-width: 84px;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid #eaecf0;
  border-radius: 9px;
  background: #fff;
}

.batch-hero-metrics strong {
  color: #b42318;
  font-size: 20px;
}

.batch-config-card,
.batch-list-card {
  margin: 0 22px 16px;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  background: #fff;
}

.batch-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid #eaecf0;
}

.batch-section-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.batch-section-head strong {
  color: #1d2939;
  font-size: 14px;
}

.batch-section-head span {
  color: #98a2b3;
  font-size: 11px;
}

.batch-config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 18px;
}

.batch-config-grid label,
.batch-address-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.batch-config-grid label > span,
.batch-address-preview > span {
  color: #667085;
  font-size: 11px;
}

.batch-address-preview {
  justify-content: flex-end;
}

.batch-address-preview code {
  min-height: 32px;
  padding: 7px 11px;
  overflow: hidden;
  border: 1px dashed #d0d5dd;
  border-radius: 6px;
  background: #f9fafb;
  color: #475467;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-config-path {
  grid-column: span 2;
}

.batch-list-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
}

.batch-list-actions {
  display: flex;
  gap: 8px;
}

.batch-case-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px 18px;
}

.batch-case-card {
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
}

.batch-case-head {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
}

.batch-case-identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.batch-case-identity strong,
.batch-case-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-case-identity strong {
  color: #1d2939;
  font-size: 13px;
}

.batch-case-identity span {
  color: #667085;
  font-size: 11px;
}

.batch-case-count {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 2px;
}

.batch-case-count span {
  color: #98a2b3;
  font-size: 10px;
}

.batch-case-count strong {
  color: #475467;
  font-size: 11px;
  font-weight: 500;
}

.batch-case-actions {
  display: flex;
  gap: 6px;
}

.batch-step-rows {
  display: flex;
  min-width: 980px;
  flex-direction: column;
}

.batch-step-row {
  display: grid;
  grid-template-columns:
    auto minmax(180px, 1.1fr) 76px 80px minmax(300px, 1.8fr)
    64px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #f2f4f7;
  background: #fff;
}

.batch-step-row:last-child {
  border-bottom: 0;
}

.batch-step-row.is-selected {
  background: #f5f8ff;
  box-shadow: inset 3px 0 0 #1570ef;
}

.batch-step-row.is-disabled {
  background: #fafafa;
}

.batch-step-row.is-disabled .batch-step-name strong,
.batch-step-row.is-disabled .batch-target-cell span,
.batch-step-row.is-disabled .batch-target-cell code,
.batch-step-row.is-disabled .batch-step-method,
.batch-step-row.is-disabled .batch-step-encoding {
  color: #98a2b3;
}

.batch-step-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.batch-step-name > span {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eef4ff;
  color: #175cd3;
  font-size: 10px;
}

.batch-step-name strong {
  overflow: hidden;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-transport-tag {
  min-width: 48px;
  margin-inline-end: 0;
  text-align: center;
}

.batch-step-method,
.batch-step-encoding {
  color: #667085;
  font-size: 11px;
}

.batch-target-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.batch-target-cell span,
.batch-target-cell code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-target-cell span {
  color: #475467;
  font-size: 11px;
}

.batch-target-cell code {
  color: #667085;
  font-size: 11px;
}

.batch-step-error {
  overflow: hidden;
  color: #b42318;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 22px;
  border-top: 1px solid #e4e7ec;
  background: #fff;
  box-shadow: 0 -4px 18px rgb(16 24 40 / 5%);
}

.batch-footer > span {
  color: #667085;
  font-size: 12px;
}

.batch-footer > div {
  display: flex;
  gap: 8px;
}

@media (max-width: 900px) {
  .batch-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .batch-config-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .batch-config-path {
    grid-column: span 1;
  }
}
</style>
