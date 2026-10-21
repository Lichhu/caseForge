<template>
  <main class="case-management-page">
    <header class="management-header">
      <div>
        <a-select
          value="case"
          :bordered="false"
          aria-label="管理模块"
          class="module-select"
          :options="moduleOptions"
          @change="changeModule"
        />
        <p class="management-subtitle">
          准生产案例统一管理 · 版本筛选、批量导出与执行报告
        </p>
      </div>
      <div class="management-actions action-toolbar action-toolbar--compact">
        <a-button
          :disabled="!selectedCases.length || loading || selecting"
          :loading="exporting"
          @click="exportSelected"
          >批量导出 · {{ selectedCases.length }}</a-button
        >
        <a-button
          danger
          :disabled="!selectedCases.length || loading || selecting || running"
          :loading="deleting"
          @click="deleteSelected"
          >批量删除 · {{ selectedCases.length }}</a-button
        >
        <a-button
          type="primary"
          :disabled="!selectedCases.length || loading || selecting"
          :loading="running"
          @click="prepareExecution"
          >批量执行</a-button
        >
      </div>
    </header>
    <section class="management-card case-list-card">
      <div class="list-card-head">
        <div class="list-card-title">
          <strong>准生产案例列表</strong>
          <span class="list-card-count">{{ totalCount }} 条</span>
        </div>
      </div>
      <div class="filters">
        <label class="filter-field"
          >需求编号<a-select
            v-model:value="projectId"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部需求"
            :disabled="running"
            :options="projectOptions"
        /></label>
        <label class="filter-field"
          >交易码<a-select
            v-model:value="transactionId"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部交易码"
            :disabled="running"
            :options="transactionOptions"
        /></label>
        <label class="filter-field filter-application-field"
          >归属应用<a-select
            v-model:value="applicationFilter"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部归属应用"
            :disabled="running"
            :options="applicationOptions"
        /></label>
        <div class="list-summary">
          <span
            >已选 <strong>{{ selectedCases.length }}</strong> 条</span
          >
          <a-button
            type="link"
            size="small"
            :disabled="loading || running || selecting || !totalCount"
            :loading="selecting"
            @click="selectAllMatching"
            >选择全部筛选结果</a-button
          >
          <a-button
            v-if="selectedCases.length"
            type="link"
            size="small"
            :disabled="running"
            @click="clearSelection"
            >清空</a-button
          >
        </div>
      </div>
      <a-alert v-if="loadError" type="error" :message="loadError" show-icon />
      <div ref="tableArea" class="case-table-area">
        <a-table
          size="middle"
          table-layout="fixed"
          :data-source="cases"
          :loading="loading"
          row-key="id"
          :scroll="{ x: 1200, y: tableBodyHeight }"
          :pagination="false"
          :row-selection="rowSelection"
          :custom-row="caseRowProps"
          :locale="{ emptyText: '暂无准生产案例，请先在项目管理中同步' }"
        >
          <a-table-column
            title="需求编号"
            data-index="requirementNo"
            width="175"
          />
          <a-table-column
            title="交易码"
            data-index="transactionCode"
            width="140"
          />
          <a-table-column title="案例编号" data-index="caseNo" width="155" />
          <a-table-column
            title="案例名称"
            data-index="title"
            :ellipsis="true"
          />
          <a-table-column title="归属应用" key="applicationPath" width="260">
            <template #default="{ record }">
              <div class="application-cell">
                <a-tooltip :title="record.applicationPath || '未指定'">
                  <span class="application-value">{{ record.applicationPath || "未指定" }}</span>
                </a-tooltip>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="版本" key="version" width="130"
            ><template #default="{ record }">{{
              versionLabel(record) || "未版本化"
            }}</template></a-table-column
          >
          <a-table-column title="操作时间" key="updatedAt" width="170">
            <template #default="{ record }">{{
              formatDateTime(record.updatedAt || record.createdAt)
            }}</template>
          </a-table-column>
          <a-table-column title="属性" key="polarity" width="85"
            ><template #default="{ record }"
              ><a-tag
                :color="record.polarity === 'negative' ? 'orange' : 'blue'"
                >{{ record.polarity === "negative" ? "反向" : "正向" }}</a-tag
              ></template
            ></a-table-column
          >
        </a-table>
      </div>
      <footer class="case-pagination">
        <a-pagination
          v-model:current="currentPage"
          v-model:page-size="pageSize"
          :total="totalCount"
          :page-size-options="['10', '20', '50', '100']"
          :show-total="
            (total: number, range: [number, number]) =>
              `共 ${total} 条 · ${range[0]}–${range[1]} 条`
          "
          show-size-changer
          show-quick-jumper
          :disabled="loading"
        />
      </footer>
    </section>
    <section v-if="results.length" class="management-card results-card">
      <h2>
        本次执行结果
        <span class="muted">{{ settledCount }} / {{ results.length }}</span>
      </h2>
      <div class="execution-progress" aria-live="polite">
        <div class="execution-progress-head">
          <span>{{ running ? "执行并上传中" : "执行完成" }}</span>
          <strong>{{ executionProgress }}%</strong>
        </div>
        <a-progress :percent="executionProgress" :status="executionProgressStatus" :show-info="false" />
        <div class="execution-progress-detail">已完成 {{ settledCount }} / {{ results.length }} 个案例</div>
      </div>
      <a-alert
        v-if="running"
        type="info"
        message="执行中，请保持当前页面打开。上传失败可单独重试发布，不会重新执行案例。"
        show-icon
      />
      <a-table
        :data-source="results"
        row-key="caseId"
        :pagination="false"
        :scroll="{ x: 800 }"
      >
        <a-table-column title="案例" data-index="title" />
        <a-table-column title="执行结果" data-index="execution" width="140" />
        <a-table-column title="报告 / 通知" key="delivery"
          ><template #default="{ record }">
            <span>{{ record.delivery }}</span>
            <a
              v-if="record.reportUrl"
              :href="record.reportUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="report-link"
              >查看报告</a
            >
            <a-button
              v-if="record.runId && !record.reportUrl"
              type="link"
              :disabled="running || record.publishing"
              @click="deliver(record)"
              >重试发布报告</a-button
            >
          </template></a-table-column
        >
      </a-table>
    </section>
    <a-modal
      v-model:open="exportOpen"
      :width="640"
      title="导出测试案例"
      ok-text="导出"
      :confirm-loading="exporting"
      :ok-button-props="{ disabled: !designer || !exportApplicationNode }"
      @ok="confirmExport"
    >
      <div class="export-field">
        <label>设计人</label
        ><a-select
          v-model:value="designer"
          show-search
          option-filter-prop="label"
          placeholder="请选择设计人"
          :options="designerOptions"
        />
      </div>
      <div class="export-field">
        <label>归属应用</label>
        <a-tree-select
          v-model:value="exportApplicationNode"
          :load-data="loadApplicationChildren"
          :tree-data="applicationTree"
          placeholder="请选择归属应用"
          show-search
          tree-node-filter-prop="title"
          tree-node-label-prop="fullPath"
          :tree-default-expand-all="false"
          popup-class-name="export-application-dropdown"
        />
      </div>
    </a-modal>
    <PreproductionCaseDetailDrawer
      v-model:open="detailDrawerOpen"
      :case-row="detailCase"
      :deleting="deleting"
      :loading="detailLoading"
      @delete="deleteCurrentCase"
      @updated="onCaseUpdated"
    />
    <a-modal
      v-model:open="executionOpen"
      title="确认批量执行"
      ok-text="开始执行并发布报告"
      :confirm-loading="running"
      :ok-button-props="{ disabled: !executionVersionId || !executionApplicationId || !executionRoundId }"
      @ok="runSelected"
    >
      <p>
        将执行 {{ selectedCases.length }} 个案例，每个案例生成独立 HTML
        报告、上传对象存储，并通过现有敏行通知通道向当前用户推送结果。
      </p>
      <a-alert
        type="warning"
        message="会按照案例步骤中已配置的环境和地址发送真实测试请求。未启用案例不可执行；通知关闭时只上传报告，不会伪报推送成功。"
        show-icon
      />
      <div class="execution-fields">
        <label>版本</label>
        <a-select
          v-model:value="executionVersionId"
          :options="executionVersionOptions"
          :loading="executionOptionsLoading"
          placeholder="请选择版本"
          @change="onExecutionVersionChange"
        />
        <label>应用</label>
        <a-select
          v-model:value="executionApplicationId"
          :options="executionApplicationOptions"
          :loading="executionPlansLoading"
          :disabled="!executionVersionId"
          placeholder="请选择应用"
          @change="onExecutionApplicationChange"
        />
        <label>轮次</label>
        <a-select
          v-model:value="executionRoundId"
          :options="executionRoundOptions"
          :loading="executionRoundsLoading"
          :disabled="!executionApplicationId"
          placeholder="请选择轮次"
        />
      </div>
    </a-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { message, Modal } from "ant-design-vue";
import {
  listManagedCases,
  getManagedCaseOptions,
  selectManagedCases,
  getManagedCaseDetails,
  listExecutionVersions,
  listExecutionPlans,
  listCaseApplicationSystems,
  listCaseApplicationChildren,
  listCaseDesigners,
  exportCaseTemplate,
  deleteManagedCase,
  deleteManagedCases,
  type ManagedCaseRow,
  type ManagedCaseSelection,
  type ManagedCaseOptions,
  type CaseApplicationNode,
  runApiCases,
  publishCaseReport,
} from "@/api/apiTestClient";
import { exportApiCasesToExcel } from "@/utils/apiCaseExcelExport.util";
import { versionLabel } from "@/utils/caseManagement";
import { getUserName } from "@/utils/userContext";
import PreproductionCaseDetailDrawer from "@/components/api-test/PreproductionCaseDetailDrawer.vue";

type Result = {
  caseId: string;
  title: string;
  projectId: string;
  transactionId: string;
  execution: string;
  delivery: string;
  runId?: string;
  reportUrl?: string;
  publishing?: boolean;
};
type ApplicationTreeNode = Omit<CaseApplicationNode, "children"> & {
  key: string;
  value: string;
  title: string;
  fullPath: string;
  children?: ApplicationTreeNode[];
};
const router = useRouter();
const cases = ref<ManagedCaseRow[]>([]);
const totalCount = ref(0);
const filterOptions = ref<ManagedCaseOptions>({
  projects: [],
  transactions: [],
  applications: [],
  versions: [],
});
const selectedRows = ref(new Map<string, ManagedCaseSelection>());
const selecting = ref(false);
const exporting = ref(false);
const deleting = ref(false);
let requestSequence = 0;
let optionsSequence = 0;
let selectionSequence = 0;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
const projectId = ref<string>();
const transactionId = ref<string>();
const applicationFilter = ref<string>();
const currentPage = ref(1);
const pageSize = ref(10);
const tableArea = ref<HTMLElement>();
const tableBodyHeight = ref(360);
let tableResizeObserver: ResizeObserver | undefined;
const selectedKeys = ref<string[]>([]);
const loading = ref(false);
const loadError = ref("");
const running = ref(false);
const executionOpen = ref(false);
const executionOptionsLoading = ref(false);
const executionPlansLoading = ref(false);
const executionRoundsLoading = ref(false);
const executionVersionId = ref<string>();
const executionApplicationId = ref<string>();
const executionRoundId = ref<string>();
const executionVersionOptions = ref<Array<{ value: string; label: string }>>([]);
const executionApplicationOptions = ref<Array<{ value: string; label: string }>>([]);
const executionRoundOptions = ref<Array<{ value: string; label: string }>>([]);
const exportOpen = ref(false);
const detailDrawerOpen = ref(false);
const detailCase = ref<ManagedCaseRow | null>(null);
const detailLoading = ref(false);
let detailRequestSequence = 0;
const designer = ref<string>();
const designerOptions = ref<Array<{ value: string; label: string; user: any }>>([]);
const exportApplicationNode = ref<string>();
const applicationTree = ref<ApplicationTreeNode[]>([]);
const applicationChildrenCache = new Map<string, CaseApplicationNode[]>();
const results = ref<Result[]>([]);
const executionProgress = computed(() =>
  results.value.length ? Math.round((settledCount.value / results.value.length) * 100) : 0,
);
const executionProgressStatus = computed(() =>
  running.value ? "active" : results.value.some((item) => item.delivery.includes("失败") || item.execution === "执行请求失败") ? "exception" : "success",
);
const moduleOptions = [
  { value: "requirement", label: "需求管理" },
  { value: "project", label: "项目管理" },
  { value: "case", label: "准生产管理" },
];
const projectOptions = computed(() => filterOptions.value.projects);
const transactionOptions = computed(() => filterOptions.value.transactions);
const applicationOptions = computed(() => filterOptions.value.applications);
const selectedCases = computed(() => [...selectedRows.value.values()]);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  preserveSelectedRowKeys: true,
  getCheckboxProps: () => ({
    disabled: running.value || selecting.value || loading.value,
  }),
  onChange: (keys: (string | number)[]) => {
    const ids = new Set(keys.map(String));
    const rows = new Map(selectedRows.value);
    for (const id of rows.keys()) if (!ids.has(id)) rows.delete(id);
    for (const row of cases.value) if (ids.has(row.id)) rows.set(row.id, row);
    selectedRows.value = rows;
    selectedKeys.value = [...rows.keys()];
  },
}));
const publishing = computed(() => results.value.some((r) => r.publishing));
const settledCount = computed(
  () =>
    results.value.filter((r) => !["待执行", "执行中"].includes(r.execution))
      .length,
);

function changeModule(value: string) {
  if (value !== "case")
    void router.push(
      value === "requirement" ? "/api-test/requirement" : "/api-test",
    );
}
async function openCaseDetail(record: ManagedCaseRow) {
  const sequence = ++detailRequestSequence;
  detailCase.value = record;
  detailDrawerOpen.value = true;
  detailLoading.value = true;
  try {
    const [row] = await getManagedCaseDetails([record.id]);
    if (sequence !== detailRequestSequence) return;
    if (row) {
      detailCase.value = row;
      const index = cases.value.findIndex((item) => item.id === row.id);
      if (index >= 0) cases.value[index] = row;
      if (selectedRows.value.has(row.id)) {
        selectedRows.value.set(row.id, row);
      }
    }
  } catch (error) {
    if (sequence === detailRequestSequence) {
      message.error(
        error instanceof Error ? error.message : "加载案例详情失败，请重试",
      );
    }
  } finally {
    if (sequence === detailRequestSequence) detailLoading.value = false;
  }
}
function caseRowProps(record: ManagedCaseRow) {
  return {
    onClick: (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          ".ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column",
        )
      ) {
        return;
      }
      openCaseDetail(record);
    },
  };
}
function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}
function filters() {
  return {
    applicationPath: applicationFilter.value,
    projectId: projectId.value,
    transactionId: transactionId.value,
    latestOnly: false,
  };
}
function clearSelection() {
  selectionSequence += 1;
  selecting.value = false;
  selectedKeys.value = [];
  selectedRows.value = new Map();
}

function confirmDeleteCases(caseIds: string[], label: string, single = false) {
  if (!caseIds.length || deleting.value) return;
  Modal.confirm({
    title: "删除准生产案例",
    content: `确定删除${label}？仅删除准生产快照，不会删除项目管理中的源案例。`,
    okText: "删除",
    cancelText: "取消",
    okType: "danger",
    centered: true,
    onOk: async () => {
      deleting.value = true;
      try {
        const result = single
          ? await deleteManagedCase(caseIds[0])
          : await deleteManagedCases(caseIds);
        clearSelection();
        await Promise.all([loadCases(), loadOptions()]);
        if (detailCase.value && caseIds.includes(detailCase.value.id)) {
          detailDrawerOpen.value = false;
          detailCase.value = null;
        }
        message.success(`已删除 ${result.deleted} 条准生产案例`);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "删除失败，请重试",
        );
      } finally {
        deleting.value = false;
      }
    },
  });
}

function deleteSelected() {
  confirmDeleteCases(
    [...selectedKeys.value],
    `选中的 ${selectedKeys.value.length} 条案例`,
  );
}

function deleteCurrentCase() {
  if (!detailCase.value) return;
  confirmDeleteCases(
    [detailCase.value.id],
    `案例「${detailCase.value.caseNo || detailCase.value.title}」`,
    true,
  );
}

function onCaseUpdated(updated: ManagedCaseRow) {
  detailCase.value = updated;
  const index = cases.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) cases.value[index] = updated;
  if (selectedRows.value.has(updated.id)) {
    selectedRows.value.set(updated.id, updated);
  }
}

async function loadCases() {
  if (running.value) return;
  if (loadTimer) clearTimeout(loadTimer);
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = "";
  try {
    const result = await listManagedCases({
      ...filters(),
      page: currentPage.value,
      pageSize: pageSize.value,
    });
    if (sequence !== requestSequence) return;
    const lastPage = Math.max(1, Math.ceil(result.count / pageSize.value));
    totalCount.value = result.count;
    if (currentPage.value > lastPage) {
      currentPage.value = lastPage;
      return;
    }
    cases.value = result.rows;
    // 当前页已勾选项同步最新数据，不会丢失其他页的选择。
    for (const row of result.rows)
      if (selectedRows.value.has(row.id)) selectedRows.value.set(row.id, row);
    tableArea.value?.querySelector(".ant-table-body")?.scrollTo({ top: 0 });
  } catch {
    if (sequence === requestSequence) {
      cases.value = [];
      totalCount.value = 0;
      loadError.value = "案例加载失败，请稍后重试。";
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}
async function loadOptions() {
  const sequence = ++optionsSequence;
  try {
    const result = await getManagedCaseOptions({
      projectId: projectId.value,
      transactionId: transactionId.value,
    });
    if (sequence === optionsSequence) filterOptions.value = result;
  } catch {
    if (sequence === optionsSequence)
      message.error("筛选项加载失败，请稍后重试");
  }
}
async function selectAllMatching() {
  const sequence = ++selectionSequence;
  selecting.value = true;
  try {
    const rows = await selectManagedCases(filters());
    if (sequence !== selectionSequence) return;
    selectedRows.value = new Map(rows.map((row) => [row.id, row]));
    selectedKeys.value = rows.map((row) => row.id);
  } catch {
    if (sequence === selectionSequence) message.error("选择失败，请重试");
  } finally {
    if (sequence === selectionSequence) selecting.value = false;
  }
}
watch(projectId, () => {
  transactionId.value = undefined;
  applicationFilter.value = undefined;
});
watch(transactionId, () => {
  applicationFilter.value = undefined;
});
watch([projectId, transactionId], () => {
  void loadOptions();
});
watch([projectId, transactionId, applicationFilter], () => {
  clearSelection();
  executionOpen.value = false;
  currentPage.value = 1;
});
watch(pageSize, () => {
  currentPage.value = 1;
});
watch(
  [
    projectId,
    transactionId,
    applicationFilter,
    currentPage,
    pageSize,
  ],
  () => {
    requestSequence += 1; // 筛选变化后立即使旧请求失效
    cases.value = [];
    loading.value = true;
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => void loadCases(), 0);
  },
);
async function exportSelected() {
  if (exporting.value) return;
  exportOpen.value = true;
  designer.value = undefined;
  exportApplicationNode.value = undefined;
  try {
    const [users] = await Promise.all([
      listCaseDesigners(),
      ensureApplicationTree(),
    ]);
    designerOptions.value = users.map((user) => ({
      value: user.userName,
      label: `${user.nickName}（${user.userName}）`,
      user
    }));
  } catch {
    message.error("加载导出选项失败，请重试");
  }
}
function mapApplicationNode(
  node: CaseApplicationNode,
  parents: string[] = [],
): ApplicationTreeNode {
  const id = String(node.id);
  const cached = applicationChildrenCache.get(id);
  const children = node.children ?? cached;
  const path = [...parents, node.name].filter(Boolean);
  return {
    id,
    name: node.name,
    key: id,
    value: id,
    title: node.name,
    fullPath: `/${path.join("/")}`,
    isLeaf: node.isLeaf ?? children?.length === 0,
    ...(children
      ? { children: children.map((child) => mapApplicationNode(child, path)) }
      : {}),
  };
}
async function ensureApplicationTree() {
  if (applicationTree.value.length) return;
  const systems = await listCaseApplicationSystems();
  applicationTree.value = systems.map((node) => mapApplicationNode(node));
}
async function loadApplicationChildren(node: any): Promise<void> {
  const source = node?.dataRef ?? node;
  const parentId = String(source?.id ?? source?.value ?? source?.key ?? "");
  if (!parentId || source?.children?.length) return;
  const cached = applicationChildrenCache.get(parentId);
  const children = cached ?? (await listCaseApplicationChildren(parentId));
  applicationChildrenCache.set(parentId, children);
  const parentPath = findApplicationPath(applicationTree.value, parentId) ?? [];
  const mapped = children.map((child) => mapApplicationNode(child, parentPath));
  const update = (nodes: ApplicationTreeNode[]): ApplicationTreeNode[] =>
    nodes.map((item) => {
      if (String(item.key) === parentId)
        return { ...item, children: mapped, isLeaf: mapped.length === 0 };
      if (item.children?.length)
        return { ...item, children: update(item.children) };
      return item;
    });
  applicationTree.value = update(applicationTree.value);
}
function findApplicationPath(
  nodes: ApplicationTreeNode[],
  targetId: string,
  parents: string[] = [],
): string[] | undefined {
  for (const node of nodes) {
    const next = [...parents, String(node.title ?? node.name ?? "")].filter(
      Boolean,
    );
    if (String(node.id) === targetId) return next;
    if (node.children?.length) {
      const found = findApplicationPath(node.children, targetId, next);
      if (found) return found;
    }
  }
  return undefined;
}
async function confirmExport() {
  if (!designer.value || !exportApplicationNode.value) return;
  if (selectedKeys.value.length > 1000) {
    message.warning("一次最多导出 1000 条案例");
    return;
  }
  const applicationPath = findApplicationPath(
    applicationTree.value,
    exportApplicationNode.value,
  );
  if (!applicationPath?.length) {
    message.warning("归属应用路径加载不完整，请重新展开并选择具体节点");
    return;
  }
  exporting.value = true;
  try {
    const rows: ManagedCaseRow[] = [];
    for (let index = 0; index < selectedKeys.value.length; index += 100) {
      rows.push(
        ...(await getManagedCaseDetails(
          selectedKeys.value.slice(index, index + 100),
        )),
      );
    }
    const picked = designerOptions.value.find((o) => o.value === designer.value);
    const file = await exportCaseTemplate({
      caseIds: rows.map((row) => row.id),
      designer: picked?.user?.nickName,
      applicationPath: `/${applicationPath.join("/")}`,
    });
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    exportOpen.value = false;
  } catch {
    message.error("案例导出失败，请稍后重试");
  } finally {
    exporting.value = false;
  }
}
async function prepareExecution() {
  if (running.value || publishing.value) return;
  if (selectedCases.value.some((c) => !c.enabled)) {
    message.warning("选中案例包含未启用案例，请先启用或取消勾选");
    return;
  }
  executionVersionId.value = undefined;
  executionApplicationId.value = undefined;
  executionRoundId.value = undefined;
  executionApplicationOptions.value = [];
  executionRoundOptions.value = [];
  executionOpen.value = true;
  executionOptionsLoading.value = true;
  try {
    const versions = await listExecutionVersions();
    executionVersionOptions.value = versions.map((item) => ({
      value: item.id,
      label: item.name,
    }));
  } catch {
    message.error("加载执行版本失败，请重试");
  } finally {
    executionOptionsLoading.value = false;
  }
}
async function onExecutionVersionChange(value?: string) {
  executionApplicationId.value = undefined;
  executionRoundId.value = undefined;
  executionApplicationOptions.value = [];
  executionRoundOptions.value = [];
  if (!value) return;
  executionPlansLoading.value = true;
  try {
    const plans = await listExecutionPlans(value, "0");
    executionApplicationOptions.value = plans.map((item) => ({ value: item.id, label: item.name }));
  } catch {
    message.error("加载应用失败，请重试");
  } finally {
    executionPlansLoading.value = false;
  }
}
async function onExecutionApplicationChange(value?: string) {
  executionRoundId.value = undefined;
  executionRoundOptions.value = [];
  if (!value || !executionVersionId.value) return;
  executionRoundsLoading.value = true;
  try {
    const plans = await listExecutionPlans(executionVersionId.value, value);
    executionRoundOptions.value = plans.map((item) => ({
      value: item.id,
      label: item.roundNum == null ? item.name : `${item.name}（第 ${item.roundNum} 轮）`,
    }));
  } catch {
    message.error("加载轮次失败，请重试");
  } finally {
    executionRoundsLoading.value = false;
  }
}
async function deliver(result: Result) {
  if (!result.runId || result.publishing) return;
  result.publishing = true;
  result.delivery = "生成并上传报告中";
  try {
    const published = await publishCaseReport(
      result.projectId,
      result.transactionId,
      result.runId,
      { versionId: executionVersionId.value!, applicationId: executionApplicationId.value!, roundId: executionRoundId.value! },
    );
    result.reportUrl = published.reportUrl;
    result.delivery =
      published.notificationStatus === "queued"
        ? "报告已上传 · 通知已入队"
        : "报告已上传 · 通知未启用或缺少接收人";
  } catch {
    result.delivery = "报告发布失败，请重试（不会重新执行案例）";
  } finally {
    result.publishing = false;
  }
}
async function runSelected() {
  if (running.value || publishing.value || !selectedCases.value.length) return;
  if (!executionVersionId.value || !executionApplicationId.value || !executionRoundId.value) {
    message.warning("请选择版本、应用和轮次");
    return;
  }
  results.value = selectedCases.value.map((c) => ({
    caseId: c.id,
    title: c.title,
    projectId: c.projectId,
    transactionId: c.transactionId,
    execution: "待执行",
    delivery: "—",
  }));
  running.value = true;
  executionOpen.value = false;
  try {
    for (const result of results.value) {
      result.execution = "执行中";
      try {
        const run = await runApiCases(result.projectId, result.transactionId, {
          caseIds: [result.caseId],
          caseSource: "preproduction",
        });
        result.runId = run.id;
        result.execution =
          run.totalCount === 1 && run.passedCount === 1 ? "通过" : "未通过";
        await deliver(result);
      } catch (error) {
        result.execution = "执行请求失败";
        result.delivery = error instanceof Error
          ? error.message
          : "执行请求失败，请检查案例步骤配置";
        // 配置类 400（例如步骤未配置环境地址）对后续案例同样无效，立即停止，避免重复请求。
        if (error instanceof Error && /未指定环境地址|未指定执行环境|Bad Request/i.test(error.message)) {
          for (const pending of results.value) {
            if (pending.execution === "待执行") {
              pending.execution = "未执行";
              pending.delivery = "因前置案例配置错误已跳过";
            }
          }
          message.error(error.message);
          break;
        }
      }
    }
  } finally {
    running.value = false;
  }
}
function preventUnload(event: BeforeUnloadEvent) {
  if (running.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(() => {
  if (running.value) {
    message.warning("批量执行尚未结束，请完成后离开");
    return false;
  }
});
onMounted(() => {
  tableResizeObserver = new ResizeObserver(() => {
    if (tableArea.value) {
      const headerHeight =
        tableArea.value
          .querySelector(".ant-table-header")
          ?.getBoundingClientRect().height ?? 48;
      tableBodyHeight.value = Math.max(
        120,
        tableArea.value.clientHeight - headerHeight - 2,
      );
    }
  });
  if (tableArea.value) tableResizeObserver.observe(tableArea.value);
  if (getUserName()) {
    void loadCases();
    void loadOptions();
  }
  window.addEventListener("beforeunload", preventUnload);
});
onBeforeUnmount(() => {
  requestSequence += 1;
  optionsSequence += 1;
  selectionSequence += 1;
  if (loadTimer) clearTimeout(loadTimer);
  tableResizeObserver?.disconnect();
  window.removeEventListener("beforeunload", preventUnload);
});
</script>

<style scoped>
.case-management-page {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
  background: var(--cf-canvas, #f5f6f8);
}
.management-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.management-subtitle {
  margin: 3px 0 0;
  color: #667085;
  font-size: 13px;
}
.module-select {
  width: 160px;
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
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
}
.management-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.management-card {
  border: 1px solid var(--cf-border, #e5e7eb);
  border-radius: 10px;
  background: white;
  padding: 16px;
}
.case-list-card {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 173px);
  min-height: 400px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}
.list-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cf-border);
}
.list-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.list-card-title strong {
  color: var(--cf-text);
  font-size: 14px;
}
.list-card-count {
  padding: 0 8px;
  border-radius: 10px;
  background: var(--cf-brand-soft);
  color: var(--cf-brand);
  font-size: 12px;
  line-height: 20px;
}
.filters {
  padding: 14px 16px 0;
  display: flex;
  gap: 12px 20px;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
  padding-bottom: 14px;
}
.filters .filter-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 13px;
  color: var(--cf-text-secondary, #687280);
}
.filters .ant-select {
  width: 200px;
}
.filters .filter-application-field :deep(.ant-select),
.filters .filter-application-field :deep(.ant-tree-select) {
  width: 220px;
}
.filters .ant-input-affix-wrapper {
  width: 200px;
}
.filters :deep(.ant-checkbox-wrapper) {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  white-space: nowrap;
  margin: 0;
}
.list-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
  font-size: 13px;
  color: var(--cf-text-secondary, #687280);
}
.list-summary strong {
  color: var(--cf-brand);
}
.case-table-area {
  padding: 0 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.case-table-area :deep(.ant-table-thead > tr > th) {
  background: #f7f8fa;
}
.case-table-area :deep(.ant-table-cell) {
  padding-top: 12px;
  padding-bottom: 12px;
}
.case-table-area :deep(.ant-table-row) {
  cursor: pointer;
}
.application-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.application-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cf-text-secondary, #687280);
}
.case-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--cf-border, #e5e7eb);
}
.muted {
  color: var(--cf-text-secondary, #687280);
  font-size: 12px;
  font-weight: normal;
}
.management-card :deep(.ant-alert) {
  margin: 0 16px 12px;
  flex-shrink: 0;
}
.results-card {
  margin-top: 16px;
}
.results-card h2 {
  font-size: 18px;
}
.execution-progress {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--cf-border, #e5e7eb);
  background: #fafafa;
}
.execution-progress-head {
  display: flex;
  justify-content: space-between;
  color: var(--cf-text-secondary, #687280);
  font-size: 13px;
}
.execution-progress-head strong {
  color: var(--cf-text, #1f2937);
}
.execution-progress-detail {
  color: var(--cf-text-secondary, #687280);
  font-size: 12px;
}
.report-link {
  margin-left: 12px;
}
.execution-fields {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 14px 12px;
  margin-top: 20px;
}
.export-field {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.export-field:last-child {
  margin-bottom: 0;
}
.export-field label {
  color: var(--cf-text);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}
.export-field :deep(.ant-select),
.export-field :deep(.ant-tree-select),
.export-field :deep(.ant-select-selector) {
  width: 100%;
  min-width: 0;
}
.export-field :deep(.ant-select-selector) {
  min-height: 38px;
  border-radius: 6px;
}
.export-field :deep(.ant-select-selection-item) {
  max-width: calc(100% - 24px);
}
@media (max-width: 900px) {
  .case-management-page {
    padding: 12px;
  }
  .management-header {
    align-items: flex-start;
  }
  .management-actions {
    justify-content: flex-end;
  }
  .management-card:not(.case-list-card) {
    padding: 12px;
  }
  .list-card-head {
    flex-wrap: wrap;
  }
  .filters {
    gap: 10px;
  }
  .filters .filter-field {
    flex: 1 1 260px;
  }
  .filters .ant-select,
  .filters .ant-input-affix-wrapper {
    flex: 1;
    width: auto;
    min-width: 140px;
  }
  .case-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
