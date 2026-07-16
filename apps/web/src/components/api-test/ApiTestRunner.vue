<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-runner-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>执行平台</h2>
          <p>维护环境与执行集，查看执行状态与结果</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button type="primary" @click="openCreateSet">
          <template #icon><PlusOutlined /></template>
          新建执行集
        </a-button>
        <a-button :type="batchDeleteMode ? 'primary' : 'default'" @click="toggleBatchDeleteMode">
          {{ batchDeleteMode ? '退出批量' : '批量删除' }}
        </a-button>
      </div>
    </div>

    <div v-if="apiStore.executionSetListTotal" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel">
        <div class="test-point-list-head">
          <strong>执行集</strong>
          <span>{{ apiStore.executionSetListTotal }} 个</span>
        </div>
        <div v-if="batchDeleteMode" class="list-toolbar batch-list-toolbar exec-set-list-toolbar">
          <a-checkbox
            :checked="allSetsSelected"
            :indeterminate="setSelectionIndeterminate"
            @change="toggleSelectAllSets"
          >
            全选当前页
          </a-checkbox>
          <span class="exec-set-list-selection">
            已选 {{ selectedSetIds.length }} / {{ apiStore.executionSetListTotal }}
          </span>
        </div>
        <div class="test-point-list-scroll">
          <article
            v-for="set in apiStore.executionSets"
            :key="set.id"
            class="test-point-card browse-card exec-set-card"
            :class="{
              active: isActiveSetCard(set.id),
              'batch-card': batchDeleteMode,
            }"
            @click="handleSetCardClick(set.id)"
          >
            <div class="test-point-card-head">
              <a-checkbox
                v-if="batchDeleteMode"
                :checked="selectedSetIds.includes(set.id)"
                @click.stop
                @change="(e: unknown) => onToggleSetSelect(set.id, readCheckboxChecked(e))"
              />
              <div class="test-point-card-title">
                <strong>{{ set.name }}</strong>
                <small>{{ set.caseCount ?? 0 }} 条案例</small>
              </div>
              <div class="test-point-card-status">
                <a-tag v-if="set.lastRunStatus" :color="runStatusColor(set)">
                  {{ runStatusLabel(set) }}
                </a-tag>
                <a-tag v-else>未执行</a-tag>
              </div>
            </div>
          </article>
        </div>
        <div v-if="showExecutionSetPagination" class="exec-set-list-pagination">
          <a-pagination
            size="small"
            :current="apiStore.executionSetListPage"
            :page-size="apiStore.executionSetListPageSize"
            :total="apiStore.executionSetListTotal"
            :show-size-changer="true"
            :page-size-options="pageSizeOptions"
            @change="onExecutionSetPageChange"
            @showSizeChange="onExecutionSetPageChange"
          />
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div
          v-if="batchDeleteMode && selectedSetIds.length"
          class="instruction-editor-shell"
        >
          <div class="instruction-editor-body">
            <div class="editor-hero editor-hero-batch">
              <div>
                <h3>已选 {{ selectedSetIds.length }} 个执行集</h3>
                <p>确认后可批量删除所选执行集</p>
              </div>
              <a-tag color="processing">批量删除</a-tag>
            </div>
            <div class="editor-block">
              <div class="editor-block-title">已选执行集</div>
              <ul class="batch-set-summary-list">
                <li
                  v-for="row in selectedSetRows"
                  :key="row.id"
                  class="batch-set-summary-item"
                >
                  <strong class="batch-set-summary-title" :title="row.name">
                    {{ row.name }}
                  </strong>
                  <span class="batch-set-summary-meta">
                    {{ row.caseCount ?? 0 }} 条案例
                  </span>
                  <span class="batch-set-summary-status">
                    {{ runStatusLabel(row) }}
                  </span>
                </li>
                <li
                  v-if="selectedSetIds.length > selectedSetRows.length"
                  class="batch-set-summary-more"
                >
                  另有 {{ selectedSetIds.length - selectedSetRows.length }} 个在其他分页
                </li>
              </ul>
            </div>
          </div>
          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="!selectedSetIds.length" @click="onBatchDeleteSets">
              <template #icon><DeleteOutlined /></template>
              批量删除
            </a-button>
          </div>
        </div>

        <div v-else-if="activeSet && !batchDeleteMode" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="exec-set-detail-header">
              <div class="exec-set-detail-intro">
                <h3>{{ activeSet.name }}</h3>
                <p>
                  <span class="exec-set-case-count">{{ activeSet.caseCount ?? 0 }} 条案例</span>
                  <span class="exec-set-detail-divider">·</span>
                  <span class="exec-set-status-badge" :class="runStatusClass(activeSet)">
                    <span class="exec-set-status-dot" />
                    {{ runStatusLabel(activeSet) }}
                  </span>
                </p>
              </div>
              <div class="exec-set-actions action-toolbar">
                <a-button
                  type="primary"
                  :loading="apiStore.running"
                  :disabled="!activeSet.caseCount || apiStore.running"
                  @click="openRunModal"
                >
                  <template #icon><PlayCircleOutlined /></template>
                  {{ apiStore.running ? '执行中…' : '执行' }}
                </a-button>
                <a-button @click="openManageCases">
                  <template #icon><SettingOutlined /></template>
                  管理案例
                </a-button>
              </div>
            </div>

            <a-alert
              v-if="apiStore.running"
              type="info"
              show-icon
              class="exec-run-progress-alert"
              message="正在后台执行案例，完成后将自动刷新结果，可继续浏览页面"
            />

            <div class="exec-set-detail-tabs">
              <a-segmented v-model:value="detailTab" :options="detailTabOptions" />
            </div>

            <div v-if="detailTab === 'cases'" class="exec-linked-case-detail">
              <a-alert
                v-if="hiddenLinkedCaseCount > 0"
                type="warning"
                :show-icon="false"
                :message="`当前版本过滤下，执行集中有 ${hiddenLinkedCaseCount} 条案例不可见（非当前版本）`"
                class="exec-set-hidden-alert"
              />
              <a-table
                v-if="linkedSetCases.length"
                class="run-detail-table exec-linked-table"
                size="small"
                row-key="id"
                :data-source="linkedSetCases"
                :columns="linkedCaseColumns"
                :pagination="false"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'title'">
                    <span class="linked-case-title" :title="record.title">{{ record.title || '未命名案例' }}</span>
                  </template>
                  <template v-if="column.key === 'caseNo'">
                    <span
                      class="linked-case-no"
                      :title="record.caseNo || record.transactionCode || '—'"
                    >{{ record.caseNo || record.transactionCode || '—' }}</span>
                  </template>
                  <template v-if="column.key === 'version'">
                    <a-tag
                      v-if="record.metadata?.versionCode"
                      size="small"
                    >
                      {{ record.metadata.versionCode }}
                    </a-tag>
                    <span v-else>—</span>
                  </template>
                  <template v-if="column.key === 'profile'">
                    <span
                      class="case-profile-badge linked-case-profile-badge"
                      :class="`profile-${caseProfileColor(record.request)}`"
                      :title="caseProfileLabel(record.request)"
                    >
                      {{ caseProfileLabel(record.request) }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'polarity'">
                    <span class="polarity-pill polarity-pill--sm" :class="record.polarity">
                      {{ record.polarity === 'negative' ? '反' : '正' }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-button size="small" danger type="link" @click="removeLinkedCase(record.id)">
                      移除
                    </a-button>
                  </template>
                </template>
              </a-table>
              <div v-else class="exec-set-empty-detail">
                <InboxOutlined class="exec-set-empty-icon" />
                <p class="exec-set-empty-text">{{ emptyLinkedCasesMessage }}</p>
              </div>
            </div>

            <div v-else-if="apiStore.transactionRuns.length" class="exec-run-detail">
              <div class="exec-run-history-panel">
                <div class="exec-run-history-head">
                  <span class="exec-run-history-title">执行历史</span>
                  <span class="exec-run-history-count">共 {{ apiStore.transactionRuns.length }} 次</span>
                </div>
                <div class="exec-run-history-track">
                  <div
                    v-for="item in apiStore.transactionRuns"
                    :key="item.id"
                    class="exec-run-history-entry"
                    :class="[
                      `exec-run-history-entry--${runHistoryChipClass(item)}`,
                      { expanded: expandedRunId === item.id },
                    ]"
                  >
                    <div
                      class="exec-run-history-item"
                      :class="[
                        `exec-run-history-item--${runHistoryChipClass(item)}`,
                        { active: expandedRunId === item.id },
                      ]"
                    >
                      <div class="exec-run-history-item-main" @click="toggleRunDetail(item.id)">
                        <span class="exec-run-history-item-stats">
                          <span class="exec-run-history-stat">
                            总数 <strong>{{ item.totalCount }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--pass">
                            通过 <strong>{{ item.passedCount }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--fail">
                            失败 <strong>{{ runHistoryFailedCount(item) }}</strong>
                          </span>
                          <span class="exec-run-history-stat exec-run-history-stat--rate">
                            通过率 <strong>{{ runHistoryPassRate(item) }}%</strong>
                          </span>
                        </span>
                        <span class="exec-run-history-item-outcome">{{ runHistoryOutcomeLabel(item) }}</span>
                        <span class="exec-run-history-item-trailing">
                          <span class="exec-run-history-item-time">{{ formatHistoryTime(item.createdAt) }}</span>
                          <a-tooltip title="重新执行">
                            <a-button
                              type="text"
                              size="small"
                              class="exec-run-history-rerun"
                              :loading="rerunningRunId === item.id"
                              :disabled="apiStore.running && rerunningRunId !== item.id"
                              @click.stop="onRerunHistory(item.id)"
                            >
                              <template #icon><RedoOutlined /></template>
                            </a-button>
                          </a-tooltip>
                          <a-tooltip title="删除">
                            <a-button
                              type="text"
                              size="small"
                              class="exec-run-history-delete"
                              :loading="deletingRunId === item.id"
                              :disabled="apiStore.running || (!!deletingRunId && deletingRunId !== item.id)"
                              @click.stop="onDeleteHistory(item.id)"
                            >
                              <template #icon><DeleteOutlined /></template>
                            </a-button>
                          </a-tooltip>
                          <DownOutlined class="exec-run-history-item-chevron" />
                        </span>
                      </div>
                      <span class="exec-run-history-item-bar" aria-hidden="true">
                        <i :style="{ width: `${runHistoryPassRate(item)}%` }" />
                      </span>
                    </div>
                    <div v-if="expandedRunId === item.id" class="exec-run-history-detail">
                      <a-spin :spinning="runDetailLoading">
                        <div class="exec-run-results-header">
                          <h4 class="exec-run-results-title">案例明细</h4>
                          <span class="exec-run-results-hint">点击案例名称或左侧按钮展开查看请求、响应与断言</span>
                        </div>
                        <a-table
                          v-if="apiStore.activeRun?.id === item.id"
                          class="exec-run-results-table"
                          size="small"
                          row-key="id"
                          :data-source="apiStore.activeRun.items"
                          :columns="itemColumns"
                          :pagination="false"
                          :expanded-row-keys="expandedKeys"
                          @expand="onExpand"
                        >
                          <template #bodyCell="{ column, record }">
                            <template v-if="column.key === 'caseTitle'">
                              <span class="exec-run-case-title" :title="record.caseTitle">
                                {{ record.caseTitle || '未命名案例' }}
                              </span>
                            </template>
                            <template v-else-if="column.key === 'status'">
                              <span
                                class="exec-run-status-pill"
                                :class="`exec-run-status-pill--${record.status}`"
                              >
                                {{ runItemStatusLabel(record.status) }}
                              </span>
                            </template>
                            <template v-else-if="column.key === 'durationMs'">
                              <span class="exec-run-duration">{{ formatDuration(record.durationMs) }}</span>
                            </template>
                          </template>
                          <template #expandedRowRender="{ record }">
                            <div class="exec-run-expand">
                              <a-tabs size="small" class="exec-run-expand-tabs">
                                <a-tab-pane key="req" tab="请求">
                                  <div class="exec-run-snapshot-panel">
                                    <div
                                      v-if="splitSnapshot(record.requestSnapshot).body"
                                      class="exec-run-snapshot-section"
                                    >
                                      <div class="exec-run-snapshot-label">报文 Body</div>
                                      <pre class="exec-run-snapshot exec-run-snapshot--body">{{
                                        splitSnapshot(record.requestSnapshot).body
                                      }}</pre>
                                    </div>
                                    <div class="exec-run-snapshot-section">
                                      <div class="exec-run-snapshot-label">请求信息</div>
                                      <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
                                        splitSnapshot(record.requestSnapshot).meta
                                      }}</pre>
                                    </div>
                                  </div>
                                </a-tab-pane>
                                <a-tab-pane key="res" tab="响应">
                                  <div class="exec-run-snapshot-panel">
                                    <div
                                      v-if="splitSnapshot(record.responseSnapshot).body"
                                      class="exec-run-snapshot-section"
                                    >
                                      <div class="exec-run-snapshot-label">响应 Body</div>
                                      <pre class="exec-run-snapshot exec-run-snapshot--body">{{
                                        splitSnapshot(record.responseSnapshot).body
                                      }}</pre>
                                    </div>
                                    <div class="exec-run-snapshot-section">
                                      <div class="exec-run-snapshot-label">响应信息</div>
                                      <pre class="exec-run-snapshot exec-run-snapshot--meta">{{
                                        splitSnapshot(record.responseSnapshot).meta
                                      }}</pre>
                                    </div>
                                  </div>
                                </a-tab-pane>
                                <a-tab-pane key="assert" tab="断言比对">
                                  <a-table
                                    class="exec-run-assert-table"
                                    size="small"
                                    :pagination="false"
                                    :data-source="record.assertions"
                                    :columns="assertionColumns"
                                    row-key="name"
                                  >
                                    <template #bodyCell="{ column, record: assertion }">
                                      <template v-if="column.key === 'passed'">
                                        <span
                                          class="exec-run-status-pill exec-run-status-pill--sm"
                                          :class="assertion.passed ? 'exec-run-status-pill--passed' : 'exec-run-status-pill--failed'"
                                        >
                                          {{ assertion.passed ? '通过' : '失败' }}
                                        </span>
                                      </template>
                                      <template v-else-if="column.key === 'expected' || column.key === 'actual'">
                                        <pre class="exec-run-assert-value">{{
                                          formatRunSnapshotField(assertion[column.key as 'expected' | 'actual'])
                                        }}</pre>
                                      </template>
                                    </template>
                                  </a-table>
                                </a-tab-pane>
                              </a-tabs>
                            </div>
                          </template>
                        </a-table>
                      </a-spin>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="exec-set-empty-detail exec-run-empty">
              <a-empty description="尚未执行，添加案例后点击「执行」" />
            </div>
          </div>
          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger @click="onDeleteSet">
              <template #icon><DeleteOutlined /></template>
              删除
            </a-button>
          </div>
        </div>
        <div v-else class="instruction-editor-placeholder">
          <a-empty
            :description="
              batchDeleteMode
                ? '请从左侧勾选要删除的执行集'
                : '请选择左侧执行集'
            "
          />
        </div>
      </div>
    </div>

    <a-empty v-else class="empty-state" description="暂无执行集，请先新建并引入案例" />

    <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />

    <a-modal v-model:open="createSetOpen" title="新建执行集" centered @ok="onCreateSet">
      <a-form layout="vertical">
        <a-form-item label="执行集名称" required>
          <a-input v-model:value="newSetName" placeholder="如 冒烟测试集" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="manageCasesOpen"
      title="管理执行集案例"
      width="800px"
      centered
      :confirm-loading="manageCasesSaving"
      @ok="onSaveCases"
    >
      <div class="manage-hint">
        <InfoCircleOutlined />
        <span>同一执行集内案例不可重复；同一案例可被多个执行集引用。</span>
      </div>
      <div class="manage-cases-toolbar">
        <div class="manage-cases-toolbar-main">
          <a-checkbox
            :checked="allManageCasesSelected"
            :indeterminate="manageCasesSelectionIndeterminate"
            @change="toggleSelectAllManageCases"
          >
            全选当前页
          </a-checkbox>
          <a-select
            v-if="manageCasesVersionOptions.length > 1"
            v-model:value="manageCasesVersionFilter"
            :options="manageCasesVersionOptions"
            size="small"
            class="manage-cases-version-filter"
            :popup-match-select-width="false"
            :dropdown-style="{ minWidth: '180px' }"
            @change="onManageCasesVersionChange"
          />
          <a-select
            v-if="manageCasesChannelOptions.length > 1"
            v-model:value="manageCasesChannelFilter"
            :options="manageCasesChannelOptions"
            size="small"
            class="manage-cases-channel-filter"
            @change="onManageCasesChannelChange"
          />
        </div>
        <span class="manage-cases-selection">
          已选 <strong>{{ selectedCaseIds.length }}</strong> 条
        </span>
      </div>
      <a-spin :spinning="manageCasesLoading">
        <div v-if="manageCasesList.length" class="manage-case-list">
          <label
            v-for="item in manageCasesList"
            :key="item.id"
            class="manage-case-row"
            :class="{ 'manage-case-row--selected': selectedCaseIds.includes(item.id) }"
          >
            <a-checkbox
              :checked="selectedCaseIds.includes(item.id)"
              @change="(e: unknown) => onToggleManageCase(item.id, readCheckboxChecked(e))"
            />
            <div class="manage-case-main">
              <div class="manage-case-title-row">
                <strong :title="item.title">{{ item.title || '未命名案例' }}</strong>
                <a-tag
                  v-if="item.metadata?.versionCode"
                  size="small"
                  class="manage-case-version-tag"
                >
                  {{ item.metadata.versionCode }}
                </a-tag>
              </div>
              <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
            </div>
            <span class="case-profile-badge" :class="`profile-${caseProfileColor(item.request)}`">
              {{ caseProfileLabel(item.request) }}
            </span>
            <span class="polarity-pill polarity-pill--sm" :class="item.polarity">
              {{ item.polarity === 'negative' ? '反' : '正' }}
            </span>
          </label>
        </div>
        <div v-else class="manage-case-empty">
          <InboxOutlined class="manage-case-empty-icon" />
          <p>{{ manageCasesEmptyHint }}</p>
        </div>
      </a-spin>
      <div v-if="manageCasesTotal > 0" class="manage-cases-pagination">
        <a-pagination
          size="small"
          :current="manageCasesPage"
          :page-size="manageCasesPageSize"
          :total="manageCasesTotal"
          :show-size-changer="true"
          :page-size-options="pageSizeOptions"
          @change="onManageCasesPageChange"
          @showSizeChange="onManageCasesPageChange"
        />
      </div>
    </a-modal>

    <a-modal
      v-model:open="runModalOpen"
      title="执行"
      centered
      ok-text="开始执行"
      cancel-text="取消"
      :mask-closable="!apiStore.running"
      @ok="onConfirmRun"
    >
      每条案例将使用案例中已指定的环境、地址和编码执行。
    </a-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  DeleteOutlined,
  DownOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RedoOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import {
  caseForgePageSizeOptionLabels,
  executionProfileBadgeColor,
  normalizeCaseForgePageSize,
  resolveExecutionProfile,
} from '@case-forge/shared';
import type { ApiCaseRequest } from '@case-forge/shared';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiExecutionSetRow, ApiTestCaseRow } from '@/api/apiTestClient';
import { listAllApiCases, listApiCases } from '@/api/apiTestClient';
import {
  formatRunSnapshotField,
  splitRunSnapshotForDisplay,
} from '@/utils/casePayloadFormat.util';

const apiStore = useApiTestStore();
const pageSizeOptions = caseForgePageSizeOptionLabels();
const envModalOpen = ref(false);

const createSetOpen = ref(false);
const manageCasesOpen = ref(false);
const runModalOpen = ref(false);
const batchDeleteMode = ref(false);
const newSetName = ref('');
const selectedCaseIds = ref<string[]>([]);
const selectedSetIds = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const expandedRunId = ref<string | null>(null);
const rerunningRunId = ref<string | null>(null);
const deletingRunId = ref<string | null>(null);
const runDetailLoading = ref(false);
const manageCasesList = ref<ApiTestCaseRow[]>([]);
const manageCasesPage = ref(1);
const manageCasesPageSize = ref(normalizeCaseForgePageSize(10));
const manageCasesTotal = ref(0);
const manageCasesLoading = ref(false);
const manageCasesSaving = ref(false);
const manageCasesVersionFilter = ref<string | null>(null);
const manageCasesVersionOptions = ref<Array<{ value: string | null; label: string }>>([]);
const manageCasesChannelFilter = ref<string | null>(null);
const manageCasesChannelOptions = ref<Array<{ value: string | null; label: string }>>([]);
const manageCasesEmptyHint = computed(() =>
  manageCasesVersionFilter.value != null || manageCasesChannelFilter.value != null
    ? '当前筛选条件下暂无案例'
    : '暂无案例，请先在案例编辑中创建',
);
const detailTab = ref<'cases' | 'result'>('cases');
const detailTabOptions = [
  { label: '关联案例', value: 'cases' },
  { label: '执行结果', value: 'result' },
];

const activeSet = computed(() => apiStore.activeExecutionSet);

const setLookup = computed(() => {
  const map = new Map<string, ApiExecutionSetRow>();
  for (const row of apiStore.executionSets) {
    map.set(row.id, row);
  }
  if (apiStore.activeExecutionSet) {
    map.set(apiStore.activeExecutionSet.id, apiStore.activeExecutionSet);
  }
  return map;
});

const selectedSetRows = computed(() =>
  selectedSetIds.value
    .map((id) => setLookup.value.get(id))
    .filter((row): row is ApiExecutionSetRow => Boolean(row)),
);

const allSetsSelected = computed(
  () =>
    apiStore.executionSets.length > 0 &&
    apiStore.executionSets.every((item) => selectedSetIds.value.includes(item.id)),
);

const setSelectionIndeterminate = computed(() => {
  const pageIds = apiStore.executionSets.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedSetIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
});

const allManageCasesSelected = computed(
  () =>
    manageCasesList.value.length > 0 &&
    manageCasesList.value.every((item) => selectedCaseIds.value.includes(item.id)),
);

const manageCasesSelectionIndeterminate = computed(() => {
  const pageIds = manageCasesList.value.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedCaseIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
});

const showExecutionSetPagination = computed(() => apiStore.executionSetListTotal > 0);

const linkedSetCases = computed(() => {
  const ids = activeSet.value?.caseIds ?? [];
  if (!ids.length) return [];
  const caseMap = new Map(apiStore.runnerCases.map((item) => [item.id, item]));
  return ids.map((id) => caseMap.get(id)).filter((item): item is ApiTestCaseRow => Boolean(item));
});

const hiddenLinkedCaseCount = computed(() => {
  const ids = activeSet.value?.caseIds ?? [];
  if (!ids.length) return 0;
  const validIdSet = new Set(apiStore.runnerCases.map((item) => item.id));
  return ids.filter((id) => !validIdSet.has(id)).length;
});

const emptyLinkedCasesMessage = computed(() => {
  const totalCount = activeSet.value?.caseCount ?? 0;
  const hiddenCount = hiddenLinkedCaseCount.value;
  if (totalCount === 0) {
    return '请先「管理案例」添加案例后重新执行';
  }
  if (hiddenCount > 0) {
    return `有 ${hiddenCount} 条关联案例已删除或不可见，请在「管理案例」中调整`;
  }
  return '关联案例加载失败或案例已不可见，请刷新页面后重试';
});

function caseProfileLabel(request: ApiCaseRequest) {
  return resolveExecutionProfile(request).label;
}

function caseProfileColor(request: ApiCaseRequest) {
  return executionProfileBadgeColor(resolveExecutionProfile(request).transport);
}

watch(detailTab, async (tab) => {
  if (tab !== 'result') return;
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.ensureRunnerRunsLoaded(projectId);
});

function toggleRunItemExpand(recordId: string) {
  expandedKeys.value = expandedKeys.value.includes(recordId) ? [] : [recordId];
}

const itemColumns = [
  {
    title: '案例',
    dataIndex: 'caseTitle',
    key: 'caseTitle',
    ellipsis: true,
    customCell: (record: { id: string }) => ({
      class: 'exec-run-case-cell',
      onClick: () => toggleRunItemExpand(record.id),
    }),
  },
  { title: '状态', dataIndex: 'status', key: 'status', width: 96 },
  { title: '耗时', dataIndex: 'durationMs', key: 'durationMs', width: 88, align: 'right' as const },
];

const linkedCaseColumns = [
  { title: '案例', dataIndex: 'title', key: 'title', ellipsis: true },
  {
    title: '编号',
    dataIndex: 'caseNo',
    key: 'caseNo',
    width: 188,
    customCell: () => ({ class: 'exec-linked-caseno-cell' }),
  },
  { title: '版本', key: 'version', width: 68, align: 'center' as const },
  {
    title: '协议',
    key: 'profile',
    width: 188,
    customCell: () => ({ class: 'exec-linked-profile-cell' }),
  },
  { title: '方向', key: 'polarity', width: 64, align: 'center' as const },
  { title: '操作', key: 'actions', width: 72, align: 'center' as const },
];

const assertionColumns = [
  { title: '断言', dataIndex: 'name', key: 'name', width: 120 },
  { title: '断言值', dataIndex: 'expected', key: 'expected' },
  { title: '实际值', dataIndex: 'actual', key: 'actual' },
  { title: '结果', key: 'passed', width: 72 },
];

function splitSnapshot(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return splitRunSnapshotForDisplay(value as Record<string, unknown>);
  }
  return { meta: formatRunSnapshotField(value), body: null as string | null };
}

function runHistoryChipClass(item: { passedCount: number; totalCount: number }) {
  if (item.totalCount > 0 && item.passedCount === item.totalCount) return 'is-pass';
  if (item.passedCount === 0) return 'is-fail';
  return 'is-partial';
}

function runHistoryOutcomeLabel(item: {
  passedCount: number;
  totalCount: number;
  status?: string;
}) {
  if (item.status === 'running') return '执行中';
  if (item.totalCount > 0 && item.passedCount === item.totalCount) return '全部通过';
  if (item.passedCount === 0) return '全部未通过';
  return '部分通过';
}

function runHistoryPassRate(item: { passedCount: number; totalCount: number }) {
  if (!item.totalCount) return 0;
  return Math.round((item.passedCount / item.totalCount) * 100);
}

function runHistoryFailedCount(item: {
  passedCount: number;
  totalCount: number;
  failedCount?: number;
  errorCount?: number;
}) {
  if (item.failedCount != null || item.errorCount != null) {
    return (item.failedCount ?? 0) + (item.errorCount ?? 0);
  }
  return Math.max(0, item.totalCount - item.passedCount);
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms?: number) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function runStatusColor(set: ApiExecutionSetRow) {
  if (!set.lastRunStatus) return 'default';
  if (set.lastRunStatus === 'running') return 'processing';
  const passed = set.lastPassedCount ?? 0;
  const total = set.lastTotalCount ?? 0;
  if (total > 0 && passed === total) return 'success';
  if (passed === 0) return 'error';
  return 'warning';
}

function runItemStatusLabel(status: string) {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '失败';
  if (status === 'error') return '异常';
  if (status === 'running') return '执行中';
  return status || '未执行';
}

function runStatusLabel(set: ApiExecutionSetRow) {
  if (!set.lastRunStatus) return '未执行';
  if (set.lastRunStatus === 'running') return '执行中';
  const passed = set.lastPassedCount ?? 0;
  const total = set.lastTotalCount ?? 0;
  if (total > 0 && passed === total) return '全部通过';
  if (passed === 0) return '全部未通过';
  return '部分通过';
}

function runStatusClass(set: ApiExecutionSetRow) {
  if (!set.lastRunStatus) return 'status-idle';
  if (set.lastRunStatus === 'running') return 'status-running';
  const passed = set.lastPassedCount ?? 0;
  const total = set.lastTotalCount ?? 0;
  if (passed === total) return 'status-passed';
  return 'status-failed';
}

function toggleBatchDeleteMode() {
  batchDeleteMode.value = !batchDeleteMode.value;
  if (batchDeleteMode.value) {
    selectedSetIds.value = [];
    return;
  }
  if (apiStore.activeExecutionSetId) {
    selectedSetIds.value = [apiStore.activeExecutionSetId];
  }
}

function isActiveSetCard(setId: string) {
  if (batchDeleteMode.value) {
    return selectedSetIds.value.includes(setId);
  }
  return setId === apiStore.activeExecutionSetId;
}

function handleSetCardClick(setId: string) {
  if (batchDeleteMode.value) {
    const checked = !selectedSetIds.value.includes(setId);
    onToggleSetSelect(setId, checked);
    return;
  }
  selectSet(setId);
}

function onToggleSetSelect(setId: string, checked: boolean) {
  if (checked) {
    if (!selectedSetIds.value.includes(setId)) {
      selectedSetIds.value = [...selectedSetIds.value, setId];
    }
  } else {
    selectedSetIds.value = selectedSetIds.value.filter((id) => id !== setId);
  }
}

function toggleSelectAllSets(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  if (checked) {
    const pageIds = apiStore.executionSets.map((item) => item.id);
    selectedSetIds.value = [...new Set([...selectedSetIds.value, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(apiStore.executionSets.map((item) => item.id));
  selectedSetIds.value = selectedSetIds.value.filter((id) => !pageIdSet.has(id));
}

function readCheckboxChecked(event: unknown) {
  const target = (event as { target?: { checked?: boolean } })?.target;
  return Boolean(target?.checked);
}

async function ensureLinkedCasesLoaded() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const caseIds = activeSet.value?.caseIds ?? [];
  if (!projectId || !transactionId || !caseIds.length) {
    return;
  }
  const loadedIds = new Set(apiStore.runnerCases.map((item) => item.id));
  if (!apiStore.runnerCases.length || caseIds.some((id) => !loadedIds.has(id))) {
    await apiStore.refreshRunnerCases(projectId, transactionId);
  }
}

function selectSet(setId: string) {
  detailTab.value = 'cases';
  expandedRunId.value = null;
  expandedKeys.value = [];
  apiStore.selectExecutionSet(setId);
  apiStore.activeRun = null;
  const projectId = apiStore.activeProjectId;
  if (projectId) {
    void apiStore.ensureRunnerRunsLoaded(projectId);
  }
  void ensureLinkedCasesLoaded();
}

function onExecutionSetPageChange(page: number, pageSize: number) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== apiStore.executionSetListPageSize;
  void apiStore.refreshExecutionSets(projectId, transactionId, {
    page: sizeChanged ? 1 : page,
    pageSize: size,
  });
}

function openCreateSet() {
  newSetName.value = `${apiStore.activeTransaction?.code ?? '交易码'}-执行集`;
  createSetOpen.value = true;
}

async function onCreateSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !newSetName.value.trim()) return;
  await apiStore.createExecutionSet(projectId, transactionId, {
    name: newSetName.value.trim(),
  });
  createSetOpen.value = false;
}

function openManageCases() {
  void openManageCasesAsync();
}

async function openManageCasesAsync() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (projectId && transactionId) {
    await apiStore.refreshExecutionSets(projectId, transactionId);
  }
  selectedCaseIds.value = [...(activeSet.value?.caseIds ?? [])];
  manageCasesPage.value = 1;
  manageCasesVersionFilter.value = null;
  manageCasesChannelFilter.value = null;
  manageCasesOpen.value = true;
  await loadManageCasesVersions();
  await loadManageCasesList();
}

async function loadManageCasesVersions() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  const rows = await listAllApiCases(projectId, transactionId).catch(
    () => [] as ApiTestCaseRow[],
  );
  const versions = new Set<string>();
  const channels = new Map<string, string>();
  const currentChannelNames = new Map(
    (apiStore.apiDoc?.generationProfile?.channels ?? []).map((channel) => [channel.id, channel.name]),
  );
  for (const row of rows) {
    const code = row.metadata?.versionCode;
    if (code != null) {
      versions.add(code);
    }
    const channelId = row.metadata?.channelId;
    if (channelId != null) {
      channels.set(
        channelId,
        currentChannelNames.get(channelId) || row.metadata?.channelName || channelId,
      );
    }
  }
  const sorted = Array.from(versions).sort();
  manageCasesVersionOptions.value = [
    { value: null, label: '全部版本' },
    ...sorted.map((code) => ({ value: code, label: code })),
  ];
  manageCasesChannelOptions.value = [
    { value: null, label: '全部渠道' },
    ...Array.from(channels, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  ];
  if (manageCasesChannelFilter.value != null && !channels.has(manageCasesChannelFilter.value)) {
    manageCasesChannelFilter.value = null;
  }

  const current = manageCasesVersionFilter.value;
  if (current != null && !versions.has(current)) {
    manageCasesVersionFilter.value = sorted.length
      ? sorted[sorted.length - 1] ?? null
      : null;
  } else if (current == null && sorted.length > 0) {
    manageCasesVersionFilter.value = sorted[sorted.length - 1] ?? null;
  }
}

function onManageCasesVersionChange() {
  manageCasesPage.value = 1;
  void loadManageCasesList();
}

function onManageCasesChannelChange() {
  manageCasesPage.value = 1;
  void loadManageCasesList();
}

async function loadManageCasesList() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) return;
  manageCasesLoading.value = true;
  try {
    const result = await listApiCases(projectId, transactionId, {
      page: manageCasesPage.value,
      pageSize: manageCasesPageSize.value,
      versionCode: manageCasesVersionFilter.value ?? undefined,
      channelId: manageCasesChannelFilter.value ?? undefined,
    });
    if (
      result.count === 0 &&
      manageCasesVersionFilter.value != null &&
      manageCasesChannelFilter.value == null &&
      manageCasesVersionOptions.value.some(
        (item) =>
          item.value != null && item.value !== manageCasesVersionFilter.value,
      )
    ) {
      await loadManageCasesVersions();
      if (manageCasesVersionFilter.value != null) {
        await loadManageCasesList();
        return;
      }
    }
    const maxPage = Math.max(1, Math.ceil(result.count / result.pageSize) || 1);
    if (result.count > 0 && result.page > maxPage) {
      manageCasesPage.value = maxPage;
      await loadManageCasesList();
      return;
    }
    manageCasesList.value = result.rows;
    manageCasesTotal.value = result.count;
    manageCasesPage.value = result.page;
    manageCasesPageSize.value = normalizeCaseForgePageSize(result.pageSize);
  } finally {
    manageCasesLoading.value = false;
  }
}

function onManageCasesPageChange(page: number, pageSize: number) {
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== manageCasesPageSize.value;
  manageCasesPageSize.value = size;
  manageCasesPage.value = sizeChanged ? 1 : page;
  void loadManageCasesList();
}

function onToggleManageCase(caseId: string, checked: boolean) {
  if (checked) {
    if (!selectedCaseIds.value.includes(caseId)) {
      selectedCaseIds.value = [...selectedCaseIds.value, caseId];
    }
    return;
  }
  selectedCaseIds.value = selectedCaseIds.value.filter((id) => id !== caseId);
}

function toggleSelectAllManageCases(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  const pageIds = manageCasesList.value.map((item) => item.id);
  if (checked) {
    selectedCaseIds.value = [...new Set([...selectedCaseIds.value, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(pageIds);
  selectedCaseIds.value = selectedCaseIds.value.filter((id) => !pageIdSet.has(id));
}

async function onSaveCases() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId || activeSet.value?.id;
  if (!projectId || !transactionId || !setId) {
    message.warning('缺少项目、交易码或执行集信息，请重新选择执行集');
    return;
  }
  manageCasesSaving.value = true;
  try {
    const allCases = await listAllApiCases(projectId, transactionId);
    const validIdSet = new Set(allCases.map((item) => item.id));
    const caseIds = selectedCaseIds.value.filter((id) => validIdSet.has(id));
    const dropped = selectedCaseIds.value.length - caseIds.length;
    if (!caseIds.length) {
      message.warning('请至少选择一条有效案例');
      return;
    }
    if (dropped > 0) {
      message.warning(`已自动移除 ${dropped} 条无效或已删除的案例`);
    }
    await apiStore.replaceExecutionSetCases(
      projectId,
      transactionId,
      setId,
      caseIds,
    );
    detailTab.value = 'cases';
    manageCasesOpen.value = false;
    await apiStore.refreshRunnerCases(projectId, transactionId);
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '保存执行集案例失败');
  } finally {
    manageCasesSaving.value = false;
  }
}

function openRunModal() {
  runModalOpen.value = true;
}

async function onConfirmRun() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) {
    return Promise.reject();
  }
  if (apiStore.running) {
    message.warning('当前已有执行任务进行中');
    return Promise.reject();
  }

  runModalOpen.value = false;
  detailTab.value = 'result';
  message.info('已开始后台执行，完成后将自动刷新结果');

  void apiStore
    .runExecutionSet(projectId, transactionId, setId, {})
    .catch((error) => {
      const responseMessage = (error as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      message.error(responseMessage || (error as Error)?.message || '执行失败');
    });
}

function removeLinkedCase(caseId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId || !activeSet.value) return;
  const nextCaseIds = (activeSet.value.caseIds ?? []).filter((id) => id !== caseId);
  Modal.confirm({
    title: '移除该案例？',
    content: '仅从当前执行集中移除，不会删除案例本身。',
    centered: true,
    okText: '移除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () =>
      apiStore.replaceExecutionSetCases(
        projectId,
        transactionId,
        setId,
        nextCaseIds,
      ),
  });
}

function onDeleteSet() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId || !setId) return;
  Modal.confirm({
    title: '删除执行集？',
    content: '删除后不影响案例本身，其它执行集仍可引用相同案例。',
    centered: true,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: () => apiStore.removeExecutionSet(projectId, transactionId, setId),
  });
}

function onBatchDeleteSets() {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId || !selectedSetIds.value.length) return;
  const count = selectedSetIds.value.length;
  Modal.confirm({
    title: `删除选中的 ${count} 个执行集？`,
    content: '删除后不影响案例本身，其它执行集仍可引用相同案例。',
    centered: true,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: async () => {
      await apiStore.removeExecutionSets(
        projectId,
        transactionId,
        [...selectedSetIds.value],
      );
      selectedSetIds.value = [];
      batchDeleteMode.value = false;
    },
  });
}

function onRerunHistory(runId: string) {
  void onRerunHistoryAsync(runId);
}

async function onRerunHistoryAsync(runId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  const setId = apiStore.activeExecutionSetId;
  if (!projectId || !transactionId) {
    message.warning('缺少项目或交易码信息');
    return;
  }
  if (apiStore.running) {
    message.warning('当前已有执行任务进行中');
    return;
  }
  if (!apiStore.environments.length) {
    message.warning('请先创建执行环境');
    envModalOpen.value = true;
    return;
  }

  rerunningRunId.value = runId;
  detailTab.value = 'result';
  message.info('已开始重新执行，完成后将自动刷新结果');

  try {
    const run = await apiStore.rerunHistoricalRun(projectId, transactionId, runId, {
      executionSetId: setId || undefined,
    });
    if (run) {
      expandedRunId.value = run.id;
      expandedKeys.value = [];
    }
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    message.error(responseMessage || (error as Error)?.message || '重新执行失败');
  } finally {
    rerunningRunId.value = null;
  }
}

function onDeleteHistory(runId: string) {
  const projectId = apiStore.activeProjectId;
  const transactionId = apiStore.activeTransactionId;
  if (!projectId || !transactionId) {
    message.warning('缺少项目或交易码信息');
    return;
  }
  if (apiStore.running) {
    message.warning('执行进行中，请稍后再删除');
    return;
  }
  Modal.confirm({
    title: '删除执行历史？',
    content: '删除后不可恢复，该批次的案例明细将一并移除。',
    centered: true,
    okText: '删除',
    cancelText: '取消',
    okType: 'danger',
    onOk: async () => {
      deletingRunId.value = runId;
      try {
        await apiStore.deleteRun(projectId, transactionId, runId);
        if (expandedRunId.value === runId) {
          expandedRunId.value = null;
          expandedKeys.value = [];
        }
      } catch (error) {
        const responseMessage = (error as { response?: { data?: { message?: string } } })
          ?.response?.data?.message;
        message.error(responseMessage || (error as Error)?.message || '删除执行历史失败');
      } finally {
        deletingRunId.value = null;
      }
    },
  });
}

async function toggleRunDetail(runId: string) {
  detailTab.value = 'result';
  if (expandedRunId.value === runId) {
    expandedRunId.value = null;
    expandedKeys.value = [];
    return;
  }
  expandedRunId.value = runId;
  expandedKeys.value = [];
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  if (apiStore.activeRun?.id === runId && apiStore.activeRun.items?.length) {
    return;
  }
  runDetailLoading.value = true;
  try {
    await loadRun(runId);
  } finally {
    runDetailLoading.value = false;
  }
}

watch(
  () => apiStore.activeExecutionSetId,
  () => {
    expandedRunId.value = null;
    expandedKeys.value = [];
    void ensureLinkedCasesLoaded();
  },
  { immediate: true },
);

async function loadRun(runId: string) {
  const projectId = apiStore.activeProjectId;
  if (!projectId) return;
  await apiStore.loadRun(projectId, runId);
}

function onExpand(expanded: boolean, record: { id: string }) {
  expandedKeys.value = expanded ? [record.id] : [];
}
</script>

<style scoped>
.api-runner-panel {
  min-height: 0;
}

.exec-set-hidden-alert {
  margin-bottom: 12px;
}

.manage-case-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.manage-case-title-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manage-case-version-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1.4;
}

.exec-set-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--cf-border, #eaecf0);
}

.exec-run-progress-alert {
  margin-bottom: 12px;
}

.exec-set-detail-intro h3 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cf-text, #1d2939);
}

.exec-set-detail-intro p {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--cf-text-secondary, #667085);
  font-size: 13px;
}

.exec-set-case-count {
  color: var(--cf-text-body, #344054);
}

.exec-set-detail-divider {
  margin: 0 4px;
  color: var(--cf-text-muted, #98a2b3);
}

/* ===== 状态徽标 ===== */
.exec-set-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}
.exec-set-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.exec-set-status-badge.status-idle {
  background: #f4f4f5;
  color: #71717a;
}
.exec-set-status-badge.status-idle .exec-set-status-dot { background: #a1a1aa; }
.exec-set-status-badge.status-running {
  background: #eff6ff;
  color: #2563eb;
}
.exec-set-status-badge.status-running .exec-set-status-dot {
  background: #3b82f6;
  animation: pulse 1.4s ease-in-out infinite;
}
.exec-set-status-badge.status-passed {
  background: #f0fdf4;
  color: #16a34a;
}
.exec-set-status-badge.status-passed .exec-set-status-dot { background: #22c55e; }
.exec-set-status-badge.status-failed {
  background: #fef2f2;
  color: #dc2626;
}
.exec-set-status-badge.status-failed .exec-set-status-dot { background: #ef4444; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ===== 关联案例表格 ===== */
.exec-linked-table :deep(.ant-table-thead > tr > th) {
  background: #f7f8fa;
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text-body, #344054);
}
.exec-linked-table :deep(.ant-table-tbody > tr > td) {
  font-size: 13px;
}
.exec-linked-table :deep(.exec-linked-profile-cell),
.exec-linked-table :deep(.exec-linked-caseno-cell) {
  overflow: visible;
  white-space: nowrap;
}
.exec-linked-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fafbfc;
}
.linked-case-title {
  font-weight: 500;
  color: var(--cf-text, #1d2939);
}
.linked-case-no {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  color: var(--cf-text-secondary, #667085);
  letter-spacing: 0.02em;
}
.linked-case-profile-badge {
  vertical-align: middle;
}

/* ===== 空状态 ===== */
.exec-set-empty-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 280px;
}
.exec-set-empty-icon {
  font-size: 44px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.3;
}
.exec-set-empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-muted, #98a2b3);
}

.exec-set-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.exec-set-card.batch-card .test-point-card-head {
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.exec-set-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #eaecf0;
  font-size: 12px;
}

.exec-set-list-selection {
  color: #667085;
}

.batch-set-summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.batch-set-summary-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px 96px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.batch-set-summary-list li:last-child {
  border-bottom: none;
}

.batch-set-summary-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-set-summary-meta,
.batch-set-summary-status {
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.batch-set-summary-status {
  text-align: right;
}

.batch-set-summary-more {
  color: #667085;
  font-size: 12px;
}

.instruction-editor-footer.dynamic-editor-footer {
  justify-content: flex-end;
}

.exec-run-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.exec-run-history-panel {
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: linear-gradient(180deg, #fff 0%, #fafbfc 100%);
}

.exec-run-history-panel--fallback {
  width: 100%;
  max-width: 640px;
}

.exec-run-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.exec-run-history-title {
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

.exec-run-history-count {
  color: #98a2b3;
  font-size: 12px;
}

.exec-run-history-track {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exec-run-history-entry {
  border-radius: 10px;
}

.exec-run-history-entry.expanded .exec-run-history-item {
  border-bottom: none;
  border-radius: 10px 10px 0 0;
}

.exec-run-history-entry.expanded .exec-run-history-item.active {
  box-shadow: none;
}

.exec-run-history-detail {
  padding: 12px 14px 14px;
  border: 1px solid #e4b4bc;
  border-top: 1px solid #f2f4f7;
  border-radius: 0 0 10px 10px;
  background: #fff;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-pass .exec-run-history-detail {
  border-color: #abefc6;
  border-top-color: #ecfdf3;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-fail .exec-run-history-detail {
  border-color: #fecdca;
  border-top-color: #fef3f2;
}

.exec-run-history-entry.expanded.exec-run-history-entry--is-partial .exec-run-history-detail {
  border-color: #fedf89;
  border-top-color: #fffaeb;
}

.exec-run-history-entry .exec-run-results-header {
  margin-bottom: 10px;
}

.exec-run-history-item-trailing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.exec-run-history-item-chevron {
  color: #98a2b3;
  font-size: 11px;
  transition: transform 0.2s ease;
}

.exec-run-history-entry.expanded .exec-run-history-item-chevron {
  transform: rotate(180deg);
  color: #667085;
}

.exec-run-history-item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  cursor: pointer;
}

.exec-run-history-rerun {
  flex-shrink: 0;
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.exec-run-history-rerun:hover:not(:disabled) {
  color: #b42318;
  background: #fef3f2;
}

.exec-run-history-delete {
  flex-shrink: 0;
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  color: #667085;
}

.exec-run-history-delete:hover:not(:disabled) {
  color: #b42318;
  background: #fef3f2;
}

.exec-run-history-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #eef2f6;
  border-left: 3px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.exec-run-history-item:hover {
  border-color: #d0d5dd;
  background: #fcfcfd;
}

.exec-run-history-item.active {
  border-color: #e4b4bc;
  border-left-color: #8c1f3d;
  background: #fffafb;
  box-shadow: 0 1px 4px rgba(140, 31, 61, 0.06);
}

.exec-run-history-item--is-pass {
  border-left-color: #16a34a;
}

.exec-run-history-item--is-fail {
  border-left-color: #dc2626;
}

.exec-run-history-item--is-partial {
  border-left-color: #d97706;
}

.exec-run-history-item.active.exec-run-history-item--is-pass {
  border-color: #abefc6;
  background: #f6fef9;
}

.exec-run-history-item.active.exec-run-history-item--is-fail {
  border-color: #fecdca;
  background: #fffafb;
}

.exec-run-history-item.active.exec-run-history-item--is-partial {
  border-color: #fedf89;
  background: #fffaeb;
}

.exec-run-history-item-time {
  flex-shrink: 0;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  white-space: nowrap;
}

.exec-run-history-item-outcome {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #667085;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.exec-run-history-item--is-pass .exec-run-history-item-outcome {
  background: #ecfdf3;
  color: #027a48;
}

.exec-run-history-item--is-fail .exec-run-history-item-outcome {
  background: #fef3f2;
  color: #b42318;
}

.exec-run-history-item--is-partial .exec-run-history-item-outcome {
  background: #fffaeb;
  color: #b54708;
}

.exec-run-history-item-stats {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 4px 10px;
  flex-wrap: wrap;
}

.exec-run-history-stat {
  color: #667085;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.exec-run-history-stat strong {
  margin-left: 2px;
  color: #344054;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.exec-run-history-stat--pass strong {
  color: #16a34a;
}

.exec-run-history-stat--fail strong {
  color: #dc2626;
}

.exec-run-history-stat--rate strong {
  color: #8c1f3d;
}

.exec-run-history-item-bar {
  display: block;
  height: 3px;
  border-radius: 999px;
  background: #f2f4f7;
  overflow: hidden;
}

.exec-run-history-item-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #16a34a;
  transition: width 0.2s ease;
}

.exec-run-history-item--is-fail .exec-run-history-item-bar i {
  background: #dc2626;
}

.exec-run-history-item--is-partial .exec-run-history-item-bar i {
  background: #d97706;
}

.exec-run-results {
  min-height: 0;
}

.exec-run-results-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.exec-run-results-title {
  margin: 0;
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
}

.exec-run-results-hint {
  color: #98a2b3;
  font-size: 12px;
  white-space: nowrap;
}

.exec-run-results-table :deep(.ant-table) {
  border: 1px solid #eaecf0;
  border-radius: 12px;
  overflow: visible;
}

.exec-run-results-table :deep(.ant-table-container),
.exec-run-results-table :deep(.ant-table-content),
.exec-run-results-table :deep(.ant-table-body) {
  overflow: visible !important;
}

.exec-run-results-table :deep(tr.ant-table-expanded-row > td.ant-table-cell) {
  padding: 12px 16px !important;
  overflow: visible;
  background: #fafbfc;
  border-bottom: 1px solid #eaecf0;
}

.exec-run-results-table :deep(.ant-table-expanded-row-fixed) {
  overflow: visible;
  margin: 0 !important;
  padding: 0 !important;
}

.exec-run-results-table :deep(.ant-table-thead > tr > th) {
  background: #f9fafb !important;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.exec-run-results-table :deep(.ant-table-tbody > tr > td) {
  font-size: 13px;
}

.exec-run-results-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fcfcfd !important;
}

.exec-run-results-table :deep(.exec-run-case-cell) {
  cursor: pointer;
}

.exec-run-case-title {
  color: #344054;
  font-weight: 500;
}

.exec-run-duration {
  color: #667085;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.exec-run-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.exec-run-status-pill--sm {
  padding: 1px 8px;
  font-size: 11px;
}

.exec-run-status-pill--passed {
  background: #ecfdf3;
  color: #027a48;
}

.exec-run-status-pill--failed,
.exec-run-status-pill--error {
  background: #fef3f2;
  color: #b42318;
}

.exec-run-status-pill--running {
  background: #eff6ff;
  color: #175cd3;
}

.exec-run-expand {
  padding: 4px 0 8px;
  overflow: visible;
}

.exec-run-expand-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 8px;
}

.exec-run-expand-tabs :deep(.ant-tabs-content-holder),
.exec-run-expand-tabs :deep(.ant-tabs-content),
.exec-run-expand-tabs :deep(.ant-tabs-tabpane) {
  overflow: visible;
}

.exec-run-snapshot-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exec-run-snapshot-section {
  min-width: 0;
}

.exec-run-snapshot-label {
  margin-bottom: 6px;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
}

.exec-run-snapshot {
  margin: 0;
  max-height: none;
  padding: 12px 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-snapshot--meta {
  max-height: none;
  overflow: visible;
}

.exec-run-snapshot--body {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: none;
  overflow-x: auto;
  overflow-y: visible;
  background: #fff;
  border-color: #e4e7ec;
  white-space: pre;
  word-break: normal;
}

.exec-run-assert-value {
  max-width: 360px;
  max-height: none;
  margin: 0;
  color: #344054;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.exec-run-assert-table :deep(.ant-table-tbody > tr > td) {
  vertical-align: top;
}

.exec-run-assert-table :deep(.ant-table) {
  border: 1px solid #eef2f6;
  border-radius: 8px;
  overflow: hidden;
}

.exec-run-empty {
  flex-direction: column;
  gap: 20px;
  padding: 24px 16px 32px;
}

.exec-set-empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

.exec-set-list-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 6px 8px 8px;
  border-top: 1px solid #eaecf0;
}

.exec-set-list-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.exec-set-list-pagination :deep(.ant-pagination-item),
.exec-set-list-pagination :deep(.ant-pagination-prev),
.exec-set-list-pagination :deep(.ant-pagination-next),
.exec-set-list-pagination :deep(.ant-pagination-jump-prev),
.exec-set-list-pagination :deep(.ant-pagination-jump-next) {
  min-width: 24px;
  height: 24px;
  line-height: 22px;
}

.exec-set-list-pagination :deep(.ant-pagination-item a) {
  padding: 0 4px;
}

.exec-set-list-pagination :deep(.ant-pagination-options) {
  margin-inline-start: 4px;
}

.exec-set-list-pagination :deep(.ant-pagination-options-size-changer.ant-select) {
  font-size: 12px;
}

.exec-set-list-pagination :deep(.ant-select-single .ant-select-selector) {
  height: 24px !important;
  padding: 0 8px !important;
}

.exec-set-list-pagination :deep(.ant-select-single .ant-select-selection-item) {
  line-height: 22px !important;
}

@media (max-width: 1100px) {
  .exec-set-detail-header {
    flex-direction: column;
  }

  .exec-set-actions {
    justify-content: flex-start;
  }

  .exec-run-history-item-main {
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .exec-run-history-item-outcome {
    order: 0;
  }

  .exec-run-history-item-trailing {
    order: 1;
  }

  .exec-run-history-item-stats {
    order: 2;
    flex-basis: 100%;
  }

  .exec-run-results-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

.run-detail-table {
  margin-top: 12px;
}
.manage-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f0f5ff;
  color: #1d2939;
  font-size: 12px;
  line-height: 1.5;
}
.manage-hint :deep(.anticon) {
  color: #3b82f6;
  font-size: 14px;
  flex-shrink: 0;
}

.manage-cases-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 4px;
  font-size: 12px;
}

.manage-cases-toolbar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.manage-cases-version-filter {
  width: 112px;
}

.manage-cases-channel-filter {
  width: 112px;
}

.manage-cases-selection {
  color: var(--cf-text-secondary, #667085);
  font-size: 12px;
}
.manage-cases-selection strong {
  color: var(--cf-brand, #b60f2d);
  font-weight: 600;
}

.manage-case-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 380px;
  overflow: auto;
  padding: 2px;
}

.manage-case-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--cf-border, #eaecf0);
  border-radius: 8px;
  background: var(--cf-surface, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
}

.manage-case-row:hover {
  border-color: var(--cf-border-input, #d0d5dd);
  background: #fafbfc;
  box-shadow: 0 1px 3px rgb(16 24 40 / 6%);
}

.manage-case-row--selected {
  border-color: var(--cf-brand-border, #e7b8c0);
  background: var(--cf-brand-soft, #fff5f6);
}

.manage-case-main {
  min-width: 0;
}

.manage-case-main strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--cf-text, #1d2939);
}

.manage-case-main small {
  display: block;
  margin-top: 2px;
  color: var(--cf-text-muted, #98a2b3);
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  letter-spacing: 0.02em;
}

/* ===== 执行协议徽标 ===== */
.case-profile-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  letter-spacing: 0.03em;
  white-space: nowrap;
  line-height: 1.4;
}
.case-profile-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.case-profile-badge.profile-blue {
  background: #eff6ff;
  color: #2563eb;
}
.case-profile-badge.profile-blue::before { background: #3b82f6; }
.case-profile-badge.profile-orange {
  background: #fff7ed;
  color: #c2410c;
}
.case-profile-badge.profile-orange::before { background: #f97316; }
.case-profile-badge.profile-purple {
  background: #faf5ff;
  color: #7c3aed;
}
.case-profile-badge.profile-purple::before { background: #a855f7; }
.case-profile-badge.profile-green {
  background: #f0fdf4;
  color: #16a34a;
}
.case-profile-badge.profile-green::before { background: #22c55e; }
.case-profile-badge.profile-default {
  background: #f4f4f5;
  color: #52525b;
}
.case-profile-badge.profile-default::before { background: #a1a1aa; }

.polarity-pill--sm {
  min-width: 28px;
  padding: 2px 8px;
  font-size: 12px;
}

.polarity-pill.positive {
  border: 1px solid #abefc6;
  background: #ecfdf3;
  color: #067647;
}

.polarity-pill.negative {
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
}

.polarity-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-weight: 600;
}

.manage-case-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
}
.manage-case-empty-icon {
  font-size: 40px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.35;
}
.manage-case-empty p {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-muted, #98a2b3);
}

.manage-cases-pagination {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--cf-border, #eaecf0);
}

.manage-cases-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.run-modal-form {
  margin-top: 4px;
}

.run-form-hint {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  margin: 48px 0;
}
</style>
