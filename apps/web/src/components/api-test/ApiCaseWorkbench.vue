<template>
  <section class="panel constraint-panel dynamic-instruction-panel api-case-panel">
    <div class="panel-header dynamic-panel-header">
      <div class="dynamic-panel-intro">
        <div>
          <h2>接口测试案例</h2>
          <p>编辑与维护 AI 生成的测试案例</p>
        </div>
      </div>
      <div class="toolbar dynamic-panel-toolbar action-toolbar">
        <a-button @click="onCreate">
          <template #icon><PlusOutlined /></template>
          新建案例
        </a-button>
        <a-button :type="batchMode ? 'primary' : 'default'" @click="toggleBatchMode">
          {{ batchMode ? '退出批量' : '批量删除' }}
        </a-button>
        <a-dropdown v-model:open="moreMenuOpen" trigger="click">
          <a-button>
            更多
            <DownOutlined
              :class="['dropdown-trigger-chevron', { 'is-open': moreMenuOpen }]"
            />
          </a-button>
          <template #overlay>
            <a-menu @click="onCaseMoreMenuClick">
              <a-menu-item key="environment">
                <SettingOutlined />
                维护环境
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <div v-if="showCaseWorkspace" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel case-list-panel">
        <div class="test-point-list-head">
          <strong>案例列表</strong>
          <div class="case-list-head-controls">
            <a-select
              v-if="versionOptions.length > 1"
              v-model:value="apiStore.caseListVersionFilter"
              :options="versionOptions"
              size="small"
              class="case-version-filter"
              @change="onVersionFilterChange"
            />
            <span>{{ apiStore.caseListTotal }} 条</span>
          </div>
        </div>
        <div v-if="batchMode && apiStore.cases.length" class="list-toolbar batch-list-toolbar case-list-toolbar">
          <a-checkbox
            :checked="allSelected"
            :indeterminate="selectionIndeterminate"
            @change="toggleSelectAll"
          >
            全选当前页
          </a-checkbox>
          <span class="case-list-selection">已选 {{ selectedIds.length }} / {{ apiStore.caseListTotal }}</span>
        </div>
        <div v-if="!apiStore.cases.length" class="case-list-empty">
          <InboxOutlined class="case-list-empty-icon" />
          <p>{{ caseListEmptyHint }}</p>
        </div>
        <div v-else class="test-point-list-scroll">
          <article
            v-for="item in apiStore.cases"
            :key="item.id"
            class="test-point-card case-card"
            :class="{
              active: isActiveCard(item.id),
              'browse-card': !batchMode,
              'batch-card': batchMode,
            }"
            @click="handleCardClick(item.id)"
          >
            <div class="test-point-card-head">
              <a-checkbox
                v-if="batchMode"
                :checked="selectedIds.includes(item.id)"
                @click.stop
                @change="(e: Event) => onToggleSelect(item.id, readCheckboxChecked(e))"
              />
              <div class="test-point-card-title case-card-title">
                <strong :title="item.title">{{ item.title || '未命名案例' }}</strong>
                <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
                <div class="case-badges-row">
                  <span
                    class="case-profile-badge case-transport-badge"
                    :class="`profile-${caseProfileColor(resolveListItemRequest(item))}`"
                  >
                    {{ caseProfileLabel(resolveListItemRequest(item)) }}
                  </span>
                  <a-tag
                    v-if="item.metadata?.generateVersion != null"
                    class="case-version-tag"
                  >
                    v{{ item.metadata.generateVersion }}
                  </a-tag>
                </div>
              </div>
              <span class="polarity-pill" :class="item.polarity">
                {{ item.polarity === 'negative' ? '反' : '正' }}
              </span>
            </div>
          </article>
        </div>
        <div v-if="showCasePagination" class="case-list-pagination">
          <a-pagination
            size="small"
            :current="apiStore.caseListPage"
            :page-size="apiStore.caseListPageSize"
            :total="apiStore.caseListTotal"
            :show-size-changer="true"
            :page-size-options="pageSizeOptions"
            @change="onCasePageChange"
            @showSizeChange="onCasePageChange"
          />
        </div>
      </div>

      <div class="instruction-editor instruction-editor-panel">
        <div v-if="batchMode && selectedIds.length" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="editor-hero editor-hero-batch">
              <div>
                <h3>已选 {{ selectedIds.length }} 条案例</h3>
                <p>确认后可批量删除所选案例</p>
              </div>
              <a-tag color="processing">批量删除</a-tag>
            </div>

            <div class="editor-block">
              <div class="editor-block-title">已选案例</div>
              <ul class="batch-case-summary-list">
                <li v-for="row in selectedRows" :key="row.id" class="batch-case-summary-item">
                  <strong class="batch-case-summary-title" :title="row.title">
                    {{ row.title || '未命名案例' }}
                  </strong>
                  <span
                    class="case-profile-badge batch-case-summary-tag"
                    :class="`profile-${caseProfileColor(row.request)}`"
                  >
                    {{ caseProfileLabel(row.request) }}
                  </span>
                  <span class="batch-case-summary-no">
                    {{ row.caseNo || row.transactionCode || '待分配编号' }}
                  </span>
                </li>
                <li
                  v-if="selectedIds.length > selectedRows.length"
                  class="batch-case-summary-more"
                >
                  另有 {{ selectedIds.length - selectedRows.length }} 条在其他分页
                </li>
              </ul>
            </div>
          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar">
            <a-button danger :disabled="!selectedIds.length" @click="onBatchDelete">
              <template #icon><DeleteOutlined /></template>
              批量删除
            </a-button>
          </div>
        </div>

        <div v-else-if="showEditor" class="instruction-editor-shell">
          <div class="instruction-editor-body">
            <div class="editor-hero">
              <div class="editor-hero-main">
                <div class="editor-hero-title-row">
                  <h3>{{ isNewCase ? '新建案例' : form.title || '未命名案例' }}</h3>
                  <template v-if="!isNewCase">
                    <span class="hero-case-no">{{ form.caseNo || form.transactionCode || '待分配编号' }}</span>
                    <a-tag
                      v-if="form.metadata?.generateVersion != null"
                      color="blue"
                      class="hero-version-tag"
                    >
                      v{{ form.metadata.generateVersion }}
                    </a-tag>
                  </template>
                </div>
              </div>
              <span class="polarity-pill polarity-pill--lg" :class="form.polarity">
                {{ form.polarity === 'negative' ? '反向案例' : '正向案例' }}
              </span>
            </div>

            <div class="editor-block case-payload-block">
              <div class="editor-block-title-row case-editor-main-tabs-row">
                <div class="case-editor-main-tabs">
                  <button
                    v-for="tab in editorMainTabs"
                    :key="tab.key"
                    type="button"
                    class="case-editor-main-tab"
                    :class="{ active: editorMainTab === tab.key }"
                    @click="editorMainTab = tab.key"
                  >
                    {{ tab.label }}
                  </button>
                </div>
              </div>

              <div v-show="editorMainTab === 'basic'" class="case-editor-panel case-basic-panel">
                <div class="case-basic-shell">
                  <div class="case-basic-form">
                    <div class="case-basic-field case-basic-field--full">
                      <label class="case-basic-label case-basic-label--required">案例名称</label>
                      <a-input v-model:value="form.title" size="small" placeholder="案例名称" />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label case-basic-label--required">案例类型</label>
                      <a-select v-model:value="form.polarity" size="small" :options="polarityOptions" />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label">状态</label>
                      <a-select v-model:value="form.status" size="small" :options="statusOptions" />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label">案例编号</label>
                      <a-input v-model:value="form.caseNo" size="small" placeholder="如 PCBS03901001-001" />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label">交易码</label>
                      <a-input v-model:value="form.transactionCode" size="small" disabled />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label">负责人</label>
                      <a-input v-model:value="form.owner" size="small" placeholder="负责人" />
                    </div>
                    <div class="case-basic-field">
                      <label class="case-basic-label">创建人</label>
                      <a-input v-model:value="form.createdBy" size="small" disabled />
                    </div>
                  </div>
                  <div class="case-basic-meta">
                    <div class="case-basic-meta-item">
                      <label class="case-basic-label">案例描述</label>
                      <a-textarea
                        v-model:value="form.description"
                        class="case-basic-textarea"
                        :rows="3"
                        placeholder="案例描述"
                      />
                    </div>
                    <div class="case-basic-meta-item">
                      <label class="case-basic-label">备注</label>
                      <a-textarea
                        v-model:value="form.remark"
                        class="case-basic-textarea"
                        :rows="3"
                        placeholder="备注"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div v-show="editorMainTab === 'request'" class="case-editor-panel case-request-panel">
                <div class="case-request-shell">
                <div class="case-protocol-bar">
                  <div class="case-protocol-field">
                    <span class="case-protocol-label">通讯协议</span>
                    <a-select
                      v-model:value="form.protocol"
                      :options="protocolOptions"
                      size="small"
                      class="case-protocol-select"
                    />
                  </div>
                  <template v-if="form.protocol === 'http'">
                    <div class="case-protocol-field">
                      <span class="case-protocol-label">请求方法</span>
                      <a-select
                        v-model:value="form.httpMethod"
                        :options="httpMethodOptions"
                        size="small"
                        class="case-protocol-select"
                      />
                    </div>
                    <div class="case-protocol-field case-protocol-field--grow">
                      <span class="case-protocol-label">路径</span>
                      <a-input
                        v-model:value="form.httpPath"
                        size="small"
                        placeholder="相对路径，按环境与服务拼接 URL"
                      />
                    </div>
                  </template>
                  <div v-if="form.protocol === 'socket'" class="case-protocol-field">
                    <span class="case-protocol-label">编码</span>
                    <a-select
                      v-model:value="form.socketEncoding"
                      :options="encodingOptions"
                      size="small"
                      class="case-protocol-select"
                    />
                  </div>
                </div>
                <div class="case-request-toolbar">
                  <div class="case-request-tabs">
                    <button
                      v-for="tab in requestTabs"
                      :key="tab.key"
                      type="button"
                      class="case-request-tab"
                      :class="{ active: requestTab === tab.key }"
                      @click="requestTab = tab.key"
                    >
                      {{ tab.label }}
                      <span v-if="tab.count" class="case-request-tab-badge">{{ tab.count }}</span>
                    </button>
                  </div>
                </div>
                <div class="case-payload-fields case-payload-fields--body">
                  <template v-if="requestTab === 'params'">
                    <KeyValueRowsEditor
                      v-model:rows="form.queryRows"
                      hint="Query 参数将拼接到请求 URL 后"
                    />
                  </template>
                  <template v-else-if="requestTab === 'headers'">
                    <KeyValueRowsEditor
                      v-model:rows="form.headerRows"
                      :hint="headersTabHint"
                    />
                  </template>
                  <template v-else>
                    <div class="case-body-panel">
                      <div
                        v-if="httpMethodHasBody(form.httpMethod) || form.protocol !== 'http'"
                        class="case-body-hint-row"
                      >
                        <span class="case-body-hint">{{ bodyTabHint }}</span>
                      </div>
                      <div class="case-editor-surface">
                        <div
                          v-if="httpMethodHasBody(form.httpMethod) || form.protocol !== 'http'"
                          class="case-editor-chrome"
                        >
                          <div class="case-body-format-bar">
                            <button
                              v-for="item in bodyFormatOptions"
                              :key="item.value"
                              type="button"
                              class="case-body-format-btn"
                              :class="{
                                active: form.bodyFormat === item.value,
                                disabled: form.protocol === 'http' && !httpMethodHasBody(form.httpMethod),
                              }"
                              :disabled="form.protocol === 'http' && !httpMethodHasBody(form.httpMethod)"
                              @click="form.bodyFormat = item.value"
                            >
                              {{ item.label }}
                            </button>
                          </div>
                          <a-button
                            v-if="canBeautifyBody"
                            type="link"
                            size="small"
                            class="case-editor-beautify-btn"
                            @click="beautifyRequestJson"
                          >
                            <template #icon><FormatPainterOutlined /></template>
                            美化
                          </a-button>
                        </div>
                        <div class="case-editor-content">
                        <template v-if="form.bodyFormat === 'json'">
                          <textarea
                            :key="`${payloadEditorKey}-body-json`"
                            v-model="form.requestBodyJson"
                            class="ant-input editor-textarea case-json-editor case-payload-textarea case-payload-textarea--expand case-payload-textarea--in-surface"
                            placeholder="{}"
                            spellcheck="false"
                            @paste="onPayloadTextareaPaste"
                          />
                        </template>
                        <template v-else-if="form.bodyFormat === 'xml'">
                          <textarea
                            :key="`${payloadEditorKey}-body-xml`"
                            v-model="form.requestBodyXml"
                            class="ant-input editor-textarea case-xml-editor case-payload-textarea case-payload-textarea--expand case-payload-textarea--in-surface"
                            placeholder="XML 报文"
                            spellcheck="false"
                            @paste="onPayloadTextareaPaste"
                          />
                        </template>
                        <template v-else>
                          <textarea
                            :key="`${payloadEditorKey}-body-text`"
                            v-model="form.requestBodyText"
                            class="ant-input editor-textarea case-payload-textarea case-payload-textarea--expand case-payload-textarea--in-surface"
                            placeholder="纯文本报文"
                            spellcheck="false"
                            @paste="onPayloadTextareaPaste"
                          />
                        </template>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
                </div>
              </div>

              <div v-show="editorMainTab === 'assertion'" class="case-editor-panel case-assertion-panel">
                <div class="case-assertion-shell">
                  <div class="case-assertion-toolbar">
                    <div class="case-debug-bar">
                      <a-select
                        v-model:value="apiStore.selectedEnvironmentId"
                        size="small"
                        placeholder="选择环境"
                        :options="debugEnvironmentOptions"
                        class="case-debug-env-select"
                        allow-clear
                      />
                      <a-select
                        v-if="hasDebugServices"
                        v-model:value="debugServiceId"
                        size="small"
                        placeholder="选择服务（可选）"
                        :options="debugServiceOptions"
                        class="case-debug-service-select"
                        allow-clear
                      />
                      <a-select
                        v-model:value="debugEncoding"
                        size="small"
                        placeholder="编码"
                        :options="debugEncodingOptions"
                        class="case-debug-encoding-select"
                      />
                      <a-button
                        type="primary"
                        size="small"
                        :loading="debugRunning"
                        :disabled="!apiStore.selectedEnvironmentId"
                        @click="onDebugRun"
                      >
                        <template #icon><ThunderboltOutlined /></template>
                        调试执行
                      </a-button>
                    </div>
                    <div class="case-assertion-toolbar-actions">
                      <div v-if="debugResult" class="case-debug-response-meta">
                        <span
                          class="case-debug-status"
                          :class="{ 'status-ok': debugResult.statusCode >= 200 && debugResult.statusCode < 300, 'status-err': debugResult.statusCode === 0 || debugResult.statusCode >= 400, 'status-tcp': debugResult.statusCode === -1 }"
                        >
                          {{ debugResult.error ? '请求失败' : debugResult.statusCode === -1 ? 'Socket 响应' : `${debugResult.statusCode}` }}
                        </span>
                        <span class="case-debug-duration">{{ debugResult.durationMs }}ms</span>
                        <span class="case-debug-size">{{ debugResult.bodySize }} bytes</span>
                      </div>
                      <a-button
                        type="primary"
                        size="small"
                        :loading="generatingAssertions"
                        :disabled="!canGenerateAssertions"
                        @click="onGenerateAssertions"
                      >
                        <template #icon><RobotOutlined /></template>
                        AI 生成断言
                      </a-button>
                      <span v-if="!debugResult" class="case-panel-hint">选择环境并调试执行，再使用 AI 生成断言</span>
                    </div>
                  </div>
                  <div class="case-debug-response case-debug-response--full">
                    <div v-if="debugResult?.error" class="case-debug-error">
                      {{ debugResult.error }}
                    </div>
                    <div class="case-debug-tabs">
                      <button
                        type="button"
                        class="case-debug-tab"
                        :class="{ active: debugResponseTab === 'expected' }"
                        @click="debugResponseTab = 'expected'"
                      >
                        断言内容
                      </button>
                      <template v-if="debugResult && !debugResult.error">
                        <button
                          type="button"
                          class="case-debug-tab"
                          :class="{ active: debugResponseTab === 'body' }"
                          @click="debugResponseTab = 'body'"
                        >
                          响应体
                        </button>
                        <button
                          type="button"
                          class="case-debug-tab"
                          :class="{ active: debugResponseTab === 'assert' }"
                          @click="debugResponseTab = 'assert'"
                        >
                          断言比对 ({{ debugResult.assertions.length }})
                        </button>
                        <button
                          type="button"
                          class="case-debug-tab"
                          :class="{ active: debugResponseTab === 'headers' }"
                          @click="debugResponseTab = 'headers'"
                        >
                          响应头 ({{ Object.keys(debugResult.headers).length }})
                        </button>
                      </template>
                    </div>
                    <div class="case-debug-panel">
                      <AssertionRowsEditor
                        v-if="debugResponseTab === 'expected'"
                        :key="`${payloadEditorKey}-expected`"
                        v-model:rows="form.assertionRows"
                        :protocol="form.protocol"
                        class="case-debug-assertion-editor"
                        hint="可手动添加断言，或调试后使用 AI 生成"
                      />
                      <div
                        v-else-if="debugResponseTab === 'body' && debugResult"
                        class="case-debug-body-shell"
                      >
                        <div class="case-debug-body-toolbar">
                          <a-button
                            type="link"
                            size="small"
                            class="case-editor-beautify-btn"
                            :disabled="!hasDebugResponseBody"
                            @click="beautifyDebugResponseBody"
                          >
                            <template #icon><FormatPainterOutlined /></template>
                            美化
                          </a-button>
                        </div>
                        <pre class="case-debug-body-pre">{{ debugResponseBodyText }}</pre>
                      </div>
                      <table
                        v-else-if="debugResponseTab === 'assert' && debugResult"
                        class="case-debug-assert-table"
                      >
                        <thead>
                          <tr>
                            <th>断言</th>
                            <th>断言值</th>
                            <th>实际值</th>
                            <th style="width: 64px">结果</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(assertion, idx) in debugResult.assertions"
                            :key="idx"
                            :class="assertion.passed ? 'assert-pass' : 'assert-fail'"
                          >
                            <td>{{ assertion.name }}</td>
                            <td class="case-debug-assert-value">{{ formatAssertValue(assertion.expected) }}</td>
                            <td class="case-debug-assert-value">{{ formatAssertValue(assertion.actual) }}</td>
                            <td>
                              <span
                                class="case-debug-assert-status"
                                :class="assertion.passed ? 'pass' : 'fail'"
                              >
                                {{ assertion.passed ? '通过' : '失败' }}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <pre
                        v-else-if="debugResponseTab === 'headers' && debugResult"
                        class="case-debug-headers-pre"
                      >{{ JSON.stringify(debugResult.headers, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="instruction-editor-footer dynamic-editor-footer action-toolbar case-editor-footer">
            <div class="case-editor-footer-right">
              <a-button v-if="!isNewCase" danger @click="onDelete">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
              <a-button :loading="saving" type="primary" @click="onSave">
                <template #icon><SaveOutlined /></template>
                保存
              </a-button>
            </div>
          </div>
        </div>

        <div v-else class="instruction-editor-placeholder case-editor-placeholder">
          <InboxOutlined class="case-editor-placeholder-icon" />
          <p class="case-editor-placeholder-text">
            {{ batchMode
              ? '请从左侧勾选要删除的案例'
              : '请从左侧选择一条案例，或点击「新建案例」' }}
          </p>
        </div>
      </div>
    </div>

    <a-empty
      v-else
      class="empty-state"
      description="请先在接口文档中 AI 生成案例"
    />

    <ApiEnvironmentMaintainModal v-model:open="envModalOpen" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, reactive, ref, watch } from 'vue';
import {
  DeleteOutlined,
  DownOutlined,
  FormatPainterOutlined,
  InboxOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import type { MenuProps } from 'ant-design-vue';
import {
  caseForgePageSizeOptionLabels,
  executionProfileBadgeColor,
  normalizeCaseForgePageSize,
  resolveExecutionProfile,
} from '@case-forge/shared';
import type { ApiCaseRequest } from '@case-forge/shared';
import type { ApiTestCaseRow, DebugRunResult } from '@/api/apiTestClient';
import { listAllApiCases, debugRunCase, generateAssertions } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';
import KeyValueRowsEditor from '@/components/api-test/KeyValueRowsEditor.vue';
import AssertionRowsEditor from '@/components/api-test/AssertionRowsEditor.vue';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import {
  assertionsToRows,
  buildExpectedFromRows,
  type AssertionRow,
} from '@/utils/assertionRows.util';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
  formatRunSnapshotForDisplay,
  buildDefaultHeaderRows,
  createEmptyKeyValueRow,
  defaultContentType,
  defaultEditorState,
  httpMethodHasBody,
  HTTP_METHODS,
  mergeRequestFromEditor,
  resolveEditorMode,
  splitRequestForEditor,
  type CaseBodyFormat,
  type CaseProtocol,
  type HttpMethod,
  type KeyValueRow,
  type SocketRequestMeta,
} from '@/utils/casePayloadFormat.util';

const apiStore = useApiTestStore();

/** 清除 resize / 旧版动态高度残留的内联样式，粘贴后回到顶部 */
function onPayloadTextareaPaste(event: Event) {
  const el = event.target;
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.style.height = '';
  el.style.minHeight = '';
  void nextTick(() => {
    el.scrollTop = 0;
  });
}

const batchMode = ref(false);
const envModalOpen = ref(false);
const moreMenuOpen = ref(false);

const onCaseMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
  if (key === 'environment') {
    envModalOpen.value = true;
  }
};

const saving = ref(false);
const isNewCase = ref(false);
const syncingForm = ref(false);
const debugRunningCaseKey = ref<string | null>(null);
const generatingAssertionsCaseKey = ref<string | null>(null);
const debugResult = ref<DebugRunResult | null>(null);
const debugServiceId = ref<string>('');
const debugEncoding = ref('UTF-8');
const debugResponseBodyOverride = ref<string | null>(null);
const loadedCaseId = ref('');
const debugResponseTab = ref<'expected' | 'body' | 'assert' | 'headers'>('expected');

function activeCaseKey() {
  return isNewCase.value ? 'new-case' : (apiStore.activeCaseId || '');
}

function isStillOnCase(caseKey: string) {
  return activeCaseKey() === caseKey;
}

function releaseCaseTask(taskKey: typeof debugRunningCaseKey, caseKey: string) {
  if (taskKey.value === caseKey) {
    taskKey.value = null;
  }
}

const debugRunning = computed(
  () => debugRunningCaseKey.value !== null && debugRunningCaseKey.value === activeCaseKey(),
);

const generatingAssertions = computed(
  () =>
    generatingAssertionsCaseKey.value !== null &&
    generatingAssertionsCaseKey.value === activeCaseKey(),
);

function getDebugResponseIssue(result: DebugRunResult | null): string | null {
  if (!result) {
    return '请先调试执行并获取响应结果';
  }
  if (result.error) {
    return '当前调试请求失败，请重新调试后再生成断言';
  }
  if (result.statusCode === 0) {
    return '未获取到有效响应，请先调试执行';
  }
  return null;
}

const canGenerateAssertions = computed(
  () => getDebugResponseIssue(debugResult.value) === null,
);

watch(
  () => debugResult.value,
  () => {
    debugResponseBodyOverride.value = null;
  },
);

const hasDebugResponseBody = computed(() => {
  const body = debugResult.value?.body;
  if (body === undefined || body === null) return false;
  if (typeof body === 'string') return body.trim().length > 0;
  return true;
});

const debugEnvironmentOptions = computed(() =>
  apiStore.environments
    .filter((env) => env.enabled)
    .map((env) => ({
      label: env.isDefault ? `${env.name}（默认）` : env.name,
      value: env.id,
    })),
);

const debugServiceOptions = computed(() => {
  const envId = apiStore.selectedEnvironmentId;
  if (!envId) return [];
  const services = apiStore.environmentServices[envId] ?? [];
  const expectedTransport = resolveDebugExpectedTransport();
  return services
    .filter((s) => s.enabled)
    .map((s) => {
      const transport = s.transport ?? 'http';
      const mismatch = transport !== expectedTransport;
      return {
        label: mismatch
          ? `${s.name} (${transport.toUpperCase()} · 协议不符)`
          : `${s.name} (${transport.toUpperCase()})`,
        value: s.id,
        disabled: mismatch,
      };
    });
});

const hasDebugServices = computed(() => debugServiceOptions.value.length > 0);

function resolveDebugExpectedTransport(): 'http' | 'tcp' {
  return form.protocol === 'socket' ? 'tcp' : 'http';
}

function syncDebugServiceSelection() {
  const compatible = debugServiceOptions.value.filter((item) => !item.disabled);
  if (
    debugServiceId.value &&
    compatible.some((item) => item.value === debugServiceId.value)
  ) {
    return;
  }
  debugServiceId.value = compatible[0]?.value ?? '';
}
const editorMainTab = ref<'basic' | 'request' | 'assertion'>('request');
const editorMainTabs = [
  { key: 'basic' as const, label: '基础信息' },
  { key: 'request' as const, label: '请求报文' },
  { key: 'assertion' as const, label: '断言' },
];
const requestTab = ref<'params' | 'body' | 'headers'>('body');
const pageSizeOptions = caseForgePageSizeOptionLabels();

const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');
const selectedIds = computed(() => apiStore.selectedCaseIds);
const allVersions = ref<number[]>([]);
const showCaseWorkspace = computed(
  () =>
    apiStore.caseListTotal > 0 ||
    apiStore.cases.length > 0 ||
    allVersions.value.length > 0 ||
    apiStore.caseListVersionFilter != null,
);
const caseListEmptyHint = computed(() =>
  apiStore.caseListVersionFilter != null
    ? `v${apiStore.caseListVersionFilter} 暂无案例，请切换其他版本`
    : '当前暂无案例',
);
const versionOptions = computed(() => {
  const list = [...allVersions.value].sort((a, b) => a - b);
  const options: { value: number | null; label: string }[] = [
    { value: null, label: '全部版本' },
  ];
  for (const v of list) {
    options.push({ value: v, label: `v${v}` });
  }
  return options;
});

let loadVersionsReqId = 0;

async function loadAvailableVersions() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  const reqId = ++loadVersionsReqId;
  const rows = await listAllApiCases(pid, tid).catch(() => [] as ApiTestCaseRow[]);
  if (reqId !== loadVersionsReqId) return;
  if (pid !== projectId.value || tid !== transactionId.value) return;

  const versions = new Set<number>();
  for (const row of rows) {
    const version = row.metadata?.generateVersion;
    if (version != null) {
      versions.add(version);
    }
  }
  allVersions.value = Array.from(versions);

  const filter = apiStore.caseListVersionFilter;
  if (filter != null && !versions.has(filter)) {
    const latest = allVersions.value.length
      ? Math.max(...allVersions.value)
      : null;
    apiStore.caseListVersionFilter = latest;
    await apiStore.refreshCases(pid, tid, {
      resetPage: true,
      generateVersion: latest ?? undefined,
    });
  }
}

onActivated(() => {
  void loadAvailableVersions();
  void ensureDebugEnvironments();
});

async function ensureDebugEnvironments() {
  const pid = projectId.value;
  if (!pid) return;
  await apiStore.refreshEnvironments(pid);
}

function onVersionFilterChange(value: number | null) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  apiStore.caseListVersionFilter = value;
  void (async () => {
    await apiStore.refreshCases(pid, tid, {
      resetPage: true,
      generateVersion: value ?? undefined,
    });
    if (
      value != null &&
      apiStore.caseListTotal === 0 &&
      allVersions.value.length > 0 &&
      !allVersions.value.includes(value)
    ) {
      await loadAvailableVersions();
    }
  })();
}
const caseLookup = computed(() => {
  const map = new Map<string, ApiTestCaseRow>();
  for (const row of [...apiStore.cases, ...apiStore.runnerCases]) {
    map.set(row.id, row);
  }
  return map;
});
const selectedRows = computed(() =>
  selectedIds.value
    .map((id) => caseLookup.value.get(id))
    .filter((row): row is ApiTestCaseRow => Boolean(row)),
);
const activeCase = computed(() =>
  apiStore.cases.find((item) => item.id === apiStore.activeCaseId) ?? null,
);
const payloadEditorKey = computed(
  () => apiStore.activeCaseId || (isNewCase.value ? 'new-case' : 'none'),
);
const showEditor = computed(
  () => !batchMode.value && (Boolean(activeCase.value) || isNewCase.value),
);
const allSelected = computed(
  () =>
    apiStore.cases.length > 0 &&
    apiStore.cases.every((item) => selectedIds.value.includes(item.id)),
);
const selectionIndeterminate = computed(() => {
  const pageIds = apiStore.cases.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.value.includes(id));
  return selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
});
const showCasePagination = computed(() => apiStore.caseListTotal > 0);

function caseProfileLabel(request: ApiCaseRequest) {
  return resolveExecutionProfile(request).label;
}

function caseProfileColor(request: ApiCaseRequest) {
  return executionProfileBadgeColor(resolveExecutionProfile(request).transport);
}

const editingPreviewRequest = computed((): ApiCaseRequest => {
  try {
    return mergeRequestFromEditor({
      mode: requestEditorMode.value,
      protocol: form.protocol,
      bodyFormat: form.bodyFormat,
      httpMethod: form.httpMethod,
      httpPath: form.httpPath,
      headerRows: form.headerRows,
      queryRows: form.queryRows,
      socketEncoding: form.socketEncoding,
      requestBodyText: form.requestBodyText,
      requestBodyJson: form.requestBodyJson,
      requestJson: form.requestJson,
      requestMetaJson: form.requestMetaJson,
      requestTcpMeta: form.requestTcpMeta,
      requestBodyXml: form.requestBodyXml,
    });
  } catch {
    return {
      method: form.protocol === 'http' ? form.httpMethod : '',
      path: form.protocol === 'http' ? form.httpPath : '',
      transport:
        form.protocol === 'socket' ? 'tcp' : form.protocol === 'mq' ? 'mq' : 'http',
    };
  }
});

function resolveListItemRequest(item: ApiTestCaseRow): ApiCaseRequest {
  if (batchMode.value || !showEditor.value || isNewCase.value) {
    return item.request;
  }
  if (item.id === apiStore.activeCaseId) {
    return editingPreviewRequest.value;
  }
  return item.request;
}

const form = reactive({
  endpointId: '',
  title: '',
  caseNo: '',
  description: '',
  remark: '',
  transactionCode: '',
  owner: '',
  createdBy: '',
  metadata: {} as ApiTestCaseRow['metadata'],
  polarity: 'positive' as 'positive' | 'negative',
  status: 'ready',
  enabled: true,
  protocol: 'http' as CaseProtocol,
  bodyFormat: 'json' as CaseBodyFormat,
  httpMethod: 'POST' as HttpMethod,
  httpPath: '',
  headerRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  queryRows: [createEmptyKeyValueRow()] as KeyValueRow[],
  socketEncoding: 'UTF-8',
  requestBodyText: '',
  requestBodyJson: '{}',
  requestJson: '',
  requestMetaJson: '',
  requestTcpMeta: null as SocketRequestMeta | null,
  requestBodyXml: '',
  assertionRows: [] as AssertionRow[],
});

const requestEditorMode = computed(() =>
  resolveEditorMode(form.protocol, form.bodyFormat),
);

const protocolOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'Socket', value: 'socket' },
  { label: 'MQ', value: 'mq' },
];

const httpMethodOptions = HTTP_METHODS.map((method) => ({
  label: method,
  value: method,
}));

const bodyFormatOptions = [
  { label: 'JSON', value: 'json' as CaseBodyFormat },
  { label: 'XML', value: 'xml' as CaseBodyFormat },
  { label: 'Text', value: 'text' as CaseBodyFormat },
];

const encodingOptions = [
  { label: 'UTF-8', value: 'UTF-8' },
  { label: 'GBK', value: 'GBK' },
];

const debugEncodingOptions = encodingOptions;

function inferDebugEncoding() {
  if (form.protocol === 'socket') {
    return form.socketEncoding || 'GBK';
  }
  return 'UTF-8';
}

function countFilledRows(rows: KeyValueRow[]) {
  return rows.filter((row) => row.key.trim()).length;
}

const requestTabs = computed(() => {
  if (form.protocol === 'http') {
    const tabs: Array<{ key: 'params' | 'body' | 'headers'; label: string; count: number }> = [
      { key: 'params', label: 'Params', count: countFilledRows(form.queryRows) },
    ];
    if (httpMethodHasBody(form.httpMethod)) {
      tabs.push({ key: 'body', label: 'Body', count: 1 });
    }
    tabs.push({ key: 'headers', label: 'Headers', count: countFilledRows(form.headerRows) });
    return tabs;
  }
  return [
    { key: 'headers' as const, label: 'Headers', count: countFilledRows(form.headerRows) },
    { key: 'body' as const, label: 'Body', count: 1 },
  ];
});

const canBeautifyBody = computed(
  () =>
    httpMethodHasBody(form.httpMethod) || form.protocol !== 'http',
);

const headersTabHint = computed(() => {
  if (form.protocol === 'http') return '配置请求头，如 Content-Type、Authorization 等';
  if (form.protocol === 'socket') return '配置 Socket 通讯头信息';
  return '配置 MQ 消息头信息';
});

const bodyTabHint = computed(() => {
  if (form.protocol === 'http') {
    return `${form.httpMethod} 请求 Body，格式选择 JSON / XML / Text`;
  }
  if (form.protocol === 'socket') {
    return form.bodyFormat === 'xml'
      ? 'Socket 报文体，GBK 编码时自动附加 8 位长度前缀'
      : `Socket 报文体，格式为 ${form.bodyFormat.toUpperCase()}`;
  }
  return `MQ 消息体，格式为 ${form.bodyFormat.toUpperCase()}`;
});

watch(
  () => [form.protocol, form.bodyFormat] as const,
  ([protocol, bodyFormat], oldValue) => {
    if (syncingForm.value || !oldValue) return;
    const [oldProtocol, oldBodyFormat] = oldValue;
    if (protocol === oldProtocol && protocol === 'http' && bodyFormat !== oldBodyFormat) {
      const rows = [...form.headerRows];
      const ctIndex = rows.findIndex(
        (row) => row.key.trim().toLowerCase() === 'content-type',
      );
      if (ctIndex >= 0) {
        rows[ctIndex] = {
          ...rows[ctIndex],
          value: defaultContentType(bodyFormat),
        };
        form.headerRows = rows;
      }
      return;
    }
    form.headerRows = buildDefaultHeaderRows(protocol, bodyFormat);
    if (protocol === 'socket' && bodyFormat === 'xml') {
      form.socketEncoding = 'GBK';
    } else if (protocol === 'socket') {
      form.socketEncoding = 'UTF-8';
    }
  },
);
const polarityOptions = [
  { label: '正', value: 'positive' },
  { label: '反', value: 'negative' },
];
const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '就绪', value: 'ready' },
  { label: '停用', value: 'disabled' },
];

function findEndpointById(endpointId: string) {
  const fromDoc = apiStore.apiDoc?.endpoints?.find((item) => item.id === endpointId);
  if (fromDoc) return fromDoc;
  const bound = activeCase.value?.endpoint;
  if (bound?.id === endpointId) return bound;
  return null;
}

function applyEndpointBinding(endpointId: string) {
  const endpoint = findEndpointById(endpointId);
  if (!endpoint || form.protocol !== 'http') return;
  const method = (endpoint.method || 'POST').toUpperCase() as HttpMethod;
  if (HTTP_METHODS.includes(method)) {
    form.httpMethod = method;
  }
  form.httpPath = endpoint.path || '';
  if (!httpMethodHasBody(form.httpMethod) && requestTab.value === 'body') {
    requestTab.value = 'params';
  }
}

watch(
  () => form.endpointId,
  (endpointId, oldEndpointId) => {
    if (syncingForm.value || !endpointId || endpointId === oldEndpointId) return;
    applyEndpointBinding(endpointId);
  },
);

watch(
  () => form.protocol,
  () => {
    if (syncingForm.value) return;
    requestTab.value = 'body';
  },
);

watch(
  () => form.httpMethod,
  (method) => {
    if (!httpMethodHasBody(method) && requestTab.value === 'body') {
      requestTab.value = 'params';
    }
  },
);

watch(
  () => apiStore.cases,
  (cases) => {
    if (batchMode.value) return;
    if (isNewCase.value) return;
    if (!cases.length) {
      apiStore.activeCaseId = '';
      return;
    }
    if (!cases.some((item) => item.id === apiStore.activeCaseId)) {
      apiStore.activeCaseId = cases[0]?.id ?? '';
    }
    syncFormFromActiveCase();
  },
  { immediate: true },
);

watch(
  () => apiStore.caseListTotal,
  () => {
    void loadAvailableVersions();
  },
);

watch(
  () => transactionId.value,
  async (tid, oldTid) => {
    if (tid && tid !== oldTid) {
      allVersions.value = [];
      await loadAvailableVersions();
    }
  },
  { immediate: true },
);

watch(
  () => apiStore.activeCaseId,
  () => {
    if (isNewCase.value) return;
    syncFormFromActiveCase();
  },
);

watch(
  () => projectId.value,
  (pid) => {
    if (pid) {
      void ensureDebugEnvironments();
    }
  },
  { immediate: true },
);

watch(
  () => apiStore.selectedEnvironmentId,
  async (envId) => {
    if (!envId || !projectId.value) return;
    await apiStore.refreshEnvironmentServices(projectId.value, envId);
    if (syncingForm.value) return;
    debugServiceId.value = '';
    syncDebugServiceSelection();
  },
);

watch(
  () => form.protocol,
  () => {
    syncDebugServiceSelection();
  },
);

function onCasePageChange(page: number, pageSize: number) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  const size = normalizeCaseForgePageSize(pageSize);
  const sizeChanged = size !== apiStore.caseListPageSize;
  void apiStore.refreshCases(pid, tid, {
    page: sizeChanged ? 1 : page,
    pageSize: size,
  });
}

function applyRequestToForm(request: ApiTestCaseRow['request']) {
  const split = splitRequestForEditor(request);
  form.protocol = split.protocol;
  form.bodyFormat = split.bodyFormat;
  form.httpMethod = split.httpMethod;
  form.httpPath = split.httpPath;
  form.headerRows = split.headerRows;
  form.queryRows = split.queryRows;
  form.socketEncoding = split.socketEncoding;
  form.requestBodyText = split.requestBodyText;
  form.requestBodyJson = split.requestBodyJson;
  form.requestJson = split.requestJson;
  form.requestMetaJson = split.requestMetaJson;
  form.requestTcpMeta = split.requestTcpMeta;
  form.requestBodyXml = split.requestBodyXml;
  requestTab.value =
    split.protocol !== 'http' || httpMethodHasBody(split.httpMethod) ? 'body' : 'params';
}

function restoreLastDebugRun(row: ApiTestCaseRow, sameCase: boolean) {
  if (sameCase && debugResult.value) return;
  const snapshot = row.metadata?.lastDebugRun;
  if (snapshot) {
    debugResult.value = snapshot;
    debugResponseTab.value = snapshot.error ? 'expected' : 'body';
  } else if (!sameCase) {
    debugResult.value = null;
    debugResponseTab.value = 'expected';
  }
}

function toLastDebugRunSnapshot(result: DebugRunResult) {
  return {
    statusCode: result.statusCode,
    headers: result.headers,
    body: result.body,
    bodySize: result.bodySize,
    durationMs: result.durationMs,
    error: result.error,
    assertions: result.assertions,
    executedAt: new Date().toISOString(),
  };
}

function patchActiveCaseLastDebugRun(snapshot: ReturnType<typeof toLastDebugRunSnapshot>) {
  const caseId = apiStore.activeCaseId;
  if (!caseId) return;
  const row = apiStore.cases.find((item) => item.id === caseId);
  if (!row) return;
  row.metadata = { ...row.metadata, lastDebugRun: snapshot };
}

function loadForm(row: ApiTestCaseRow) {
  const sameCase = loadedCaseId.value === row.id;
  syncingForm.value = true;
  if (!sameCase) {
    editorMainTab.value = row.metadata?.lastDebugRun ? 'assertion' : 'request';
    restoreLastDebugRun(row, false);
  } else {
    restoreLastDebugRun(row, true);
  }
  form.endpointId = row.endpointId;
  form.title = row.title;
  form.caseNo = row.caseNo ?? '';
  form.description = row.description ?? '';
  form.remark = row.remark ?? '';
  form.transactionCode =
    row.transactionCode ?? apiStore.activeTransaction?.code ?? '';
  form.owner = row.owner ?? '';
  form.createdBy = row.createdBy ?? '';
  form.metadata = row.metadata ?? {};
  form.polarity = row.polarity;
  form.status = row.status;
  form.enabled = row.enabled;
  applyRequestToForm(row.request);
  form.assertionRows = assertionsToRows(row.expected?.assertions);
  loadedCaseId.value = row.id;
  syncingForm.value = false;
  debugEncoding.value = row.metadata?.debugEncoding ?? inferDebugEncoding();
  void restoreCaseDebugEnvironment(row);
}

async function restoreCaseDebugEnvironment(row: ApiTestCaseRow) {
  const pid = projectId.value;
  const envId = row.metadata?.debugEnvironmentId;
  const serviceId = row.metadata?.debugEnvironmentServiceId;
  if (!pid || !envId) return;
  if (!apiStore.environments.length) {
    await apiStore.refreshEnvironments(pid);
  }
  if (!apiStore.environments.some((item) => item.id === envId)) return;
  syncingForm.value = true;
  apiStore.selectedEnvironmentId = envId;
  await apiStore.refreshEnvironmentServices(pid, envId);
  const services = apiStore.environmentServices[envId] ?? [];
  if (serviceId && services.some((item) => item.id === serviceId)) {
    debugServiceId.value = serviceId;
  } else {
    syncDebugServiceSelection();
  }
  syncingForm.value = false;
}

function syncFormFromActiveCase() {
  const row = apiStore.cases.find((item) => item.id === apiStore.activeCaseId);
  if (row) {
    loadForm(row);
  }
}

function selectCase(caseId: string) {
  isNewCase.value = false;
  apiStore.activeCaseId = caseId;
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  if (batchMode.value) {
    apiStore.selectedCaseIds = [];
    isNewCase.value = false;
    return;
  }
  if (apiStore.activeCaseId) {
    apiStore.selectedCaseIds = [apiStore.activeCaseId];
  }
}

function isActiveCard(caseId: string) {
  if (batchMode.value) {
    return selectedIds.value.includes(caseId);
  }
  return caseId === apiStore.activeCaseId && !isNewCase.value;
}

function handleCardClick(caseId: string) {
  if (batchMode.value) {
    const checked = !selectedIds.value.includes(caseId);
    apiStore.toggleCaseSelection(caseId, checked);
    return;
  }
  selectCase(caseId);
}

function toggleSelectAll(event: { target: { checked: boolean } }) {
  const checked = event.target.checked;
  if (checked) {
    const pageIds = apiStore.cases.map((item) => item.id);
    apiStore.selectedCaseIds = [...new Set([...apiStore.selectedCaseIds, ...pageIds])];
    return;
  }
  const pageIdSet = new Set(apiStore.cases.map((item) => item.id));
  apiStore.selectedCaseIds = apiStore.selectedCaseIds.filter((id) => !pageIdSet.has(id));
}

function readCheckboxChecked(event: unknown) {
  const target = (event as { target?: { checked?: boolean } })?.target;
  return Boolean(target?.checked);
}

function onToggleSelect(caseId: string, checked: boolean) {
  apiStore.toggleCaseSelection(caseId, checked);
}

function beautifyRequestJson() {
  if (form.bodyFormat === 'xml') {
    form.requestBodyXml = beautifyRequestBodyXml(form.requestBodyXml);
    message.success('请求报文已美化');
    return;
  }
  if (form.bodyFormat === 'json') {
    try {
      form.requestBodyJson = beautifyCasePayloadJson(form.requestBodyJson);
      message.success('请求报文已美化');
    } catch {
      message.error('JSON 不是合法格式，无法美化');
    }
    return;
  }
  message.info('纯文本报文无需美化');
}

function onCreate() {
  batchMode.value = false;
  isNewCase.value = true;
  loadedCaseId.value = '';
  apiStore.activeCaseId = '';
  syncingForm.value = true;
  const first = apiStore.apiDoc?.endpoints?.[0];
  form.endpointId = first?.id ?? '';
  form.title = '';
  form.caseNo = '';
  form.description = '';
  form.remark = '';
  form.transactionCode = apiStore.activeTransaction?.code ?? '';
  form.owner = '';
  form.createdBy = '';
  form.polarity = 'positive';
  form.status = 'ready';
  form.enabled = true;
  if (first) {
    const split = defaultEditorState('http', 'json', first);
    form.protocol = split.protocol;
    form.bodyFormat = split.bodyFormat;
    form.httpMethod = 'POST';
    form.httpPath = first.path || '';
    form.headerRows = split.headerRows;
    form.queryRows = split.queryRows;
    form.socketEncoding = split.socketEncoding;
    form.requestBodyText = split.requestBodyText;
    form.requestBodyJson = split.requestBodyJson;
    form.requestJson = split.requestJson;
    form.requestMetaJson = split.requestMetaJson;
    form.requestTcpMeta = split.requestTcpMeta;
    form.requestBodyXml = split.requestBodyXml;
  } else {
    const split = defaultEditorState();
    form.protocol = split.protocol;
    form.bodyFormat = split.bodyFormat;
    form.httpMethod = split.httpMethod;
    form.httpPath = split.httpPath;
    form.headerRows = split.headerRows;
    form.queryRows = split.queryRows;
    form.socketEncoding = split.socketEncoding;
    form.requestBodyText = split.requestBodyText;
    form.requestBodyJson = split.requestBodyJson;
    form.requestJson = split.requestJson;
    form.requestMetaJson = split.requestMetaJson;
    form.requestTcpMeta = split.requestTcpMeta;
    form.requestBodyXml = split.requestBodyXml;
  }
  requestTab.value = 'body';
  editorMainTab.value = 'basic';
  form.assertionRows = [];
  debugResult.value = null;
  debugResponseTab.value = 'expected';
  debugEncoding.value = inferDebugEncoding();
  syncingForm.value = false;
}

function buildSavePayload(): Record<string, unknown> | null {
  if (!form.title.trim()) return null;
  const expected = buildExpectedFromRows(form.assertionRows);
  const payload: Record<string, unknown> = {
    endpointId: form.endpointId,
    title: form.title.trim(),
    caseNo: form.caseNo.trim() || undefined,
    description: form.description,
    remark: form.remark,
    transactionCode: form.transactionCode,
    owner: form.owner,
    polarity: form.polarity,
    status: form.status,
    enabled: form.status !== 'disabled',
    request: mergeRequestFromEditor({
      mode: requestEditorMode.value,
      protocol: form.protocol,
      bodyFormat: form.bodyFormat,
      httpMethod: form.httpMethod,
      httpPath: form.httpPath,
      headerRows: form.headerRows,
      queryRows: form.queryRows,
      socketEncoding: form.socketEncoding,
      requestBodyText: form.requestBodyText,
      requestBodyJson: form.requestBodyJson,
      requestJson: form.requestJson,
      requestMetaJson: form.requestMetaJson,
      requestTcpMeta: form.requestTcpMeta,
      requestBodyXml: form.requestBodyXml,
    }),
    expected,
      debugEnvironmentId: apiStore.selectedEnvironmentId || undefined,
      debugEnvironmentServiceId: debugServiceId.value || undefined,
      debugEncoding: debugEncoding.value || undefined,
    };
  if (isNewCase.value && apiStore.caseListVersionFilter != null) {
    payload.generateVersion = apiStore.caseListVersionFilter;
  }
  if (debugResult.value) {
    payload.lastDebugRun = toLastDebugRunSnapshot(debugResult.value);
  }
  return payload;
}

async function persistCase(options?: { silent?: boolean }): Promise<boolean> {
  if (!projectId.value || !transactionId.value) return false;
  const payload = buildSavePayload();
  if (!payload) return false;
  const caseId = isNewCase.value ? undefined : apiStore.activeCaseId;
  saving.value = true;
  try {
    await apiStore.saveCase(
      projectId.value,
      transactionId.value,
      payload,
      caseId || undefined,
      options,
    );
    isNewCase.value = false;
    return true;
  } catch (error) {
    if (!options?.silent) {
      message.error((error as Error)?.message || '保存失败，请检查请求报文/预期结果 JSON 格式');
    }
    return false;
  } finally {
    saving.value = false;
  }
}

async function onSave() {
  if (!projectId.value || !transactionId.value) return;
  if (!form.title.trim()) {
    message.warning('请填写案例名称');
    return;
  }
  await persistCase();
}

const debugResponseBodyText = computed(() => {
  if (debugResponseBodyOverride.value !== null) {
    return debugResponseBodyOverride.value;
  }
  const body = debugResult.value?.body;
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
});

function beautifyDebugResponseBody() {
  if (!debugResult.value || !hasDebugResponseBody.value) {
    message.info('暂无响应体');
    return;
  }
  try {
    debugResponseBodyOverride.value = formatRunSnapshotForDisplay(debugResult.value.body);
    message.success('响应体已美化');
  } catch {
    message.error('无法美化当前响应体');
  }
}

function formatAssertValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildDebugRequest(): ApiCaseRequest {
  return mergeRequestFromEditor({
    mode: requestEditorMode.value,
    protocol: form.protocol,
    bodyFormat: form.bodyFormat,
    httpMethod: form.httpMethod,
    httpPath: form.httpPath,
    headerRows: form.headerRows,
    queryRows: form.queryRows,
    socketEncoding: form.socketEncoding,
    requestBodyText: form.requestBodyText,
    requestBodyJson: form.requestBodyJson,
    requestJson: form.requestJson,
    requestMetaJson: form.requestMetaJson,
    requestTcpMeta: form.requestTcpMeta,
    requestBodyXml: form.requestBodyXml,
  });
}

async function onDebugRun() {
  if (!projectId.value || !transactionId.value) return;
  if (!apiStore.selectedEnvironmentId) {
    message.warning('请选择调试环境');
    return;
  }
  const caseKey = activeCaseKey();
  const caseIdAtStart = isNewCase.value ? undefined : apiStore.activeCaseId || undefined;
  debugRunningCaseKey.value = caseKey;
  debugResult.value = null;
  debugResponseTab.value = 'expected';
  try {
    const result = await debugRunCase(
      projectId.value,
      transactionId.value,
      {
        request: buildDebugRequest(),
        expected: buildExpectedFromRows(form.assertionRows),
        polarity: form.polarity,
        environmentId: apiStore.selectedEnvironmentId,
        environmentServiceId: debugServiceId.value || apiStore.selectedEnvironmentServiceId || undefined,
        encoding: debugEncoding.value,
        caseId: caseIdAtStart,
      },
    );
    if (!isStillOnCase(caseKey)) {
      if (caseIdAtStart) {
        const row = apiStore.cases.find((item) => item.id === caseIdAtStart);
        if (row) {
          row.metadata = {
            ...row.metadata,
            lastDebugRun: toLastDebugRunSnapshot(result),
          };
        }
      }
      return;
    }
    debugResult.value = result;
    debugResponseTab.value = result.error ? 'expected' : 'body';
    editorMainTab.value = 'assertion';
    if (caseIdAtStart) {
      patchActiveCaseLastDebugRun(toLastDebugRunSnapshot(result));
    }
    const saved = await persistCase({ silent: true });
    if (saved) {
      message.success('调试完成并已保存');
    } else if (!form.title.trim()) {
      message.warning('调试完成，请填写案例名称后保存');
    } else {
      message.warning('调试完成，但自动保存失败，请手动点击保存');
    }
  } catch {
    if (isStillOnCase(caseKey)) {
      message.error('调试执行失败，请检查环境配置和请求报文');
    }
  } finally {
    releaseCaseTask(debugRunningCaseKey, caseKey);
  }
}

async function onGenerateAssertions() {
  if (!projectId.value || !transactionId.value) return;

  const responseIssue = getDebugResponseIssue(debugResult.value);
  if (responseIssue) {
    message.warning(responseIssue);
    return;
  }
  const result = debugResult.value!;
  const caseKey = activeCaseKey();
  const caseIdAtStart = isNewCase.value ? undefined : apiStore.activeCaseId || undefined;

  const hasExisting = form.assertionRows.some((row) => Boolean(row.type && row.operator));

  if (hasExisting) {
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '覆盖已有断言？',
        content: '当前已有断言，AI 生成的断言将整段替换。确定继续？',
        okText: '替换',
        cancelText: '取消',
        centered: true,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  generatingAssertionsCaseKey.value = caseKey;
  try {
    const transport = form.protocol === 'socket' ? 'tcp' : 'http';
    const messageFormat = form.bodyFormat === 'xml' ? 'xml' : form.bodyFormat === 'text' ? 'text' : 'json';
    const { assertions } = await generateAssertions(
      projectId.value,
      transactionId.value,
      {
        transport,
        messageFormat,
        polarity: form.polarity,
        statusCode: result.statusCode,
        headers: result.headers,
        body: result.body,
      },
    );
    if (!assertions.length) {
      if (isStillOnCase(caseKey)) {
        message.warning('AI 未生成有效断言，请手动编辑');
      }
      return;
    }
    if (!isStillOnCase(caseKey)) {
      if (caseIdAtStart) {
        const row = apiStore.cases.find((item) => item.id === caseIdAtStart);
        if (row) {
          const expected = buildExpectedFromRows(assertionsToRows(assertions));
          await apiStore.saveCase(
            projectId.value,
            transactionId.value,
            {
              endpointId: row.endpointId,
              title: row.title,
              caseNo: row.caseNo,
              description: row.description,
              remark: row.remark,
              transactionCode: row.transactionCode,
              owner: row.owner,
              polarity: row.polarity,
              status: row.status,
              enabled: row.enabled,
              request: row.request,
              expected,
              debugEnvironmentId: row.metadata?.debugEnvironmentId,
              debugEnvironmentServiceId: row.metadata?.debugEnvironmentServiceId,
              lastDebugRun: row.metadata?.lastDebugRun,
            },
            caseIdAtStart,
            { silent: true },
          );
          message.success(`案例「${row.title || row.caseNo || '未命名'}」的断言已生成`);
        }
      }
      return;
    }
    form.assertionRows = assertionsToRows(assertions);
    debugResponseTab.value = 'expected';
    const saved = await persistCase({ silent: true });
    if (saved) {
      message.success(`AI 生成了 ${assertions.length} 条断言并已保存`);
    } else if (!form.title.trim()) {
      message.warning(`AI 生成了 ${assertions.length} 条断言，请填写案例名称后保存`);
    } else {
      message.warning(`AI 生成了 ${assertions.length} 条断言，但自动保存失败，请手动点击保存`);
    }
  } catch {
    if (isStillOnCase(caseKey)) {
      message.error('AI 生成断言失败，请稍后重试');
    }
  } finally {
    releaseCaseTask(generatingAssertionsCaseKey, caseKey);
  }
}

function onDelete() {
  if (!projectId.value || !transactionId.value || !apiStore.activeCaseId) return;
  const row = activeCase.value;
  const label = row?.title || row?.caseNo || '该案例';
  Modal.confirm({
    title: '删除案例？',
    content: `确定删除「${label}」？删除后不可恢复，执行集关联也会一并移除。`,
    centered: true,
    okType: 'danger',
    okText: '删除',
    cancelText: '取消',
    onOk: async () => {
      await apiStore.removeCase(
        projectId.value,
        transactionId.value,
        apiStore.activeCaseId,
      );
      isNewCase.value = false;
    },
  });
}

function onBatchDelete() {
  if (!projectId.value || !transactionId.value || !selectedIds.value.length) return;
  const count = selectedIds.value.length;
  Modal.confirm({
    title: `删除选中的 ${count} 条案例？`,
    content: '删除后不可恢复',
    centered: true,
    okType: 'danger',
    okText: '删除',
    onOk: async () => {
      await apiStore.removeCases(
        projectId.value,
        transactionId.value,
        [...selectedIds.value],
      );
    },
  });
}
</script>

<style scoped>
.api-case-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.api-case-panel .instruction-editor-body {
  overflow: hidden;
}

.api-case-panel .editor-hero {
  flex-shrink: 0;
}

.case-list-toolbar {
  margin: 0 12px 4px;
}

.case-list-selection {
  color: #667085;
  font-size: 12px;
}

.case-list-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 6px 8px 8px;
  border-top: 1px solid #eaecf0;
}

.case-list-pagination :deep(.ant-pagination) {
  margin: 0;
  font-size: 12px;
}

.case-list-pagination :deep(.ant-pagination-item),
.case-list-pagination :deep(.ant-pagination-prev),
.case-list-pagination :deep(.ant-pagination-next),
.case-list-pagination :deep(.ant-pagination-jump-prev),
.case-list-pagination :deep(.ant-pagination-jump-next) {
  min-width: 24px;
  height: 24px;
  line-height: 22px;
}

.case-list-pagination :deep(.ant-pagination-item a) {
  padding: 0 4px;
}

.case-list-pagination :deep(.ant-pagination-options) {
  margin-inline-start: 4px;
}

.case-list-pagination :deep(.ant-pagination-options-size-changer.ant-select) {
  font-size: 12px;
}

.case-list-pagination :deep(.ant-select-single .ant-select-selector) {
  height: 24px !important;
  padding: 0 8px !important;
}

.case-list-pagination :deep(.ant-select-single .ant-select-selection-item) {
  line-height: 22px !important;
}

.case-card.browse-card .test-point-card-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.case-card.batch-card .test-point-card-head {
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.batch-case-summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.batch-case-summary-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px 132px;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eaecf0;
  font-size: 13px;
}

.batch-case-summary-list li:last-child {
  border-bottom: none;
}

.batch-case-summary-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-case-summary-tag {
  margin: 0;
  justify-self: start;
}

.batch-case-summary-no {
  justify-self: end;
  text-align: right;
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.batch-case-summary-more {
  color: #667085;
  font-size: 12px;
}

.case-card-title strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.case-card-title small {
  color: #667085;
  font-size: 12px;
}

.case-list-head-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-version-filter {
  width: 88px;
}

.case-list-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 180px;
  padding: 24px 16px;
  color: #667085;
  text-align: center;
}

.case-list-empty-icon {
  color: #98a2b3;
  font-size: 28px;
}

.case-list-empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.case-badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.case-transport-badge {
  align-self: flex-start;
}

.case-version-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  color: #262626;
  background: transparent;
  border: 1px solid #8c8c8c;
  margin: 0;
}

.hero-version-tag {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  padding: 0 6px;
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

.polarity-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
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

.polarity-pill--lg {
  min-width: auto;
  padding: 4px 10px;
  font-size: 12px;
}

.editor-hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.editor-hero-title-row h3 {
  margin: 0;
}

.hero-case-no {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--cf-text-secondary, #667085);
}

/* ===== 底部操作栏 ===== */
.case-editor-footer {
  justify-content: flex-end;
}
.case-editor-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* ===== 空状态 ===== */
.case-editor-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.case-editor-placeholder-icon {
  font-size: 48px;
  color: var(--cf-text-muted, #98a2b3);
  opacity: 0.25;
}
.case-editor-placeholder-text {
  margin: 0;
  font-size: 14px;
  color: var(--cf-text-muted, #98a2b3);
}

.case-payload-block {
  padding-bottom: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.case-payload-block > .case-editor-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.case-editor-main-tabs-row {
  margin-bottom: 12px;
}

.case-editor-main-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-bottom: 1px solid #eaecf0;
}

.case-editor-main-tab {
  position: relative;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.case-editor-main-tab.active {
  color: #7f1d1d;
  font-weight: 600;
}

.case-editor-main-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #7f1d1d;
  border-radius: 2px 2px 0 0;
}

.case-editor-panel {
  min-width: 0;
}

.case-request-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.case-request-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  background: #fff;
}

.case-assertion-shell,
.case-basic-shell {
  border: 1px solid #eaecf0;
  background: #fff;
}

.case-basic-panel .case-basic-shell {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.case-assertion-panel .case-assertion-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.case-basic-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  padding: 12px;
  border-bottom: 1px solid #f2f4f7;
}

.case-basic-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.case-basic-field--full {
  grid-column: 1 / -1;
}

.case-basic-label {
  font-size: 12px;
  font-weight: 500;
  color: #667085;
  line-height: 1.4;
}

.case-basic-label--required::after {
  margin-left: 2px;
  color: #d92d20;
  content: '*';
}

.case-basic-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
}

.case-basic-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.case-basic-textarea {
  border-radius: 0 !important;
  font-size: 13px;
}

@media (max-width: 900px) {
  .case-basic-form,
  .case-basic-meta {
    grid-template-columns: 1fr;
  }
}

.case-protocol-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 0;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid #f2f4f7;
  border-radius: 0;
  background: transparent;
  flex-shrink: 0;
}

.case-protocol-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-protocol-field--grow {
  flex: 1;
  min-width: 220px;
}

.case-protocol-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #667085;
  white-space: nowrap;
}

.case-protocol-select {
  min-width: 108px;
}

.case-payload-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: stretch;
}

.case-payload-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.case-payload-hint {
  margin: 0 0 8px;
  min-height: 1.5em;
  font-size: 12px;
  line-height: 1.5;
  color: #667085;
}

.case-request-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 0;
  padding: 0 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
}

.case-request-tabs {
  display: flex;
  gap: 2px;
  min-width: 0;
}

.case-request-tab {
  position: relative;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 12px;
  cursor: pointer;
}

.case-request-tab.active {
  color: #7f1d1d;
  font-weight: 600;
}

.case-request-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #7f1d1d;
  border-radius: 2px 2px 0 0;
}

.case-request-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 999px;
  background: #eaecf0;
  color: #475467;
  font-size: 11px;
  font-weight: 500;
}

.case-body-panel {
  min-width: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

.case-body-hint-row {
  min-height: 20px;
}

.case-body-hint {
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.case-body-format-bar {
  display: inline-flex;
  border: 1px solid #d0d5dd;
  overflow: hidden;
  background: #fff;
}

.case-body-format-btn {
  padding: 2px 10px;
  border: none;
  border-right: 1px solid #d0d5dd;
  border-radius: 0;
  background: #fff;
  color: #475467;
  font-size: 11px;
  line-height: 20px;
  cursor: pointer;
}

.case-body-format-btn:last-child {
  border-right: none;
}

.case-body-format-btn.active {
  background: #7f1d1d;
  color: #fff;
}

.case-body-format-btn.disabled,
.case-body-format-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.case-editor-surface {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid #eaecf0;
  background: #fff;
  overflow: hidden;
}

.case-editor-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #f2f4f7;
  background: #fafbfc;
  flex-shrink: 0;
}

.case-editor-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.case-editor-beautify-btn {
  flex-shrink: 0;
  height: auto;
  padding: 0 4px;
  font-size: 12px;
}

.case-editor-surface .case-payload-textarea--in-surface {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  height: auto;
  border: none !important;
  box-shadow: none !important;
  padding: 8px 10px;
  overflow-y: auto !important;
  overflow-x: auto;
  resize: none;
  box-sizing: border-box;
}

.case-editor-surface .case-payload-textarea--expand:not(.case-payload-textarea--in-surface) {
  width: 100%;
  flex: 1;
  min-height: 248px;
  border: none !important;
  box-shadow: none !important;
  padding-top: 0;
}

.case-editor-surface .case-body-empty {
  min-height: 280px;
  border: none;
  border-radius: 0;
}

.case-assertion-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.case-assertion-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.case-assertion-shell .case-debug-response {
  margin: 0;
  border: none;
  border-radius: 0;
  background: #fafbfc;
}

.case-assertion-shell .case-debug-response--full {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 12px 12px;
}

.case-panel-hint {
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.case-debug-panel:has(.case-debug-assertion-editor) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.case-debug-assertion-editor {
  flex: 1;
  min-height: 0;
}

.case-body-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 200px;
  color: #98a2b3;
  font-size: 12px;
  text-align: center;
  padding: 16px;
}

.case-payload-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow: hidden;
}

.case-payload-fields--body {
  padding: 12px;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.case-payload-fields--body:has(.kv-rows-editor) {
  padding: 12px;
}

.case-payload-fields--body :deep(.kv-rows-editor) {
  flex: 1;
  min-height: 0;
}

.case-payload-textarea {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.case-payload-textarea:deep(textarea.ant-input) {
  flex: 1;
  min-height: 0;
  resize: none;
}

.case-payload-textarea--expand {
  display: block;
  width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: auto;
  border-radius: 0 !important;
}

.case-payload-textarea--expand.case-payload-textarea--in-surface {
  resize: none;
}

.case-payload-textarea--expand.case-xml-editor {
  white-space: pre;
}

.case-payload-textarea--meta {
  flex: none;
}

.case-payload-textarea--meta:deep(textarea.ant-input) {
  flex: none;
  min-height: 0;
}

.editor-block-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.editor-block-title-row .editor-block-title {
  margin-bottom: 0;
}

.editor-block-title-row :deep(.ant-btn-link) {
  height: auto;
  padding: 0;
  font-size: 12px;
}

.case-json-editor {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.case-xml-editor {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.request-split-label {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--cf-text-secondary, #666);
}

.request-split-label:first-of-type {
  margin-top: 0;
}

.empty-state {
  margin: 48px 0;
}

@media (max-width: 1100px) {
  .case-payload-grid {
    grid-template-columns: 1fr;
  }
}

.case-debug-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 4px 0;
}

.case-debug-env-select {
  width: 140px;
}

.case-debug-service-select {
  width: 220px;
}

.case-debug-encoding-select {
  width: 96px;
}

.case-debug-response {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow: hidden;
  flex-shrink: 0;
}

.case-debug-response-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.case-debug-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #eaecf0;
  flex-shrink: 0;
}

.case-debug-tab {
  position: relative;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 12px;
  cursor: pointer;
}

.case-debug-tab.active {
  color: #7f1d1d;
  font-weight: 600;
}

.case-debug-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #7f1d1d;
}

.case-debug-panel {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  overflow-y: auto;
}

.case-debug-body-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.case-debug-body-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-bottom: none;
}

.case-debug-body-shell .case-debug-body-pre {
  flex: 1;
  min-height: 80px;
  border-top: none;
}

.case-debug-body-pre,
.case-debug-headers-pre {
  margin: 0;
  padding: 8px 10px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #344054;
  background: #fff;
  border: 1px solid #eaecf0;
  white-space: pre-wrap;
  word-break: break-word;
}

.case-debug-assert-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: #fff;
  border: 1px solid #eaecf0;
}

.case-debug-response-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.case-debug-status {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0f0f0;
}

.case-debug-status.status-ok {
  color: #52c41a;
  background: #f6ffed;
}

.case-debug-status.status-err {
  color: #ff4d4f;
  background: #fff2f0;
}

.case-debug-status.status-tcp {
  color: #1890ff;
  background: #e6f7ff;
}

.case-debug-duration,
.case-debug-size {
  color: #888;
  font-size: 12px;
}

.case-debug-error {
  color: #ff4d4f;
  padding: 8px 12px;
  background: #fff2f0;
  border-radius: 0;
  font-size: 13px;
  flex-shrink: 0;
}

.case-debug-assert-table th {
  text-align: left;
  padding: 4px 8px;
  background: #f0f0f0;
  border: 1px solid #e8e8e8;
  font-weight: 600;
}

.case-debug-assert-table td {
  padding: 4px 8px;
  border: 1px solid #e8e8e8;
  vertical-align: top;
}

.case-debug-assert-table tr.assert-pass td {
  background: #f6ffed;
}

.case-debug-assert-table tr.assert-fail td {
  background: #fff2f0;
}

.case-debug-assert-status {
  font-weight: 600;
}

.case-debug-assert-status.pass {
  color: #52c41a;
}

.case-debug-assert-status.fail {
  color: #ff4d4f;
}

.case-debug-assert-value {
  word-break: break-all;
  max-width: 200px;
  overflow-wrap: break-word;
}
</style>
