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
        <a-button @click="pasteCase"><CopyOutlined />粘贴案例</a-button>
        <a-button :type="batchMode ? 'primary' : 'default'" @click="toggleBatchMode">
          {{ batchMode ? '退出批量' : '批量操作' }}
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
              <a-menu-item key="export-excel">
                <ExportOutlined />
                导出 Excel
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <div v-if="showCaseWorkspace" class="dynamic-layout">
      <div class="test-point-list test-point-list-panel case-list-panel">
        <div class="test-point-list-header">
          <div class="test-point-list-head">
            <strong>案例列表</strong>
            <span class="test-point-count">{{ apiStore.caseListTotal }} 条</span>
          </div>
          <div class="test-point-filter-bar case-list-filter-bar">
            <a-select
              v-if="versionOptions.length > 1"
              v-model:value="apiStore.caseListVersionFilter"
              :options="versionOptions"
              size="small"
              class="case-version-filter"
              :popup-match-select-width="false"
              :dropdown-style="{ minWidth: '180px' }"
              @change="onVersionFilterChange"
            />
            <span
              v-if="versionOptions.length > 1 && channelOptions.length > 1"
              class="test-point-filter-sep"
              aria-hidden="true"
            >/</span>
            <a-select
              v-if="channelOptions.length > 1"
              v-model:value="apiStore.caseListChannelFilter"
              :options="channelOptions"
              size="small"
              class="case-channel-filter"
              @change="onChannelFilterChange"
            />
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
                <strong :title="displayCaseTitle(item)">{{ displayCaseTitle(item) }}</strong>
                <small>{{ item.caseNo || item.transactionCode || '待分配编号' }}</small>
                <div class="case-badges-row">
                  <a-tag
                    v-if="item.metadata?.versionCode"
                    class="case-version-tag"
                  >
                    {{ item.metadata.versionCode }}
                  </a-tag>
                </div>
              </div>
              <a-button
                v-if="!batchMode"
                class="case-card-copy-button"
                type="text"
                size="small"
                title="复制"
                :loading="copying && apiStore.activeCaseId === item.id"
                @click.stop="copyCase(item.id)"
              >
                <template #icon><CopyOutlined /></template>
              </a-button>
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
                <h3>已选 {{ selectedIds.length }} 条案例 · {{ batchSelectedSteps.size }} 个步骤</h3>
                <p>展开案例勾选步骤，批量操作仅作用于勾选的步骤</p>
              </div>
              <a-tag color="processing">批量操作</a-tag>
            </div>

            <div class="editor-block batch-config-block">
              <div
                class="batch-config-head"
                role="button"
                tabindex="0"
                @click="batchConfigExpanded = !batchConfigExpanded"
                @keydown.enter="batchConfigExpanded = !batchConfigExpanded"
              >
                <DownOutlined :class="['case-step-chevron', { 'is-open': batchConfigExpanded }]" />
                <strong>批量设置（仅覆盖已填写项）</strong>
                <span class="batch-config-summary">{{ batchConfigSummary }}</span>
              </div>
              <div v-if="batchConfigExpanded" class="batch-config-body">
                <div class="editor-block-title">执行环境</div>
                <div class="batch-request-config">
                  <a-select v-model:value="batchEnvironmentId" placeholder="环境" :options="debugEnvironmentOptions" @change="batchEnvironmentServiceId = ''" />
                  <a-select v-model:value="batchEnvironmentServiceId" show-search option-filter-prop="searchText" allow-clear placeholder="输入名称或地址筛选" :options="batchEnvironmentServiceOptions" :disabled="!batchEnvironmentId" />
                </div>
                <div class="editor-block-title">请求配置</div>
                <div class="batch-request-config batch-request-config--request">
                  <a-select v-model:value="batchRequest.protocol" allow-clear placeholder="通讯协议" :options="protocolOptions" />
                  <a-select
                    v-if="batchRequest.protocol === 'http'"
                    v-model:value="batchRequest.method"
                    allow-clear
                    placeholder="HTTP 方法"
                    :options="httpMethodOptions"
                  />
                  <a-select v-model:value="batchRequest.encoding" allow-clear placeholder="编码" :options="encodingOptions" />
                  <a-input v-if="batchRequest.protocol === 'http'" v-model:value="batchRequest.path" class="batch-request-path" placeholder="请求路径" allow-clear />
                </div>
                <div v-if="batchFullRequestUrl" class="batch-request-url">
                  完整请求路径：<span>{{ batchFullRequestUrl }}</span>
                </div>
              </div>
            </div>
            <div class="editor-block">
              <div class="editor-block-title-row batch-case-summary-head">
                <div class="editor-block-title">已选案例（展开勾选步骤）</div>
                <span class="batch-case-head-actions">
                  <a-button type="link" size="small" @click="selectAllBatchSteps">全选</a-button>
                  <a-button type="link" size="small" @click="clearAllBatchSteps">清空</a-button>
                </span>
              </div>
              <ul class="batch-case-summary-list">
                <li v-for="row in selectedRows" :key="row.id" class="batch-case-block">
                  <div
                    class="batch-case-head"
                    role="button"
                    tabindex="0"
                    @click="toggleBatchCaseExpand(row.id)"
                    @keydown.enter="toggleBatchCaseExpand(row.id)"
                  >
                    <DownOutlined :class="['case-step-chevron', { 'is-open': batchExpandedCaseIds.has(row.id) }]" />
                    <strong class="batch-case-summary-title" :title="row.title">{{ row.title || '未命名案例' }}</strong>
                    <span class="batch-case-summary-no">{{ row.caseNo || row.transactionCode || '待分配编号' }}</span>
                    <span class="batch-case-step-count">{{ selectedStepCountForCase(row) }}/{{ caseStepRows(row).length }} 步骤已选</span>
                    <span class="batch-case-head-actions" @click.stop>
                      <a-button type="link" size="small" @click="selectAllSteps(row)">全选</a-button>
                      <a-button type="link" size="small" @click="clearCaseSteps(row)">清空</a-button>
                    </span>
                  </div>
                  <div v-if="batchExpandedCaseIds.has(row.id)" class="batch-step-list">
                    <label v-for="step in caseStepRows(row)" :key="step.id" class="batch-step-item">
                      <a-checkbox
                        :checked="batchSelectedSteps.has(batchStepKey(row.id, step.id))"
                        @change="onBatchStepChange(row.id, step.id, $event)"
                      />
                      <span class="batch-step-name" :title="step.name">{{ step.name || '未命名步骤' }}</span>
                      <span class="batch-step-env">{{ step.target?.name || '未选择环境' }}</span>
                      <span class="batch-step-address" :title="step.target?.address">{{ step.target?.address || '未选择地址' }}</span>
                      <span
                        v-if="batchStepRunState(row.id, step.id)"
                        class="batch-case-summary-status"
                        :class="batchStepRunState(row.id, step.id)!.className"
                        :title="batchStepErrors[batchStepKey(row.id, step.id)]"
                      >{{ batchStepRunState(row.id, step.id)!.label }}</span>
                      <span v-else class="batch-case-summary-status" :class="batchStepStatus(step).className">{{ batchStepStatus(step).label }}</span>
                    </label>
                  </div>
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
            <span v-if="batchAssertionRunning" class="batch-assertion-progress">
              正在处理 {{ batchAssertionProgress.done }}/{{ batchAssertionProgress.total }}，成功 {{ batchAssertionProgress.success }}，失败 {{ batchAssertionProgress.failed }}
            </span>
            <a-button :disabled="!batchSelectedSteps.size || (!hasBatchRequestPatch && !batchEnvironmentId)" :loading="batchSaving" @click="onBatchSaveRequest">
              批量设置
            </a-button>
            <a-button type="primary" :disabled="!batchSelectedSteps.size" :loading="batchAssertionRunning" @click="onBatchGenerateAssertions">
              <template #icon><RobotOutlined /></template>
              AI 生成断言
            </a-button>
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
                      v-if="form.metadata?.versionCode"
                      color="blue"
                      class="hero-version-tag"
                    >
                      {{ form.metadata.versionCode }}
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

              <div v-show="editorMainTab === 'steps'" class="case-steps-list-panel">
                <div class="case-steps-toolbar">
                  <div>
                    <strong>步骤列表（{{ form.steps.length }}）</strong>
                    <div class="case-steps-hint">同组步骤同时发出；组内步骤不能互相引用提取变量</div>
                  </div>
                  <div class="action-toolbar">
                    <a-button size="small" @click="pasteStep">
                      <template #icon><CopyOutlined /></template>
                      粘贴步骤
                    </a-button>
                  </div>
                </div>
                <div class="case-step-rows">
                  <div v-if="form.steps.length" class="case-step-list-head">
                    <span>序号</span>
                    <span>步骤名称</span>
                    <span>环境</span>
                    <span>地址</span>
                    <span>并发</span>
                    <span>操作</span>
                  </div>
                  <div v-for="(step, index) in form.steps" :key="step.id" :class="['case-step-row', { 'is-parallel': parallelGroupNumber(index) }]">
                    <div class="case-step-row-summary" role="button" tabindex="0" @click="openStepEditor(index)" @keydown.enter="openStepEditor(index)">
                      <span class="case-step-order">{{ index + 1 }}</span>
                      <span class="case-step-row-name">
                        {{ step.name || '未命名步骤' }}
                        <a-tag v-if="parallelGroupNumber(index) && !step.parallelWithPrevious" class="case-parallel-tag">并行组 {{ parallelGroupNumber(index) }}</a-tag>
                      </span>
                      <span>{{ step.target?.name || '未选择环境' }}</span>
                      <span class="case-step-row-address">{{ step.target?.address || '未选择地址' }}</span>
                    </div>
                    <div class="case-step-parallel" @click.stop>
                      <a-tooltip v-if="index" title="与上一步并发执行">
                        <a-switch v-model:checked="step.parallelWithPrevious" size="small" checked-children="∥" un-checked-children="∥" />
                      </a-tooltip>
                    </div>
                    <div class="case-step-actions" @click.stop>
                      <a-button type="text" size="small" :disabled="index === 0" title="上移" @click="moveStep(index, -1)">↑</a-button>
                      <a-button type="text" size="small" :disabled="index === form.steps.length - 1" title="下移" @click="moveStep(index, 1)">↓</a-button>
                      <a-button type="text" size="small" title="复制" @click="selectStep(index); copyActiveStep()"><CopyOutlined /></a-button>
                      <a-button type="text" size="small" :disabled="isNewCase" title="调试历史" @click="selectStep(index); openDebugHistory()"><HistoryOutlined /></a-button>
                      <a-button type="text" danger size="small" :disabled="form.steps.length === 1" title="删除" @click="removeStep(index)"><DeleteOutlined /></a-button>
                      <a-button type="text" size="small" title="在此后新增步骤" @click="addStepAfter(index)"><PlusOutlined /></a-button>
                    </div>
                    <a-modal v-if="step.id === expandedStepId" v-model:open="stepEditModalOpen" title="编辑步骤" :width="1080" :footer="null" wrap-class-name="case-step-editor-modal" :z-index="NESTED_OVERLAY_Z_INDEX" @cancel="cancelStepEditor">
                      <template #title>
                        <div class="case-step-modal-title"><span class="case-step-modal-kicker">步骤 {{ activeStepIndex + 1 }}</span><strong>{{ form.stepName || '未命名步骤' }}</strong></div>
                      </template>
                      <div class="case-step-name-field">
                        <span>步骤名称</span>
                        <a-input v-model:value="form.stepName" size="small" placeholder="步骤名称" />
                      </div>
                      <div class="case-step-detail-tabs">
                        <button v-for="tab in stepDetailTabs" :key="tab.key" type="button" :class="['case-editor-main-tab', { active: stepDetailTab === tab.key }]" @click="stepDetailTab = tab.key">{{ tab.label }}</button>
                      </div>

              <div v-show="editorMainTab === 'steps' && stepDetailTab === 'request'" class="case-editor-panel case-request-panel">
                <div class="case-request-shell">
                <div
                  class="case-request-summary case-request-summary--clickable"
                  role="button"
                  tabindex="0"
                  @click="requestConfigExpanded = !requestConfigExpanded"
                  @keydown.enter="requestConfigExpanded = !requestConfigExpanded"
                >
                  <span class="case-request-summary-method">{{ form.protocol === 'http' ? form.httpMethod : form.protocol.toUpperCase() }}</span>
                  <span class="case-request-summary-url" :title="fullRequestAddress">{{ fullRequestAddress || '请选择环境和地址' }}</span>
                  <span class="case-request-summary-encoding">{{ debugEncoding }}</span>
                  <a-button type="text" size="small" @click.stop="requestConfigExpanded = !requestConfigExpanded">
                    {{ requestConfigExpanded ? '收起' : '展开' }}
                    <DownOutlined :class="['request-config-chevron', { 'is-open': requestConfigExpanded }]" />
                  </a-button>
                </div>
                <template v-if="requestConfigExpanded">
                <div class="case-request-config-block">
                <div class="case-target-bar">
                  <div class="case-protocol-field case-protocol-field--target">
                    <span class="case-protocol-label">环境</span>
                    <a-select
                      v-model:value="apiStore.selectedEnvironmentId"
                      :options="debugEnvironmentOptions"
                      :get-popup-container="popupContainer"
                      :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
                      size="small"
                      placeholder="选择环境"
                      allow-clear
                    />
                  </div>
                  <div class="case-protocol-field case-protocol-field--target">
                    <span class="case-protocol-label">地址</span>
                    <a-select
                      v-model:value="debugServiceId"
                      :options="debugServiceOptions"
                      :get-popup-container="popupContainer"
                      :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
                      show-search
                      option-filter-prop="searchText"
                      size="small"
                      placeholder="输入名称或地址筛选"
                      allow-clear
                      :disabled="!apiStore.selectedEnvironmentId"
                    />
                  </div>
                </div>
                <div class="case-protocol-bar" :class="`case-protocol-bar--${form.protocol}`">
                  <div class="case-protocol-field case-protocol-field--protocol">
                    <span class="case-protocol-label">通讯协议</span>
                    <a-select
                      v-model:value="form.protocol"
                      :options="protocolOptions"
                      :get-popup-container="popupContainer"
                      :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
                      size="small"
                      class="case-protocol-select"
                    />
                  </div>
                  <template v-if="form.protocol === 'http'">
                    <div class="case-protocol-field case-protocol-field--method">
                      <span class="case-protocol-label">请求方法</span>
                      <a-select
                        v-model:value="form.httpMethod"
                        :options="httpMethodOptions"
                        :get-popup-container="popupContainer"
                        :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
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
                  <div class="case-protocol-field case-protocol-field--encoding">
                    <span class="case-protocol-label">编码</span>
                    <a-select
                      v-model:value="debugEncoding"
                      :options="debugEncodingOptions"
                      :get-popup-container="popupContainer"
                      :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
                      size="small"
                      class="case-protocol-select"
                    />
                  </div>
                </div>
                </div>
                </template>
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
                  <div v-if="form.protocol === 'http'" class="case-request-view-switch">
                    <button type="button" :class="{ active: requestViewMode === 'template' }" @click="requestViewMode = 'template'">模板</button>
                    <button type="button" :class="{ active: requestViewMode === 'curl' }" @click="requestViewMode = 'curl'">cURL</button>
                  </div>
                </div>
                <div class="case-payload-fields case-payload-fields--body">
                  <div v-if="requestViewMode === 'curl' && form.protocol === 'http'" class="case-curl-panel">
                    <div class="case-curl-toolbar">
                      <span>终端命令</span>
                      <a-button type="link" size="small" @click="copyCurlCommand">
                        <template #icon><CopyOutlined /></template>
                        复制
                      </a-button>
                    </div>
                    <pre>{{ curlCommand }}</pre>
                  </div>
                  <template v-else-if="requestTab === 'params'">
                    <KeyValueRowsEditor v-model:rows="form.queryRows" />
                  </template>
                  <template v-else-if="requestTab === 'headers'">
                    <KeyValueRowsEditor v-model:rows="form.headerRows" />
                  </template>
                  <template v-else>
                    <div class="case-body-panel">
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
                          <div v-if="canBeautifyBody" class="case-editor-chrome-actions">
                            <a-button type="link" size="small" :disabled="!hasBodyCursor || !hasAvailableSharedVariable" @click="openSharedVariableInsert"><LinkOutlined /> 插入变量</a-button>
                            <a-button type="link" size="small" :disabled="!hasBodyCursor" @click="openBodyFunctionInsert"><CodeOutlined /> 插入函数</a-button>
                            <a-button
                              type="link"
                              size="small"
                              class="case-editor-beautify-btn"
                              @click="beautifyRequestJson"
                            >
                              <template #icon><FormatPainterOutlined /></template>
                              美化
                            </a-button>
                          </div>
                        </div>
                        <div class="case-editor-content">
                        <template v-if="form.bodyFormat === 'json'">
                          <textarea
                            :key="`${payloadEditorKey}-body-json`"
                            v-model="form.requestBodyJson"
                            class="ant-input editor-textarea case-json-editor case-payload-textarea case-payload-textarea--expand case-payload-textarea--in-surface"
                            placeholder="{}"
                            spellcheck="false"
                            @focus="rememberBodyCursor"
                            @click="rememberBodyCursor"
                            @keyup="rememberBodyCursor"
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
                            @focus="rememberBodyCursor"
                            @click="rememberBodyCursor"
                            @keyup="rememberBodyCursor"
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
                            @focus="rememberBodyCursor"
                            @click="rememberBodyCursor"
                            @keyup="rememberBodyCursor"
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

              <div v-show="editorMainTab === 'steps' && stepDetailTab === 'assertion'" class="case-editor-panel case-assertion-panel">
                <div class="case-assertion-shell">
                  <div class="case-assertion-toolbar">
                    <div>
                      <strong>断言内容（{{ form.assertionRows.filter((row) => row.type && row.operator).length }}）</strong>
                    </div>
                    <div class="case-assertion-toolbar-actions">
                      <a-button
                        type="primary"
                        size="small"
                        :loading="debugRunning || generatingAssertions"
                        :disabled="!form.stepTargetAddress.trim()"
                        @click="onGenerateAssertions"
                      >
                        <template #icon><RobotOutlined /></template>
                        {{ debugRunning ? '正在请求接口' : generatingAssertions ? '正在生成断言' : 'AI 生成断言' }}
                      </a-button>
                    </div>
                  </div>
                  <div v-if="assertionGenerateError" class="case-assertion-error">{{ assertionGenerateError }}</div>
                  <div v-if="assertionGenerateError && form.assertionRows.some((row) => row.type && row.operator)" class="case-existing-assertion-note">
                    以下为原有断言，本次请求失败，未调用 AI、未更新断言。
                  </div>
                  <AssertionRowsEditor
                    :key="`${payloadEditorKey}-expected`"
                    v-model:rows="form.assertionRows"
                    :protocol="form.protocol"
                    :project-id="projectId"
                    class="case-debug-assertion-editor"
                  />
                </div>
              </div>

              <div v-show="editorMainTab === 'steps' && stepDetailTab === 'variables'" class="case-editor-panel case-assertion-panel">
                <div class="case-assertion-shell">
                  <div class="case-assertion-toolbar">
                    <div><strong>变量提取（{{ form.exports.length }}）</strong></div>
                    <div class="case-assertion-toolbar-actions">
                      <a-button type="primary" size="small" :loading="debugRunning" @click="addExportFromDebug">
                        <template #icon><ThunderboltOutlined /></template>
                        调试添加
                      </a-button>
                    </div>
                  </div>
                  <div class="case-step-response-list">
                  <a-table :data-source="form.exports" :pagination="false" size="small" row-key="rowId">
                    <a-table-column title="变量名" key="name">
                      <template #default="{ record }"><a-input v-model:value="record.name" placeholder="accessToken" /></template>
                    </a-table-column>
                    <a-table-column title="来源" key="source" :width="110">
                      <template #default="{ record }"><a-select v-model:value="record.source" size="small" :options="exportSourceOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }" /></template>
                    </a-table-column>
                    <a-table-column title="提取表达式" key="expression">
                      <template #default="{ record }"><a-input v-model:value="record.expression" placeholder="josn:$.Transaction... | xml:/Transaction/./. " /></template>
                    </a-table-column>
                    <a-table-column title="引用" key="reference" :width="160">
                      <template #default="{ record }"><code v-if="record.name">{{ variableReference(record.name) }}</code></template>
                    </a-table-column>
                    <a-table-column key="action" :width="60" align="center">
                      <template #title><a-button type="text" size="small" title="手动添加" @click="addExportRow"><PlusOutlined /></a-button></template>
                      <template #default="{ index }"><a-button type="text" size="small" danger title="删除" @click="form.exports.splice(index, 1)"><MinusOutlined /></a-button></template>
                    </a-table-column>
                  </a-table>
                  </div>
                  <a-empty v-if="!form.exports.length" description="从本步骤请求/响应中提取共享变量，后续步骤用 ${变量名} 引用" />
                </div>
              </div>
                      <div class="case-step-modal-footer">
                        <a-button :loading="debugRunning" :disabled="!form.stepTargetAddress.trim()" @click="onDebugRun()"><ThunderboltOutlined />调试</a-button>
                        <span></span>
                        <a-button @click="cancelStepEditor">取消</a-button>
                        <a-button type="primary" @click="confirmStepEditor">确认</a-button>
                      </div>
                    </a-modal>
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
              ? '请从左侧勾选案例，展开后勾选要操作的步骤'
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

    <a-modal v-model:open="debugHistoryOpen" :width="880" :footer="null" :z-index="NESTED_OVERLAY_Z_INDEX + 10" wrap-class-name="debug-history-modal">
      <template #title>
        <div class="debug-history-title"><strong>步骤调试历史</strong><span>{{ debugHistory.length }} 条</span></div>
      </template>
      <div class="debug-history-toolbar">
        <span>当前步骤的调试执行记录，点击「查看」核对请求与响应。</span>
        <a-button danger size="small" :disabled="!debugHistory.length" @click="clearDebugHistory">
          <template #icon><DeleteOutlined /></template>
          清空
        </a-button>
      </div>
      <div class="debug-history-list">
        <a-empty v-if="!debugHistory.length" description="暂无调试记录" />
        <div v-for="row in debugHistory" :key="row.id" class="debug-history-row">
          <div class="debug-history-row-main">
            <a-tag :color="debugRecordConnected(row) ? 'success' : 'error'" class="debug-history-status">{{ debugRecordConnected(row) ? '成功' : '失败' }}</a-tag>
            <span class="debug-history-time">{{ formatDebugTime(row.createdAt) }}</span>
            <span class="debug-history-metric">{{ row.record.durationMs }} ms</span>
            <span v-if="row.record.statusCode" class="debug-history-metric">HTTP {{ row.record.statusCode }}</span>
            <a-button type="link" size="small" class="debug-history-view" @click="openDebugRecordDetail(row)">查看</a-button>
          </div>
          <div v-if="row.record.error" class="debug-history-row-error">{{ row.record.error }}</div>
        </div>
      </div>
    </a-modal>
    <a-modal v-model:open="debugRecordDetailOpen" title="调试记录详情" :width="860" :footer="null" :z-index="NESTED_OVERLAY_Z_INDEX + 20">
      <div v-if="debugRecordDetail" class="debug-record-detail">
        <div v-if="debugRecordDetail.record.target?.address" class="debug-record-detail-target">
          <span>环境</span><strong>{{ debugRecordDetail.record.target.name || '—' }}</strong>
          <span>地址</span><strong>{{ debugRecordDetail.record.target.address }}</strong>
        </div>
        <div v-else class="debug-record-detail-target debug-record-detail-target--muted">
          <span>环境/地址</span><strong>旧记录未留存环境地址，重新调试一次即可记录</strong>
        </div>
        <div class="debug-record-detail-block">
          <div class="debug-record-detail-head"><strong>请求</strong></div>
          <pre>{{ JSON.stringify(debugRecordDetail.record.request, null, 2) }}</pre>
        </div>
        <div class="debug-record-detail-block">
          <div class="debug-record-detail-head"><strong>响应</strong></div>
          <pre>{{ JSON.stringify(debugRecordDetail.record.response, null, 2) }}</pre>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:open="debugResultModalOpen"
      title="调试结果"
      :width="760"
      :footer="null"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      centered
    >
      <div v-if="debugResult" class="case-debug-result-modal">
        <div class="case-debug-result-summary">
          <span :class="['case-debug-result-status', debugResult.error ? 'is-failed' : 'is-success']">
            {{ debugResult.error ? '连接失败' : '连接成功' }}
          </span>
          <span v-if="form.protocol === 'http'">状态码 {{ debugResult.statusCode }}</span>
          <span>{{ debugResult.durationMs }} ms</span>
          <span>{{ debugResult.bodySize }} bytes</span>
        </div>
        <div v-if="debugResult.error" class="case-debug-result-error">{{ debugResult.error }}</div>
        <pre v-else class="case-debug-result-body">{{ debugResultBodyText }}</pre>
      </div>
    </a-modal>

    <a-modal v-model:open="sharedVariableInsertOpen" title="插入变量" :z-index="NESTED_OVERLAY_Z_INDEX + 10" ok-text="插入" @ok="insertSharedVariable">
      <a-select v-model:value="sharedVariableName" style="width: 100%" :options="sharedVariableOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" placeholder="选择变量" />
    </a-modal>

    <a-modal v-model:open="debugExportOpen" title="手动添加" :z-index="NESTED_OVERLAY_Z_INDEX + 10" ok-text="添加" @ok="confirmDebugExport">
      <a-form layout="vertical">
        <a-form-item label="来源"><a-select v-model:value="debugExportSource" :options="debugExportSourceOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" @change="onDebugExportSourceChange" /></a-form-item>
        <a-form-item label="字段路径"><a-select v-model:value="debugExportPath" show-search :options="debugExportPathOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" placeholder="选择字段" /></a-form-item>
        <a-form-item label="变量名"><a-input v-model:value="debugExportName" placeholder="accessToken" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="bodyExpandModalOpen"
      :title="bodyExpandModalTitle"
      :width="1000"
      :z-index="NESTED_OVERLAY_Z_INDEX + 10"
      ok-text="完成"
      cancel-text="取消"
      wrap-class-name="case-body-expand-modal-wrap"
      :destroy-on-close="false"
      @ok="bodyExpandModalOpen = false"
    >
      <div class="case-body-expand-modal">
        <div class="case-body-expand-toolbar">
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
          <div class="expand-toolbar-actions">
            <a-button type="link" size="small" :disabled="!hasBodyCursor" @click="openBodyFunctionInsert"><CodeOutlined /> 插入函数</a-button>
            <a-button v-if="canBeautifyBody" type="link" size="small" class="case-editor-beautify-btn" @click="beautifyRequestJson">
              <template #icon><FormatPainterOutlined /></template>美化
            </a-button>
          </div>
        </div>
        <textarea
          v-if="form.bodyFormat === 'json'"
          v-model="form.requestBodyJson"
          class="ant-input editor-textarea case-json-editor case-body-expand-textarea"
          placeholder="{}"
          spellcheck="false"
          @focus="rememberBodyCursor"
          @click="rememberBodyCursor"
          @keyup="rememberBodyCursor"
        />
        <textarea
          v-else-if="form.bodyFormat === 'xml'"
          v-model="form.requestBodyXml"
          class="ant-input editor-textarea case-xml-editor case-body-expand-textarea"
          placeholder="XML 报文"
          spellcheck="false"
          @focus="rememberBodyCursor"
          @click="rememberBodyCursor"
          @keyup="rememberBodyCursor"
        />
        <textarea
          v-else
          v-model="form.requestBodyText"
          class="ant-input editor-textarea case-body-expand-textarea"
          placeholder="纯文本报文"
          spellcheck="false"
          @focus="rememberBodyCursor"
          @click="rememberBodyCursor"
          @keyup="rememberBodyCursor"
        />
      </div>
    </a-modal>

    <ApiCaseExportModal
      v-model:open="exportModalOpen"
      :project-id="projectId"
      :transaction-id="transactionId"
    />
  </section>
  <a-modal v-model:open="bodyFunctionInsertOpen" title="插入数据函数" :width="680" :z-index="NESTED_OVERLAY_Z_INDEX + 10" ok-text="插入" @ok="insertBodyFunction">
    <a-form layout="vertical">
      <a-form-item label="函数" required>
        <a-select v-model:value="bodyFunctionName" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" show-search :filter-option="filterBodyFunctionOption">
          <a-select-option v-for="item in bodyFunctions" :key="item.name" :value="item.name" :label="item.name">
            <span class="function-option-name">{{ item.name }}</span>
            <span v-if="item.description" class="function-option-desc">{{ item.description }}</span>
          </a-select-option>
        </a-select>
      </a-form-item>
      <p v-if="selectedBodyFunction?.description" class="function-description-hint">{{ selectedBodyFunction.description }}</p>
      <div v-if="selectedBodyFunction?.params.length" class="function-argument-list">
        <label v-for="(param, index) in selectedBodyFunction.params" :key="`${param}-${index}`" class="function-argument-row">
          <span :title="param">{{ index + 1 }}. {{ param }}</span>
          <a-auto-complete v-model:value="bodyFunctionArgs[index]" :options="bodyPathOptions(index)" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" filter-option placeholder="选择或输入参数来源" />
        </label>
      </div>
      <a-form-item v-if="selectedBodyFunction?.type === 'sql'" label="结果字段" required>
        <a-auto-complete v-model:value="bodyFunctionField" :options="bodyFunctionFieldOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" placeholder="选择或输入查询结果字段" />
      </a-form-item>
      <div class="function-expression-preview"><span>调用预览</span><code>{{ bodyFunctionPreview }}</code></div>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import {
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  InboxOutlined,
  LinkOutlined,
  MinusOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import type { MenuProps } from 'ant-design-vue';
import {
  caseForgePageSizeOptionLabels,
  normalizeCaseForgePageSize,
} from '@case-forge/shared';
import type { ApiCaseRequest, ApiCaseStep } from '@case-forge/shared';
import { copyText } from '@/utils/copyText';
import type { ApiTestCaseRow, DebugRunResult } from '@/api/apiTestClient';
import { clearStepDebugRecords, listStepDebugRecords, listAllApiCases, listDataFunctions, debugRunCase, generateAssertions, getAssertionGenerateStatus, getAssertionGenerateResult } from '@/api/apiTestClient';
import { useApiTestStore } from '@/stores/apiTest';
import { randomUuid } from '@/utils/randomUuid';
import KeyValueRowsEditor from '@/components/api-test/KeyValueRowsEditor.vue';
import AssertionRowsEditor from '@/components/api-test/AssertionRowsEditor.vue';
import ApiCaseExportModal from '@/components/api-test/ApiCaseExportModal.vue';
import { IMMERSIVE_OVERLAY_Z_INDEX, NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import {
  assertionsToRows,
  buildExpectedFromRows,
  type AssertionRow,
} from '@/utils/assertionRows.util';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
  buildDefaultHeaderRows,
  createEmptyKeyValueRow,
  defaultContentType,
  defaultEditorState,
  formatRunSnapshotField,
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
import { messagePathOptions } from '@/utils/messagePathOptions';
import { dataFunctionFieldOptions } from '@/utils/sqlSelectColumns.util';
import { getDebugResponseIssue, parseDebugResponseBody, responsePaths } from '@/utils/debugResponse.util';
import { copyStepToClipboard, readStepFromClipboard } from '@/utils/stepClipboard.util';

const apiStore = useApiTestStore();
const popupContainer = () => document.body;

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

function currentBodyText() {
  return form.bodyFormat === 'json' ? form.requestBodyJson : form.bodyFormat === 'xml' ? form.requestBodyXml : form.requestBodyText;
}

function setCurrentBodyText(value: string) {
  if (form.bodyFormat === 'json') form.requestBodyJson = value;
  else if (form.bodyFormat === 'xml') form.requestBodyXml = value;
  else form.requestBodyText = value;
}

function rememberBodyCursor(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  bodyFunctionCursor.start = input.selectionStart;
  bodyFunctionCursor.end = input.selectionEnd;
  hasBodyCursor.value = true;
}

async function openBodyFunctionInsert() {
  if (!hasBodyCursor.value) return;
  const rows = await listDataFunctions(projectId.value);
  bodyFunctions.value = rows;
  bodyFunctionName.value ||= rows[0]?.name ?? '';
  bodyFunctionInsertOpen.value = true;
}

function insertBodyFunction() {
  if (!bodyFunctionName.value) return message.warning('请选择函数');
  if (selectedBodyFunction.value?.type === 'sql' && !bodyFunctionField.value.trim()) return message.warning('请选择结果字段');
  const expression = bodyFunctionPreview.value;
  const body = currentBodyText();
  setCurrentBodyText(`${body.slice(0, bodyFunctionCursor.start)}${expression}${body.slice(bodyFunctionCursor.end)}`);
  bodyFunctionInsertOpen.value = false;
}

const batchMode = ref(false);
const batchSaving = ref(false);
/** 批量操作期间案例已在服务端更新，退出批量后需重新同步编辑表单 */
const batchCasesStale = ref(false);
const copying = ref(false);
const batchAssertionRunning = ref(false);
const batchAssertionProgress = reactive({ done: 0, total: 0, success: 0, failed: 0 });
const batchAssertionStatuses = reactive<Record<string, 'running' | 'success' | 'failed'>>({});
const batchEnvironmentId = ref('');
const batchEnvironmentServiceId = ref('');
const batchRequest = reactive<{
  protocol?: CaseProtocol;
  method?: HttpMethod;
  path?: string;
  encoding?: string;
}>({});
const hasBatchRequestPatch = computed(() => Boolean(
  batchRequest.protocol || batchRequest.method || batchRequest.path?.trim() || batchRequest.encoding,
));
const exportModalOpen = ref(false);
const bodyExpandModalOpen = ref(false);
const bodyFunctionInsertOpen = ref(false);
const bodyFunctionName = ref('');
const bodyFunctionArgs = ref<string[]>([]);
const bodyFunctionField = ref('');
const bodyFunctions = ref<Awaited<ReturnType<typeof listDataFunctions>>>([]);
const bodyFunctionCursor = reactive({ start: 0, end: 0 });
const hasBodyCursor = ref(false);
const selectedBodyFunction = computed(() => bodyFunctions.value.find((item) => item.name === bodyFunctionName.value));
const bodyFunctionPreview = computed(() => {
  const call = `\${${bodyFunctionName.value || '函数名'}(${bodyFunctionArgs.value.join(', ')})`;
  return selectedBodyFunction.value?.type === 'sql' ? `${call}.${bodyFunctionField.value || '字段'}}` : `${call}}`;
});
const bodyFunctionFieldOptions = computed(() =>
  dataFunctionFieldOptions(selectedBodyFunction.value?.config).map((value) => ({ value })),
);
function bodyPathOptions(index: number) {
  const keyword = (bodyFunctionArgs.value[index] ?? '').trim().toLowerCase();
  return messagePathOptions(currentBodyText()).filter((item) => !keyword || item.value.toLowerCase().includes(keyword));
}
function filterBodyFunctionOption(input: string, option: { value?: unknown }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  const item = bodyFunctions.value.find((row) => row.name === option.value);
  if (!item) return false;
  return item.name.toLowerCase().includes(keyword) || (item.description ?? '').toLowerCase().includes(keyword);
}

watch(selectedBodyFunction, (fn) => {
  bodyFunctionArgs.value = (fn?.params ?? []).map((_, index) => bodyFunctionArgs.value[index] ?? '');
  const config = fn?.config ?? {};
  bodyFunctionField.value = config.returnField ?? config.returnFields?.[0] ?? config.sqlReturnFields?.[0] ?? '';
});

const moreMenuOpen = ref(false);

const onCaseMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
  if (key === 'export-excel') {
    exportModalOpen.value = true;
  }
};

const saving = ref(false);
const isNewCase = ref(false);
const syncingForm = ref(false);
const debugRunningCaseKey = ref<string | null>(null);
const generatingAssertionsCaseKey = ref<string | null>(null);

let assertionPollTimer: ReturnType<typeof setInterval> | null = null;
interface AssertionPollTarget {
  jobId: string;
  caseKey: string;
  caseId?: string;
}
let assertionPollTarget: AssertionPollTarget | null = null;
const ASSERTION_POLL_INTERVAL_MS = 1500;
const debugResult = ref<DebugRunResult | null>(null);
const debugResultModalOpen = ref(false);
const debugServiceId = ref<string>('');
const debugEncoding = ref('UTF-8');
const loadedCaseId = ref('');
const debugResponseTab = ref<'expected' | 'body' | 'assert' | 'headers'>('expected');
const assertionGenerateError = ref('');

const debugResultBodyText = computed(() => {
  const body = debugResult.value?.body;
  if (body === undefined || body === null) return '无响应体';
  return formatRunSnapshotField(body);
});

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
  const expectedTransport = form.protocol === 'socket' ? 'tcp' : form.protocol;
  const services = apiStore.environmentServices[envId] ?? [];
  return services
    .filter((s) => s.enabled && (s.transport ?? 'http') === expectedTransport)
    .map((s) => {
      const transport = s.transport ?? 'http';
      const address = s.baseUrl?.trim() || s.serverAddress?.trim() || (s.host && s.port ? `${s.host}:${s.port}` : '');
      return {
        label: `${s.name}${address ? ` · ${address}` : ''} (${transport.toUpperCase()})`,
        value: s.id,
        searchText: `${s.name} ${address} ${s.host ?? ''} ${s.port ?? ''} ${transport}`.toLowerCase(),
      };
    });
});

const fullRequestAddress = computed(() => {
  const services = apiStore.environmentServices[apiStore.selectedEnvironmentId] ?? [];
  const service = services.find((item) => item.id === debugServiceId.value);
  if (form.protocol !== 'http') {
    return service?.serverAddress || (service?.host && service.port ? `${service.host}:${service.port}` : '');
  }
  const environment = apiStore.environments.find((item) => item.id === apiStore.selectedEnvironmentId);
  let baseUrl = service?.baseUrl?.trim() || service?.serverAddress?.trim() || environment?.baseUrl?.trim() || '';
  if (!baseUrl) return '';
  if (service?.pathPrefix?.trim() && !service.baseUrl?.trim() && !service.serverAddress?.trim()) {
    baseUrl = `${baseUrl.replace(/\/$/, '')}/${service.pathPrefix.replace(/^\//, '')}`;
  }
  const query = new URLSearchParams(
    form.queryRows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
  ).toString();
  const url = `${baseUrl.replace(/\/$/, '')}/${(form.httpPath.trim() || '/').replace(/^\//, '')}`;
  return query ? `${url}?${query}` : url;
});

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const curlCommand = computed(() => {
  const request = buildDebugRequest();
  const parts = [`curl --request ${request.method || 'GET'}`, shellQuote(fullRequestAddress.value || request.path || '/')];
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    parts.push(`--header ${shellQuote(`${key}: ${value}`)}`);
  }
  if (request.body !== undefined && request.body !== null && request.body !== '') {
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    parts.push(`--data-raw ${shellQuote(body)}`);
  }
  return parts.join(' \\\n  ');
});

async function copyCurlCommand() {
  await copyText(curlCommand.value);
  message.success('cURL 已复制');
}

const batchEnvironmentServiceOptions = computed(() =>
  (apiStore.environmentServices[batchEnvironmentId.value] ?? [])
    .filter((service) => service.enabled)
    .map((service) => {
      const transport = service.transport ?? 'http';
      const address = service.baseUrl?.trim() || service.serverAddress?.trim() || (service.host && service.port ? `${service.host}:${service.port}` : '');
      return {
        label: `${service.name}${address ? ` · ${address}` : ''} (${transport.toUpperCase()})`,
        value: service.id,
        searchText: `${service.name} ${address} ${service.host ?? ''} ${service.port ?? ''} ${transport}`.toLowerCase(),
      };
    }),
);
const batchFullRequestUrl = computed(() => {
  if (batchRequest.protocol !== 'http' || !batchEnvironmentId.value) return '';
  const environment = apiStore.environments.find((item) => item.id === batchEnvironmentId.value);
  const service = (apiStore.environmentServices[batchEnvironmentId.value] ?? [])
    .find((item) => item.id === batchEnvironmentServiceId.value);
  let baseUrl = service?.baseUrl?.trim() || service?.serverAddress?.trim() || environment?.baseUrl?.trim() || '';
  if (!baseUrl) return '';
  if (service?.pathPrefix?.trim() && !service.baseUrl?.trim() && !service.serverAddress?.trim()) {
    baseUrl = `${baseUrl.replace(/\/$/, '')}/${service.pathPrefix.replace(/^\//, '')}`;
  }
  const path = batchRequest.path?.trim() || '/';
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
});

watch(batchEnvironmentId, (environmentId) => {
  if (projectId.value && environmentId) {
    void apiStore.refreshEnvironmentServices(projectId.value, environmentId);
  }
});

function syncDebugServiceSelection() {
  if (
    debugServiceId.value &&
    debugServiceOptions.value.some((item) => item.value === debugServiceId.value)
  ) {
    return;
  }
  debugServiceId.value = debugServiceOptions.value[0]?.value ?? '';
}
const resolvingStepTarget = ref(false);
/** 编辑弹窗打开时，环境/地址下拉变化同步回步骤保存用的 target 字段，避免保存时残留旧值 */
watch([() => apiStore.selectedEnvironmentId, debugServiceId], () => {
  if (syncingForm.value || resolvingStepTarget.value || !stepEditModalOpen.value) return;
  const environment = apiStore.environments.find((item) => item.id === apiStore.selectedEnvironmentId);
  const service = (apiStore.environmentServices[apiStore.selectedEnvironmentId] ?? []).find((item) => item.id === debugServiceId.value);
  form.stepTargetName = environment?.name ?? '';
  form.stepTargetAddress = service?.serverAddress?.trim() || service?.baseUrl?.trim() || (service?.host && service.port ? `${service.host}:${service.port}` : '') || '';
});
/** 打开编辑时按步骤已保存的 target 还原环境/地址下拉 */
async function resolveStepTargetSelection(target?: { name: string; address: string }) {
  if (!projectId.value || !target?.address) return;
  const strip = (value: string) => value.trim().replace(/\/$/, '');
  const targetBase = strip(target.address);
  resolvingStepTarget.value = true;
  try {
    const preferred = apiStore.environments.find((item) => item.name === target.name);
    const ordered = preferred ? [preferred, ...apiStore.environments.filter((item) => item.id !== preferred.id)] : [...apiStore.environments];
    for (const environment of ordered) {
      await apiStore.refreshEnvironmentServices(projectId.value, environment.id);
      const service = (apiStore.environmentServices[environment.id] ?? []).find((item) => {
        const address = strip(item.serverAddress || item.baseUrl || (item.host && item.port ? `${item.host}:${item.port}` : ''));
        return address === targetBase || targetBase.startsWith(`${address}/`);
      });
      if (service) {
        apiStore.selectedEnvironmentId = environment.id;
        debugServiceId.value = service.id;
        return;
      }
    }
  } finally {
    resolvingStepTarget.value = false;
  }
}
/** 打开编辑时按步骤已保存的 target 还原环境/地址下拉；步骤无 target 时清空下拉，避免把调试栏默认选择误显示为步骤配置 */
function applyStepTargetToSelection(target?: { name: string; address: string }) {
  if (target?.address) {
    void resolveStepTargetSelection(target);
  } else {
    apiStore.selectedEnvironmentId = '';
    debugServiceId.value = '';
  }
}
const editorMainTab = ref<'basic' | 'steps'>('steps');
const stepDetailTab = ref<'request' | 'assertion' | 'variables'>('request');
const editorMainTabs = [
  { key: 'basic' as const, label: '基础信息' },
  { key: 'steps' as const, label: '步骤列表' },
];
const stepDetailTabs = [
  { key: 'request' as const, label: '请求报文' },
  { key: 'assertion' as const, label: '断言' },
  { key: 'variables' as const, label: '变量提取' },
];
const requestTab = ref<'params' | 'body' | 'headers'>('body');
const requestViewMode = ref<'template' | 'curl'>('template');
const requestConfigExpanded = ref(false);
const pageSizeOptions = caseForgePageSizeOptionLabels();

const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');
const selectedIds = computed(() => apiStore.selectedCaseIds);
const allVersions = ref<string[]>([]);
const allChannels = ref<{ id: string; name: string }[]>([]);
const currentChannelNames = computed(
  () => new Map(
    (apiStore.apiDoc?.generationProfile?.channels ?? []).map((channel) => [channel.id, channel.name]),
  ),
);

function displayCaseTitle(item: ApiTestCaseRow) {
  const title = item.title || '未命名案例';
  const channelId = item.metadata?.channelId;
  const currentName = channelId ? currentChannelNames.value.get(channelId) : undefined;
  return currentName ? title.replace(/^\[[^\]]+\]/, `[${currentName}]`) : title;
}
const showCaseWorkspace = computed(
  () =>
    apiStore.caseListTotal > 0 ||
    apiStore.cases.length > 0 ||
    allVersions.value.length > 0 ||
    allChannels.value.length > 0 ||
    apiStore.caseListVersionFilter != null ||
    apiStore.caseListChannelFilter != null,
);
const caseListEmptyHint = computed(() =>
  apiStore.caseListVersionFilter != null || apiStore.caseListChannelFilter != null
    ? '当前筛选条件下暂无案例'
    : '当前暂无案例',
);
const versionOptions = computed(() => {
  const list = [...allVersions.value].sort();
  const options: { value: string | null; label: string }[] = [
    { value: null, label: '全部版本' },
  ];
  for (const v of list) {
    options.push({ value: v, label: v });
  }
  return options;
});
const channelOptions = computed(() => [
  { value: null, label: '全部渠道' },
  ...allChannels.value.map((channel) => ({
    value: channel.id,
    label: channel.name,
  })),
]);

let loadVersionsReqId = 0;

async function loadAvailableVersions() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  const reqId = ++loadVersionsReqId;
  const rows = await listAllApiCases(pid, tid).catch(() => [] as ApiTestCaseRow[]);
  if (reqId !== loadVersionsReqId) return;
  if (pid !== projectId.value || tid !== transactionId.value) return;

  const versions = new Set<string>();
  const channels = new Map<string, string>();
  for (const row of rows) {
    const code = row.metadata?.versionCode;
    if (code != null) {
      versions.add(code);
    }
    const channelId = row.metadata?.channelId;
    if (channelId != null) {
      channels.set(
        channelId,
        currentChannelNames.value.get(channelId) || row.metadata?.channelName || channelId,
      );
    }
  }
  allVersions.value = Array.from(versions);
  allChannels.value = Array.from(channels, ([id, name]) => ({ id, name })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  if (
    apiStore.caseListChannelFilter != null &&
    !channels.has(apiStore.caseListChannelFilter)
  ) {
    apiStore.caseListChannelFilter = null;
  }

  const filter = apiStore.caseListVersionFilter;
  if (filter != null && !versions.has(filter)) {
    const latest = allVersions.value.length
      ? allVersions.value.sort()[allVersions.value.length - 1]
      : null;
    apiStore.caseListVersionFilter = latest;
    await apiStore.refreshCases(pid, tid, {
      resetPage: true,
      versionCode: latest ?? undefined,
    });
  }
}

onActivated(() => {
  void loadAvailableVersions();
  void ensureDebugEnvironments();
  void syncAssertionGenerateFromServer();
});

onDeactivated(() => {
  stopAssertionPoll();
});

async function ensureDebugEnvironments() {
  const pid = projectId.value;
  if (!pid) return;
  await apiStore.refreshEnvironments(pid);
}

function onVersionFilterChange(value: string | null) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  apiStore.caseListVersionFilter = value;
  void (async () => {
    await apiStore.refreshCases(pid, tid, {
      resetPage: true,
      versionCode: value ?? undefined,
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

function onChannelFilterChange(value: string | null) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  apiStore.caseListChannelFilter = value;
  void apiStore.refreshCases(pid, tid, {
    resetPage: true,
    channelId: value ?? undefined,
  });
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
const batchExpandedCaseIds = reactive(new Set<string>());
const batchSelectedSteps = reactive(new Set<string>());
function batchStepKey(caseId: string, stepId: string) { return `${caseId}|${stepId}`; }
function caseStepRows(row: ApiTestCaseRow): ApiCaseStep[] { return row.steps?.length ? row.steps : [{ id: row.id, name: row.title, request: row.request, expected: row.expected, exports: row.metadata?.exports ?? [] }]; }
function toggleBatchCaseExpand(caseId: string) { if (batchExpandedCaseIds.has(caseId)) batchExpandedCaseIds.delete(caseId); else batchExpandedCaseIds.add(caseId); }
function toggleBatchStep(caseId: string, stepId: string, checked: boolean) { if (checked) batchSelectedSteps.add(batchStepKey(caseId, stepId)); else batchSelectedSteps.delete(batchStepKey(caseId, stepId)); }
function onBatchStepChange(caseId: string, stepId: string, event: { target: { checked: boolean } }) { toggleBatchStep(caseId, stepId, event.target.checked); }
function selectAllSteps(row: ApiTestCaseRow) { for (const step of caseStepRows(row)) batchSelectedSteps.add(batchStepKey(row.id, step.id)); }
function clearCaseSteps(row: ApiTestCaseRow) { for (const step of caseStepRows(row)) batchSelectedSteps.delete(batchStepKey(row.id, step.id)); }
function selectAllBatchSteps() { for (const row of selectedRows.value) selectAllSteps(row); }
function clearAllBatchSteps() { batchSelectedSteps.clear(); }
function selectedStepCountForCase(row: ApiTestCaseRow) { return caseStepRows(row).filter((step) => batchSelectedSteps.has(batchStepKey(row.id, step.id))).length; }
function batchStepStatus(step: ApiCaseStep) { return step.target?.address ? { label: '配置完整', className: 'is-ready' } : { label: '缺少地址', className: 'is-failed' }; }
const batchConfigExpanded = ref(false);
const batchStepErrors = reactive<Record<string, string>>({});
function batchStepRunState(caseId: string, stepId: string) {
  const state = batchAssertionStatuses[batchStepKey(caseId, stepId)];
  if (state === 'running') return { label: '处理中', className: 'is-running' };
  if (state === 'success') return { label: '已生成', className: 'is-success' };
  if (state === 'failed') return { label: '失败', className: 'is-failed' };
  return null;
}
const batchConfigSummary = computed(() => {
  const parts: string[] = [];
  const env = apiStore.environments.find((item) => item.id === batchEnvironmentId.value);
  const service = (apiStore.environmentServices[batchEnvironmentId.value] ?? []).find((item) => item.id === batchEnvironmentServiceId.value);
  if (env) parts.push(`环境 ${env.name}`);
  if (service) parts.push(`地址 ${service.name}`);
  if (batchRequest.protocol) parts.push(batchRequest.protocol === 'socket' ? 'Socket' : `HTTP${batchRequest.method ? ` ${batchRequest.method}` : ''}`);
  if (batchRequest.encoding) parts.push(batchRequest.encoding);
  if (batchRequest.path?.trim()) parts.push(batchRequest.path.trim());
  return parts.length ? parts.join(' · ') : '未填写，默认不修改步骤配置';
});
function mainCaseStepIndex(
  row: Pick<ApiTestCaseRow, 'request' | 'title'>,
  steps: ApiCaseStep[],
) {
  const markedIndex = steps.findIndex((step) => step.isMainRequest);
  if (markedIndex >= 0) return markedIndex;
  const namedIndex = steps.findIndex((step) => step.name?.trim() === row.title?.trim());
  if (namedIndex >= 0) return namedIndex;
  const request = JSON.stringify(row.request);
  const index = steps.findIndex((step) => JSON.stringify(step.request) === request);
  return index >= 0 ? index : 0;
}
function markMainCaseStep(steps: ApiCaseStep[], index: number) {
  return steps.map((step, stepIndex) => {
    const clone = { ...step };
    delete clone.isMainRequest;
    return stepIndex === index ? { ...clone, isMainRequest: true } : clone;
  });
}
function caseSavePayload(row: ApiTestCaseRow, steps: ApiCaseStep[]) {
  const mainIndex = mainCaseStepIndex(row, steps);
  const normalizedSteps = markMainCaseStep(steps, mainIndex);
  const mainStep = normalizedSteps[mainIndex] ?? normalizedSteps.at(-1)!;
  return {
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
    request: mainStep.request,
    expected: mainStep.expected,
    exports: mainStep.exports,
    steps: normalizedSteps,
    debugEnvironmentId: row.metadata?.debugEnvironmentId,
    debugEnvironmentServiceId: row.metadata?.debugEnvironmentServiceId,
    debugEncoding: row.metadata?.debugEncoding,
    lastDebugRun: row.metadata?.lastDebugRun,
  };
}
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
  exports: [] as Array<{ rowId: string; name: string; source: 'body' | 'header' | 'status' | 'request'; expression: string; required: boolean }>,
  steps: [] as ApiCaseStep[],
  stepName: '',
  stepTargetName: '',
  stepTargetAddress: '',
});
const activeStepIndex = ref(0);
const expandedStepId = ref('');
const stepEditModalOpen = ref(false);
const stepEditSnapshot = ref<ApiCaseStep | null>(null);
function variableReference(name: string) { return `{{${name}}}`; }
const debugHistoryOpen = ref(false);
const debugHistory = ref<Awaited<ReturnType<typeof listStepDebugRecords>>>([]);
type DebugHistoryRow = Awaited<ReturnType<typeof listStepDebugRecords>>[number];
function debugRecordConnected(row: DebugHistoryRow) { return !row.record.error && row.record.statusCode > 0; }
function formatDebugTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; const pad = (part: number) => String(part).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
const debugRecordDetailOpen = ref(false);
const debugRecordDetail = ref<DebugHistoryRow | null>(null);
function openDebugRecordDetail(row: DebugHistoryRow) { debugRecordDetail.value = row; debugRecordDetailOpen.value = true; }
const CASE_CLIPBOARD_KEY = 'caseforge:api-case-clipboard';
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function currentStepFromForm(): ApiCaseStep {
  /* target 只取步骤编辑器中显式选择的环境/地址，新建步骤默认为空，保存时不再回退调试栏当前选择 */
  const targetName = form.stepTargetName.trim();
  const targetAddress = form.stepTargetAddress.trim();
  return {
    id: form.steps[activeStepIndex.value]?.id ?? randomUuid(),
    name: form.stepName.trim() || `步骤 ${activeStepIndex.value + 1}`,
    ...(form.steps[activeStepIndex.value]?.isMainRequest
      ? { isMainRequest: true }
      : {}),
    target: targetAddress ? { name: targetName, address: targetAddress } : undefined,
    request: buildDebugRequest(),
    expected: buildExpectedFromRows(form.assertionRows),
    exports: form.exports.filter((item) => item.name.trim()).map(({ name, source, expression, required }) => ({ name: name.trim(), source, expression: source === 'status' ? undefined : expression.trim(), required })),
    parallelWithPrevious: activeStepIndex.value > 0 ? form.steps[activeStepIndex.value]?.parallelWithPrevious : undefined,
  };
}

function storeActiveStep() { if (form.steps.length) form.steps[activeStepIndex.value] = currentStepFromForm(); }
function loadStep(step: ApiCaseStep) {
  form.stepName = step.name;
  form.stepTargetName = step.target?.name ?? '';
  form.stepTargetAddress = step.target?.address ?? '';
  applyRequestToForm(step.request);
  form.assertionRows = assertionsToRows(step.expected?.assertions);
  form.exports = step.exports.map((item) => ({ rowId: randomUuid(), name: item.name, source: item.source, expression: item.expression ?? '', required: item.required ?? false }));
}
function selectStep(index: number) { storeActiveStep(); activeStepIndex.value = index; loadStep(form.steps[index]); if (stepEditModalOpen.value) applyStepTargetToSelection(form.steps[index].target); }
function toggleStep(index: number) { if (form.steps[index].id === expandedStepId.value) { storeActiveStep(); expandedStepId.value = ''; return; } selectStep(index); expandedStepId.value = form.steps[index].id; }
function openStepEditor(index: number) {
  storeActiveStep();
  activeStepIndex.value = index;
  stepEditSnapshot.value = cloneJson(form.steps[index]);
  loadStep(form.steps[index]);
  expandedStepId.value = form.steps[index].id;
  stepEditModalOpen.value = true;
  applyStepTargetToSelection(form.steps[index].target);
}
function cancelStepEditor() {
  if (stepEditSnapshot.value) {
    form.steps[activeStepIndex.value] = cloneJson(stepEditSnapshot.value);
    loadStep(form.steps[activeStepIndex.value]);
  }
  stepEditSnapshot.value = null;
  stepEditModalOpen.value = false;
  expandedStepId.value = '';
}
function confirmStepEditor() {
  storeActiveStep();
  stepEditSnapshot.value = null;
  stepEditModalOpen.value = false;
  expandedStepId.value = '';
}
function createBlankStep(name: string): ApiCaseStep {
  return { id: randomUuid(), name, request: { method: 'POST', path: '/' }, expected: {}, exports: [] };
}
function addStep() { storeActiveStep(); const step = createBlankStep(`步骤 ${form.steps.length + 1}`); form.steps.push(step); activeStepIndex.value = form.steps.length - 1; expandedStepId.value = ''; loadStep(step); }

function addStepAfter(index: number) {
  storeActiveStep();
  const step = createBlankStep(`步骤 ${form.steps.length + 1}`);
  form.steps.splice(index + 1, 0, step);
  activeStepIndex.value = index + 1;
  expandedStepId.value = '';
  loadStep(step);
}
function moveStep(index: number, offset: number) {
  storeActiveStep();
  const activeId = form.steps[activeStepIndex.value].id;
  const next = index + offset;
  [form.steps[index], form.steps[next]] = [form.steps[next], form.steps[index]];
  form.steps[0].parallelWithPrevious = undefined;
  activeStepIndex.value = form.steps.findIndex((step) => step.id === activeId);
}
function removeStep(index: number) { if (form.steps.length === 1) return; const removedId = form.steps[index].id; form.steps.splice(index, 1); form.steps[0].parallelWithPrevious = undefined; activeStepIndex.value = Math.min(index, form.steps.length - 1); if (expandedStepId.value === removedId) expandedStepId.value = ''; loadStep(form.steps[activeStepIndex.value]); }
function copyActiveStep() { storeActiveStep(); copyStepToClipboard(form.steps[activeStepIndex.value]); message.success('步骤已复制'); }
function pasteStep() { const step = readStepFromClipboard(); if (!step) return message.warning('没有可粘贴的步骤'); storeActiveStep(); form.steps.push({ ...cloneJson(step), id: randomUuid(), parallelWithPrevious: undefined }); activeStepIndex.value = form.steps.length - 1; expandedStepId.value = ''; loadStep(form.steps[activeStepIndex.value]); message.success('步骤已粘贴'); }
async function openDebugHistory() { if (!projectId.value || !apiStore.activeCaseId) return; debugHistory.value = await listStepDebugRecords(projectId.value, apiStore.activeCaseId, form.steps[activeStepIndex.value].id); debugHistoryOpen.value = true; }
async function clearDebugHistory() { if (!projectId.value || !apiStore.activeCaseId) return; await clearStepDebugRecords(projectId.value, apiStore.activeCaseId, form.steps[activeStepIndex.value].id); debugHistory.value = []; }

const sharedVariableInsertOpen = ref(false);
const sharedVariableName = ref('');
const exportSourceOptions = [
  { label: '响应体', value: 'body' },
  { label: '请求体', value: 'request' },
  { label: '响应头', value: 'header' },
  { label: '状态码', value: 'status' },
];
const sharedVariableOptions = computed(() => {
  const variables = new Map<string, { label: string; disabled?: boolean }>();
  let groupStart = activeStepIndex.value;
  while (groupStart > 0 && form.steps[groupStart]?.parallelWithPrevious) groupStart -= 1;
  form.steps.slice(0, activeStepIndex.value).forEach((step, index) => {
    for (const item of step.exports ?? []) {
      const name = (item.name ?? '').trim();
      if (!name || variables.has(name)) continue;
      const unavailable = index >= groupStart;
      variables.set(name, { label: `本案例 步骤 ${index + 1} · ${name}${unavailable ? '（并发不可用）' : ''}`, disabled: unavailable });
    }
  });
  const currentCaseNo = form.caseNo.trim();
  for (const row of apiStore.cases) {
    if (row.id === apiStore.activeCaseId) continue;
    if (currentCaseNo && JSON.stringify(row.request).includes(`\${${currentCaseNo}.`)) continue;
    for (const item of row.metadata?.exports ?? []) {
      if (!item.name.trim()) continue;
      const value = `${row.caseNo || row.id}.${item.name.trim()}`;
      variables.set(value, { label: `${row.caseNo || row.title} · ${item.name.trim()}` });
    }
  }
  return [...variables].map(([value, option]) => ({ ...option, value }));
});
const hasAvailableSharedVariable = computed(() => sharedVariableOptions.value.some((option) => !option.disabled));

function parallelGroupNumber(index: number) {
  let group = 0;
  for (let start = 0; start < form.steps.length;) {
    let end = start + 1;
    while (end < form.steps.length && form.steps[end].parallelWithPrevious) end += 1;
    if (end - start > 1) group += 1;
    if (index >= start && index < end) return end - start > 1 ? group : undefined;
    start = end;
  }
}
const debugExportOpen = ref(false);
const debugExportPath = ref('');
const debugExportName = ref('');
const debugExportSource = ref<'body' | 'request'>('body');
const debugExportSourceOptions = [
  { label: '响应体', value: 'body' },
  { label: '请求体', value: 'request' },
];
const debugResponseBody = computed(() => parseDebugResponseBody(debugResult.value?.body));
const debugRequestBody = computed(() => parseDebugResponseBody(debugResult.value?.requestBody));
const debugResponsePathOptions = computed(() => responsePaths(debugResponseBody.value).map((value) => ({ label: value, value })));
const debugRequestPathOptions = computed(() => responsePaths(debugRequestBody.value).map((value) => ({ label: value, value })));
const debugExportPathOptions = computed(() => (debugExportSource.value === 'request' ? debugRequestPathOptions.value : debugResponsePathOptions.value));

function addExportRow() {
  form.exports.push({ rowId: randomUuid(), name: '', source: 'body', expression: '', required: true });
}

async function addExportFromDebug() {
  await onDebugRun(false);
  if (!debugResult.value) return;
  if (debugResult.value.error && !debugRequestPathOptions.value.length) return message.warning(`调试请求失败：${debugResult.value.error}`);
  if (!debugResponsePathOptions.value.length && !debugRequestPathOptions.value.length) return message.warning('请求/响应体中没有识别到 JSON 或 XML 字段');
  debugExportSource.value = debugResponsePathOptions.value.length ? 'body' : 'request';
  syncDebugExportSelection();
  debugExportOpen.value = true;
}

function syncDebugExportSelection() {
  debugExportPath.value = debugExportPathOptions.value[0]?.value ?? '';
  const pathParts = debugExportPath.value.split(/[./\[\]]/).filter((item) => item && item !== 'text()');
  debugExportName.value = pathParts[pathParts.length - 1] ?? '';
}

function onDebugExportSourceChange() { syncDebugExportSelection(); }

function confirmDebugExport() {
  if (!debugExportPath.value || !debugExportName.value.trim()) return message.warning('请选择字段并填写变量名');
  if (form.exports.some((item) => item.name.trim() === debugExportName.value.trim())) return message.warning('同一案例内共享变量名不能重复');
  form.exports.push({ rowId: randomUuid(), name: debugExportName.value.trim(), source: debugExportSource.value, expression: debugExportPath.value, required: true });
  debugExportOpen.value = false;
}

function openSharedVariableInsert() {
  sharedVariableName.value = sharedVariableOptions.value.find((option) => !option.disabled)?.value ?? '';
  sharedVariableInsertOpen.value = true;
}

function insertSharedVariable() {
  if (!sharedVariableName.value) return message.warning('请选择变量');
  const body = currentBodyText();
  const expression = `\${${sharedVariableName.value}}`;
  setCurrentBodyText(`${body.slice(0, bodyFunctionCursor.start)}${expression}${body.slice(bodyFunctionCursor.end)}`);
  sharedVariableInsertOpen.value = false;
}

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
    { key: 'body' as const, label: 'Body', count: 1 },
    { key: 'headers' as const, label: 'Headers', count: countFilledRows(form.headerRows) },
  ];
});

const canBeautifyBody = computed(
  () =>
    httpMethodHasBody(form.httpMethod) || form.protocol !== 'http',
);

const bodyExpandModalTitle = computed(() => {
  const label =
    bodyFormatOptions.find((item) => item.value === form.bodyFormat)?.label ??
    'Body';
  return `编辑请求 Body（${label}）`;
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
    if (syncingForm.value || resolvingStepTarget.value) return;
    debugServiceId.value = '';
    syncDebugServiceSelection();
  },
);

watch(
  () => form.protocol,
  () => {
    requestViewMode.value = 'template';
    requestTab.value = form.protocol === 'http' && !httpMethodHasBody(form.httpMethod) ? 'params' : 'body';
    syncDebugServiceSelection();
  },
);

watch(debugEncoding, (encoding) => {
  if (form.protocol === 'socket') form.socketEncoding = encoding;
});

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
  hasBodyCursor.value = false;
  const sameCase = loadedCaseId.value === row.id;
  syncingForm.value = true;
  if (!sameCase) {
    editorMainTab.value = 'steps';
    stepDetailTab.value = row.metadata?.lastDebugRun ? 'assertion' : 'request';
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
  const loadedSteps = cloneJson(row.steps?.length ? row.steps : [{ id: row.id, name: row.title, request: row.request, expected: row.expected, exports: row.metadata?.exports ?? [] }]);
  if (!loadedSteps.length) loadedSteps.push({ id: row.id, name: row.title, request: row.request, expected: row.expected, exports: row.metadata?.exports ?? [] });
  const mainIndex = mainCaseStepIndex(row, loadedSteps);
  form.steps = markMainCaseStep(loadedSteps, mainIndex);
  activeStepIndex.value = mainIndex;
  expandedStepId.value = '';
  loadStep(form.steps[activeStepIndex.value]);
  /* legacy fields remain populated by loadStep for existing editor controls */
  form.exports = (form.steps[activeStepIndex.value].exports ?? []).map((item) => ({
    rowId: randomUuid(),
    name: item.name,
    source: item.source,
    expression: item.expression ?? '',
    required: item.required ?? false,
  }));
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
  batchSelectedSteps.clear();
  batchExpandedCaseIds.clear();
  if (batchMode.value) {
    apiStore.selectedCaseIds = [];
    isNewCase.value = false;
    return;
  }
  if (batchCasesStale.value) {
    batchCasesStale.value = false;
    syncFormFromActiveCase();
  }
  if (apiStore.activeCaseId) {
    apiStore.selectedCaseIds = [apiStore.activeCaseId];
  }
}

async function onBatchSaveRequest() {
  if (!projectId.value || !transactionId.value || !batchSelectedSteps.size) return;
  batchSaving.value = true;
  try {
    const allCases = await listAllApiCases(projectId.value, transactionId.value);
    const environment = apiStore.environments.find((item) => item.id === batchEnvironmentId.value);
    const service = (apiStore.environmentServices[batchEnvironmentId.value] ?? []).find((item) => item.id === batchEnvironmentServiceId.value);
    const serviceAddress = service?.serverAddress?.trim() || service?.baseUrl?.trim() || (service?.host && service.port ? `${service.host}:${service.port}` : '');
    let updated = 0;
    for (const row of allCases) {
      const steps = caseStepRows(row);
      if (!steps.some((step) => batchSelectedSteps.has(batchStepKey(row.id, step.id)))) continue;
      const nextSteps = steps.map((step) => {
        if (!batchSelectedSteps.has(batchStepKey(row.id, step.id))) return step;
        const next = cloneJson(step);
        if (batchRequest.protocol) next.request.transport = batchRequest.protocol === 'socket' ? 'tcp' : 'http';
        if (batchRequest.method) next.request.method = batchRequest.method;
        if (batchRequest.path?.trim()) next.request.path = batchRequest.path.trim();
        if (batchRequest.encoding) next.request.encoding = batchRequest.encoding;
        if (serviceAddress) next.target = { name: environment?.name || next.target?.name || '', address: serviceAddress };
        updated += 1;
        return next;
      });
      await apiStore.saveCase(projectId.value, transactionId.value, caseSavePayload(row, nextSteps), row.id, { silent: true });
    }
    message.success(`已更新 ${updated} 个步骤`);
    await apiStore.refreshCases(projectId.value, transactionId.value);
    batchCasesStale.value = true;
  } finally {
    batchSaving.value = false;
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
    const row = caseLookup.value.get(caseId);
    if (checked) {
      if (row) batchExpandedCaseIds.add(caseId);
    } else {
      if (row) clearCaseSteps(row);
      batchExpandedCaseIds.delete(caseId);
    }
    return;
  }
  selectCase(caseId);
}

async function copyCase(caseId: string) {
  if (apiStore.activeCaseId !== caseId || isNewCase.value) {
    selectCase(caseId);
    await nextTick();
  }
  await onCopy();
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
  form.exports = [];
  debugResult.value = null;
  debugResponseTab.value = 'expected';
  debugEncoding.value = inferDebugEncoding();
  syncingForm.value = false;
}

function buildSavePayload(): Record<string, unknown> | null {
  if (!form.title.trim()) return null;
  const exportNames = form.exports.map((item) => item.name.trim()).filter(Boolean);
  if (new Set(exportNames).size !== exportNames.length) {
    message.warning('同一案例内共享变量名不能重复');
    return null;
  }
  storeActiveStep();
  const fallbackRequest = form.steps.at(-1)?.request ?? mergeRequestFromEditor({
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
  const mainStep = form.steps.find((step) => step.isMainRequest) ?? form.steps.at(-1);
  const request = mainStep?.request ?? fallbackRequest;
  const expected = mainStep?.expected ?? buildExpectedFromRows(form.assertionRows);
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
    steps: cloneJson(markMainCaseStep(form.steps, mainStep ? form.steps.indexOf(mainStep) : 0)),
    request,
    expected,
    exports: mainStep?.exports ?? [],
      debugEnvironmentId: apiStore.selectedEnvironmentId || undefined,
      debugEnvironmentServiceId: debugServiceId.value || undefined,
      debugEncoding: debugEncoding.value || undefined,
    };
  if (isNewCase.value && apiStore.caseListVersionFilter != null) {
    payload.versionCode = apiStore.caseListVersionFilter;
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

async function onCopy() {
  const payload = buildSavePayload();
  if (!payload) return message.warning('请填写案例名称');
  const { title, description, remark, owner, polarity, status, enabled, steps } = payload;
  localStorage.setItem(CASE_CLIPBOARD_KEY, JSON.stringify({ title, description, remark, owner, polarity, status, enabled, steps }));
  message.success('案例已复制，可在任意交易粘贴');
}

async function pasteCase() {
  if (!projectId.value || !transactionId.value) return;
  try {
    const copied = JSON.parse(localStorage.getItem(CASE_CLIPBOARD_KEY) || '') as Record<string, unknown>;
    const endpoint = apiStore.apiDoc?.endpoints?.[0];
    if (!endpoint) return message.warning('当前交易没有可承载案例的接口端点');
    const copiedSteps = copied.steps as ApiCaseStep[];
    const stepsWithIds = copiedSteps.map((step) => ({ ...cloneJson(step), id: randomUuid() }));
    const mainIndex = mainCaseStepIndex(
      { title: String(copied.title || ''), request: stepsWithIds.at(-1)!.request },
      stepsWithIds,
    );
    const steps = markMainCaseStep(stepsWithIds, mainIndex);
    const mainStep = steps[mainIndex];
    await apiStore.saveCase(projectId.value, transactionId.value, {
      ...copied,
      endpointId: endpoint.id,
      title: `${String(copied.title || '未命名案例')} 副本`,
      transactionCode: apiStore.activeTransaction?.code,
      request: mainStep.request,
      expected: mainStep.expected,
      exports: mainStep.exports,
      steps,
    });
    message.success('案例已粘贴');
  } catch { message.warning('没有可粘贴的案例'); }
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

const VARIABLE_REFERENCE_PATTERN = /\$\{\s*([a-zA-Z_][\w.-]*)\s*\}|\{\{?\s*([a-zA-Z_][\w.-]*)\s*\}?\}/g;
function referencedVariableKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const match of text.matchAll(VARIABLE_REFERENCE_PATTERN)) keys.add(match[1] ?? match[2]);
  return keys;
}

/**
 * 收集调试前需要先执行的前置步骤：当前报文引用的共享变量由哪些前置步骤产出（含传递依赖）。
 * 与共享变量插入选项一致：同并发组内的步骤互相不可见变量，不纳入前置。
 */
function collectDebugPrerequisiteSteps(steps: ApiCaseStep[], targetIndex: number, targetRequest: ApiCaseRequest): ApiCaseStep[] {
  let boundary = targetIndex;
  while (boundary > 0 && steps[boundary]?.parallelWithPrevious) boundary -= 1;
  const candidates = steps.slice(0, boundary);
  if (!candidates.length) return [];
  const needed = referencedVariableKeys(targetRequest);
  const included = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of candidates) {
      if (included.has(step.id)) continue;
      if (!(step.exports ?? []).some((item) => needed.has((item.name ?? '').trim()))) continue;
      included.add(step.id);
      for (const key of referencedVariableKeys(step.request)) needed.add(key);
      changed = true;
    }
  }
  return candidates.filter((step) => included.has(step.id));
}

async function onDebugRun(showResult = true) {
  if (!projectId.value || !transactionId.value) return;
  if (!form.stepTargetAddress.trim()) {
    message.warning('请填写步骤环境地址');
    return;
  }
  const caseKey = activeCaseKey();
  const caseIdAtStart = isNewCase.value ? undefined : apiStore.activeCaseId || undefined;
  debugRunningCaseKey.value = caseKey;
  debugResult.value = null;
  debugResponseTab.value = 'expected';
  const request = buildDebugRequest();
  try {
    const result = await debugRunCase(
      projectId.value,
      transactionId.value,
      {
        request,
        expected: buildExpectedFromRows(form.assertionRows),
        polarity: form.polarity,
        environmentId: apiStore.selectedEnvironmentId || undefined,
        target: form.stepTargetAddress.trim() ? { name: form.stepTargetName.trim(), address: form.stepTargetAddress.trim() } : undefined,
        stepId: form.steps[activeStepIndex.value]?.id,
        environmentServiceId: debugServiceId.value || apiStore.selectedEnvironmentServiceId || undefined,
        encoding: debugEncoding.value,
        caseId: caseIdAtStart,
        prerequisiteSteps: collectDebugPrerequisiteSteps(form.steps, activeStepIndex.value, request),
      },
    );
    if (!isStillOnCase(caseKey)) return;
    debugResult.value = result;
    debugResultModalOpen.value = showResult;
  } catch (error) {
    if (isStillOnCase(caseKey)) {
      debugResult.value = {
        statusCode: 0,
        headers: {},
        body: null,
        bodySize: 0,
        durationMs: 0,
        error: error instanceof Error ? error.message : '调试执行失败，请检查环境配置和请求报文',
        assertions: [],
      };
      debugResultModalOpen.value = showResult;
    }
  } finally {
    releaseCaseTask(debugRunningCaseKey, caseKey);
  }
}

async function onGenerateAssertions() {
  if (!projectId.value || !transactionId.value) return;
  if (!form.stepTargetAddress.trim()) {
    message.warning('请填写步骤环境地址');
    return;
  }
  const caseKey = activeCaseKey();
  const caseIdAtStart = isNewCase.value ? undefined : apiStore.activeCaseId || undefined;

  assertionGenerateError.value = '';
  debugRunningCaseKey.value = caseKey;
  const request = buildDebugRequest();
  try {
    const result = await debugRunCase(projectId.value, transactionId.value, {
      request,
      expected: buildExpectedFromRows(form.assertionRows),
      polarity: form.polarity,
      environmentId: apiStore.selectedEnvironmentId || undefined,
      target: { name: form.stepTargetName.trim(), address: form.stepTargetAddress.trim() },
      stepId: form.steps[activeStepIndex.value]?.id,
      environmentServiceId: debugServiceId.value || undefined,
      encoding: debugEncoding.value,
      caseId: caseIdAtStart,
      prerequisiteSteps: collectDebugPrerequisiteSteps(form.steps, activeStepIndex.value, request),
    });
    const responseIssue = getDebugResponseIssue(result);
    if (responseIssue) throw new Error(result.error || responseIssue);
    debugResult.value = result;
    releaseCaseTask(debugRunningCaseKey, caseKey);

    if (form.assertionRows.some((row) => Boolean(row.type && row.operator))) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '响应获取成功，覆盖已有断言？',
          content: 'AI 生成的断言将整段替换当前断言。',
          okText: '生成并替换',
          cancelText: '保留原断言',
          centered: true,
          closable: true,
          maskClosable: true,
          zIndex: NESTED_OVERLAY_Z_INDEX + 10,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }

    generatingAssertionsCaseKey.value = caseKey;
    const transport = form.protocol === 'socket' ? 'tcp' : 'http';
    const messageFormat = form.bodyFormat === 'xml' ? 'xml' : form.bodyFormat === 'text' ? 'text' : 'json';
    const job = await generateAssertions(
      projectId.value,
      transactionId.value,
      {
        caseId: caseIdAtStart,
        transport,
        messageFormat,
        polarity: form.polarity,
        statusCode: result.statusCode,
        headers: result.headers,
        body: result.body,
      },
    );
    startAssertionPoll(job.jobId, caseKey, caseIdAtStart);
  } catch (error) {
    assertionGenerateError.value = `请求未成功，未调用 AI：${error instanceof Error ? error.message : '请检查请求配置'}`;
    if (isStillOnCase(caseKey)) {
      message.error(assertionGenerateError.value);
    }
    releaseCaseTask(debugRunningCaseKey, caseKey);
    releaseCaseTask(generatingAssertionsCaseKey, caseKey);
  }
}

async function waitForAssertionResult(caseId: string, jobId: string) {
  while (true) {
    const status = await getAssertionGenerateStatus(projectId.value, transactionId.value, caseId, jobId);
    if (status.phase === 'completed') {
      return getAssertionGenerateResult(projectId.value, transactionId.value, caseId, jobId);
    }
    if (status.phase === 'failed' || status.phase === 'cancelled') {
      throw new Error(status.errorMessage || 'AI 生成断言失败');
    }
    await new Promise((resolve) => setTimeout(resolve, ASSERTION_POLL_INTERVAL_MS));
  }
}

async function onBatchGenerateAssertions() {
  if (!projectId.value || !transactionId.value || !batchSelectedSteps.size) return;
  const fallbackEnv = apiStore.environments.find((item) => item.id === batchEnvironmentId.value);
  const fallbackService = (apiStore.environmentServices[batchEnvironmentId.value] ?? []).find((item) => item.id === batchEnvironmentServiceId.value);
  const fallbackAddress = fallbackService?.serverAddress?.trim() || fallbackService?.baseUrl?.trim() || (fallbackService?.host && fallbackService.port ? `${fallbackService.host}:${fallbackService.port}` : '');
  const fallbackTarget = fallbackAddress ? { name: fallbackEnv?.name ?? '', address: fallbackAddress } : null;
  const allCases = await listAllApiCases(projectId.value, transactionId.value);
  const selectedSteps = allCases.flatMap((row) => caseStepRows(row).filter((step) => batchSelectedSteps.has(batchStepKey(row.id, step.id))));
  if (!selectedSteps.length) return;
  if (!fallbackTarget && selectedSteps.every((step) => !step.target?.address)) {
    message.warning('所选步骤都没有执行地址，请先给步骤配置地址，或在批量设置中选择执行环境');
    return;
  }
  batchAssertionRunning.value = true;
  Object.keys(batchAssertionStatuses).forEach((key) => delete batchAssertionStatuses[key]);
  Object.keys(batchStepErrors).forEach((key) => delete batchStepErrors[key]);
  Object.assign(batchAssertionProgress, { done: 0, total: batchSelectedSteps.size, success: 0, failed: 0 });
  try {
    for (const row of allCases) {
      const steps = caseStepRows(row);
      if (!steps.some((step) => batchSelectedSteps.has(batchStepKey(row.id, step.id)))) continue;
      const nextSteps = cloneJson(steps);
      let changed = false;
      for (let stepIndex = 0; stepIndex < nextSteps.length; stepIndex += 1) {
        const step = nextSteps[stepIndex];
        const stepKey = batchStepKey(row.id, step.id);
        if (!batchSelectedSteps.has(stepKey)) continue;
        batchAssertionStatuses[stepKey] = 'running';
        try {
          const target = step.target?.address ? step.target : fallbackTarget;
          if (!target) throw new Error('缺少地址');
          const result = await debugRunCase(projectId.value, transactionId.value, {
            request: step.request,
            expected: step.expected,
            polarity: row.polarity,
            target,
            encoding: row.metadata?.debugEncoding || 'UTF-8',
            prerequisiteSteps: collectDebugPrerequisiteSteps(nextSteps, stepIndex, step.request),
          });
          const responseIssue = getDebugResponseIssue(result);
          if (responseIssue) throw new Error(result.error || responseIssue);
          const bodyText = typeof step.request.body === 'string' ? step.request.body.trim() : '';
          const job = await generateAssertions(projectId.value, transactionId.value, {
            transport: step.request.transport || 'http',
            messageFormat: step.request.contentType?.includes('xml') || bodyText.startsWith('<') ? 'xml' : 'json',
            polarity: row.polarity,
            statusCode: result.statusCode,
            headers: result.headers,
            body: result.body,
          });
          const { assertions } = await waitForAssertionResult(row.id, job.jobId);
          if (!assertions.length) throw new Error('AI 未生成有效断言');
          step.expected = buildExpectedFromRows(assertionsToRows(assertions));
          changed = true;
          batchAssertionStatuses[stepKey] = 'success';
          batchAssertionProgress.success += 1;
        } catch (error) {
          batchAssertionStatuses[stepKey] = 'failed';
          batchStepErrors[stepKey] = error instanceof Error ? error.message : '生成失败';
          batchAssertionProgress.failed += 1;
        } finally {
          batchAssertionProgress.done += 1;
        }
      }
      if (changed) await apiStore.saveCase(projectId.value, transactionId.value, caseSavePayload(row, nextSteps), row.id, { silent: true });
    }
    message.success(`批量生成完成：成功 ${batchAssertionProgress.success}，失败 ${batchAssertionProgress.failed}`);
    await apiStore.refreshCases(projectId.value, transactionId.value);
    batchCasesStale.value = true;
  } finally {
    batchAssertionRunning.value = false;
  }
}

function startAssertionPoll(jobId: string, caseKey: string, caseId?: string) {
  assertionPollTarget = { jobId, caseKey, caseId };
  if (assertionPollTimer) return;
  void syncAssertionPoll();
  assertionPollTimer = setInterval(() => {
    void syncAssertionPoll();
  }, ASSERTION_POLL_INTERVAL_MS);
}

function stopAssertionPoll() {
  if (assertionPollTimer) {
    clearInterval(assertionPollTimer);
    assertionPollTimer = null;
  }
  assertionPollTarget = null;
}

async function syncAssertionPoll() {
  const target = assertionPollTarget;
  if (!target) {
    stopAssertionPoll();
    return;
  }
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  try {
    const status = await getAssertionGenerateStatus(pid, tid, target.caseId, target.jobId);
    if (status.phase === 'queued' || status.phase === 'running') return;
    stopAssertionPoll();
    await applyAssertionResult(target, status.phase, status.errorMessage);
  } catch {
    // 状态查询失败不打断轮询
  }
}

async function applyAssertionResult(
  target: AssertionPollTarget,
  phase: string,
  errorMessage?: string,
) {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;

  if (phase === 'completed') {
    try {
      const { assertions } = await getAssertionGenerateResult(
        pid,
        tid,
        target.caseId,
        target.jobId,
      );
      if (!assertions.length) {
        if (isStillOnCase(target.caseKey)) {
          message.warning('AI 未生成有效断言，请手动编辑');
        }
        releaseCaseTask(generatingAssertionsCaseKey, target.caseKey);
        return;
      }
      if (!isStillOnCase(target.caseKey)) {
        if (target.caseId) {
          const row = apiStore.cases.find((item) => item.id === target.caseId);
          if (row) {
            const expected = buildExpectedFromRows(assertionsToRows(assertions));
            await apiStore.saveCase(
              pid,
              tid,
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
              target.caseId,
              { silent: true },
            );
            message.success(`案例「${row.title || row.caseNo || '未命名'}」的断言已生成`);
          }
        }
        releaseCaseTask(generatingAssertionsCaseKey, target.caseKey);
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
      if (isStillOnCase(target.caseKey)) {
        message.error('获取断言生成结果失败，请稍后重试');
      }
    }
  } else if (phase === 'failed' || phase === 'cancelled') {
    if (isStillOnCase(target.caseKey)) {
      message.error(errorMessage?.trim() || 'AI 生成断言失败，请稍后重试');
    }
  }
  releaseCaseTask(generatingAssertionsCaseKey, target.caseKey);
}

async function syncAssertionGenerateFromServer() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  try {
    const caseId = isNewCase.value ? undefined : apiStore.activeCaseId || undefined;
    const status = await getAssertionGenerateStatus(pid, tid, caseId);
    if (status.phase === 'queued' || status.phase === 'running') {
      const caseKey = activeCaseKey();
      generatingAssertionsCaseKey.value = caseKey;
      startAssertionPoll(status.jobId, caseKey, caseId);
    } else {
      generatingAssertionsCaseKey.value = null;
    }
  } catch {
    generatingAssertionsCaseKey.value = null;
  }
}

function onDelete() {
  if (!projectId.value || !transactionId.value || !apiStore.activeCaseId) return;
  const row = activeCase.value;
  const label = row?.title || row?.caseNo || '该案例';
  Modal.confirm({
    title: '删除案例？',
    content: `确定删除「${label}」？删除后不可恢复，执行列表中的关联也会一并移除。`,
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
    content: '删除后不可恢复，执行列表中的关联也会一并移除。',
    centered: true,
    okType: 'danger',
    okText: '删除',
    cancelText: '取消',
    onOk: async () => {
      await apiStore.removeCases(projectId.value!, transactionId.value!, [...selectedIds.value]);
      batchCasesStale.value = true;
    },
  });
}
</script>

<style scoped>
.function-option-name { font-weight: 500; }
.function-option-desc { margin-left: 8px; overflow: hidden; color: var(--cf-text-muted, #98a2b3); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.function-description-hint { margin: -8px 0 12px; color: var(--cf-text-secondary, #667085); font-size: 12px; }
.function-argument-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-height: 300px; margin-bottom: 16px; padding-right: 4px; overflow-y: auto; }
.function-argument-row { display: grid; gap: 5px; min-width: 0; }
.function-argument-row > span { overflow: hidden; color: var(--cf-text-secondary, #667085); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.function-expression-preview { display: grid; gap: 5px; padding: 10px 12px; border-radius: 6px; background: var(--cf-surface-soft, #f8f9fb); }
.function-expression-preview > span { color: var(--cf-text-muted, #98a2b3); font-size: 11px; }
.function-expression-preview code { overflow-wrap: anywhere; }
@media (max-width: 640px) { .function-argument-list { grid-template-columns: 1fr; } }
.api-case-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.api-case-panel .instruction-editor-body {
  /* 页面级滚动兜底：编辑区内容超过视口时，底部操作栏仍可到达。 */
  overflow-x: hidden;
  overflow-y: auto;
  gap: 8px;
  padding: 12px 16px 8px;
}

.api-case-panel .editor-hero {
  flex-shrink: 0;
  padding: 10px 14px;
}

.api-case-panel .instruction-editor-body > .case-payload-block {
  flex: 0 0 auto;
  min-height: 0;
  width: 100%;
}

/* 滚动容器内的块级内容禁止压缩，超出高度时出滚动条，避免批量面板展开内容被裁剪 */
.api-case-panel .instruction-editor-body > .editor-block {
  flex-shrink: 0;
  width: 100%;
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
  grid-template-columns: minmax(0, 1fr) auto auto;
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
  grid-template-columns: minmax(0, 1fr) 140px 132px 72px;
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

.batch-case-summary-no {
  justify-self: end;
  text-align: right;
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.batch-case-summary-status {
  justify-self: end;
  font-size: 12px;
  white-space: nowrap;
}

.batch-case-summary-status.is-ready,
.batch-case-summary-status.is-success { color: #039855; }
.batch-case-summary-status.is-running { color: #175cd3; }
.batch-case-summary-status.is-warning { color: #b54708; }
.batch-case-summary-status.is-failed { color: #d92d20; }

.batch-config-block { padding: 0; overflow: hidden; }
.batch-config-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}
.batch-config-head:hover { background: #fcfcfd; }
.batch-config-head strong { color: #344054; font-size: 13px; white-space: nowrap; }
.batch-config-summary {
  min-width: 0;
  overflow: hidden;
  color: #98a2b3;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-config-body {
  padding: 4px 12px 12px;
  border-top: 1px solid #f2f4f7;
}
.batch-case-summary-list .batch-case-block:last-child { margin-bottom: 0; }
.batch-case-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
}
.batch-case-head:hover { background: #fcfcfd; }
.batch-case-step-count { margin-left: auto; color: #98a2b3; font-size: 12px; white-space: nowrap; }
.batch-case-head-actions { display: flex; gap: 2px; margin-left: 4px; }
.batch-case-head-actions .ant-btn { height: auto; padding: 0 4px; font-size: 12px; }
.batch-step-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px 8px;
  border-top: 1px solid #f2f4f7;
  background: #fafbfc;
}
.batch-step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
}
.batch-step-item:hover { background: #f2f4f7; }
.batch-step-name {
  flex: 0 1 260px;
  min-width: 0;
  overflow: hidden;
  color: #344054;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-step-env {
  flex: 0 1 120px;
  min-width: 0;
  overflow: hidden;
  color: #606875;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-step-address {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #7a8290;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 紧凑布局覆盖 */
.batch-case-summary-head { margin-bottom: 12px; }
.batch-case-summary-head .editor-block-title { margin-bottom: 0; }
.batch-case-summary-list .batch-case-block { margin-bottom: 6px; }
.batch-case-head { padding: 6px 10px; }
.batch-step-item { padding: 3px 6px; }

.batch-assertion-progress {
  margin-right: auto;
  color: #667085;
  font-size: 12px;
}

.batch-case-summary-more {
  color: #667085;
  font-size: 12px;
}

.batch-request-config {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.batch-request-config--request {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.batch-request-path {
  grid-column: 1 / -1;
}

.batch-request-url {
  margin-top: 12px;
  color: #667085;
  font-size: 13px;
}

.batch-request-url span {
  color: #344054;
  word-break: break-all;
}

@media (max-width: 720px) {
  .batch-request-config {
    grid-template-columns: 1fr;
  }
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

.case-card-copy-button {
  color: #667085;
}

.case-card-copy-button:hover {
  color: #b42318;
  background: #fff1f0;
}

.case-list-filter-bar {
  margin-bottom: 12px;
}

.case-version-filter {
  width: auto;
}

.case-channel-filter {
  width: auto;
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
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
}

.case-payload-block > .case-editor-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
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
  overflow: visible;
}

.case-request-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid #f2f4f7;
  border-radius: 0;
  background: transparent;
  flex-shrink: 0;
}

.case-protocol-bar--socket,
.case-protocol-bar--mq {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.case-protocol-bar--http .case-protocol-field--grow {
  grid-row: 2;
  grid-column: 2;
}

.case-protocol-bar--http .case-protocol-field--encoding {
  grid-row: 2;
  grid-column: 1;
}

.case-request-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 6px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #fafbfc;
}

.case-request-summary--clickable {
  cursor: pointer;
  user-select: none;
}

.case-request-summary--clickable:hover {
  background: #f2f4f7;
}

.case-request-section-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px 6px;
  border-bottom: 1px solid #eaecf0;
  background: #f2f4f7;
}

.case-request-section-heading strong {
  color: #344054;
  font-size: 13px;
}

.case-request-section-heading span {
  color: #98a2b3;
  font-size: 12px;
}

.case-request-section-heading--content {
  margin-top: 8px;
  border-top: 1px solid #eaecf0;
  background: #fff;
}

.case-request-config-block {
  background: #fafbfc;
}

.case-request-summary-method {
  color: #b50930;
  font-weight: 700;
}

.case-request-summary-url {
  overflow: hidden;
  color: #344054;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-request-summary-encoding {
  color: #667085;
  font-size: 12px;
}

.request-config-chevron {
  margin-left: 4px;
  transition: transform 0.2s;
}

.request-config-chevron.is-open { transform: rotate(180deg); }

.case-target-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecf0;
}

.case-protocol-field--target :deep(.ant-select) {
  width: 100%;
}

.case-request-view-switch {
  display: flex;
  margin-left: auto;
  border: 1px solid #d0d5dd;
}

.case-request-view-switch button {
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid #d0d5dd;
  background: #fff;
  color: #475467;
  cursor: pointer;
}

.case-request-view-switch button:last-child { border-right: 0; }
.case-request-view-switch button.active { background: #b50930; color: #fff; }

.case-curl-panel {
  display: flex;
  min-height: 320px;
  flex-direction: column;
  border: 1px solid #eaecf0;
  background: #fff;
}

.case-curl-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
  color: #475467;
  font-size: 12px;
}

.case-curl-panel pre {
  flex: 1;
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: #1d2939;
  font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.case-protocol-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.case-protocol-field--grow {
  min-width: 0;
}

.case-protocol-label {
  font-size: 12px;
  color: #667085;
  text-align: right;
  white-space: nowrap;
}

.case-protocol-select {
  width: 100%;
  min-width: 0;
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

/* 报文是案例编辑的主工作区，保持可读高度，避免被底部操作栏压缩。 */
.case-request-panel .case-body-panel,
.case-request-panel .case-editor-surface {
  min-height: 0;
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

.case-editor-chrome-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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
  min-height: 420px;
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
  margin: 12px;
  overflow: auto;
}

.case-assertion-error {
  margin: 12px 12px 0;
  padding: 8px 10px;
  border: 1px solid #fecdca;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
}

.case-existing-assertion-note {
  margin: 8px 12px 0;
  padding: 7px 10px;
  border-left: 3px solid #f79009;
  background: #fffaeb;
  color: #93370d;
  font-size: 12px;
}

.case-debug-result-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.case-debug-result-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #667085;
  font-size: 13px;
}

.case-debug-result-status {
  font-weight: 700;
}

.case-debug-result-status.is-success { color: #039855; }
.case-debug-result-status.is-failed { color: #d92d20; }

.case-debug-result-error,
.case-debug-result-body {
  max-height: 420px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid #eaecf0;
  background: #f9fafb;
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.case-debug-result-error {
  border-color: #fecdca;
  background: #fef3f2;
  color: #b42318;
}

@media (max-width: 900px) {
  .case-request-summary { grid-template-columns: auto minmax(0, 1fr) auto; }
  .case-request-summary-encoding { display: none; }
  .case-target-bar { grid-template-columns: 1fr; }
  .case-protocol-bar,
  .case-protocol-bar--socket,
  .case-protocol-bar--mq { grid-template-columns: 1fr; }
  .batch-case-summary-item { grid-template-columns: minmax(0, 1fr) auto; }
  .batch-case-summary-no { justify-self: start; }
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

.case-body-expand-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.case-body-expand-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.case-body-expand-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.expand-toolbar-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }

.case-body-expand-textarea {
  width: 100%;
  min-height: min(68vh, 720px);
  max-height: 72vh;
  padding: 12px 14px;
  border: 1px solid #d0d5dd !important;
  border-radius: 8px !important;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  box-sizing: border-box;
  overflow: auto;
}

.case-body-expand-textarea.case-xml-editor {
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

.case-steps-list-panel {
  padding: 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
}

.case-steps-toolbar,
.case-step-row,
.case-step-row-summary {
  display: flex;
  align-items: center;
}

.case-step-chevron {
  margin-left: 10px;
  color: #7a8290;
  transition: transform 0.16s ease;
}

.case-step-chevron.is-open { transform: rotate(180deg); }

.case-steps-toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
  color: #344054;
}
.case-steps-hint { margin-top: 2px; color: #667085; font-size: 12px; font-weight: 400; }
.case-step-rows { display: grid; }

.case-step-list-head {
  display: grid;
  grid-template-columns: 44px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(180px, 1fr) 72px 216px;
  padding: 8px 10px;
  border: 1px solid #e1e4e9;
  border-radius: 6px 6px 0 0;
  background: #f8fafc;
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}

.case-step-list-head span:last-child {
  text-align: center;
}

.case-step-row {
  position: relative;
  min-height: 52px;
  flex-wrap: nowrap;
  border: 1px solid #e1e4e9;
  border-top: 0;
  background: #fff;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.case-step-row.is-parallel::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: #c8102e; content: ''; }

.case-step-row-summary {
  display: grid;
  flex: 1;
  grid-template-columns: 44px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(180px, 1fr);
  min-width: 0;
  min-height: 42px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.case-step-row:last-child { border-radius: 0 0 6px 6px; }
.case-step-row:hover { border-color: #cbd5e1; background: #fcfcfd; }

.case-step-order { color: #c8102e; font-weight: 700; }
.case-step-row-name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.case-parallel-tag { margin-left: 8px; color: #8b000f; border-color: #efb7c1; background: #fff5f5; font-size: 11px; }
.case-step-row-summary > span:nth-child(3) { color: #606875; }
.case-step-row-address { flex: 1; overflow: hidden; color: #7a8290; text-overflow: ellipsis; white-space: nowrap; }

.case-step-actions {
  display: flex;
  width: 216px;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
  padding-right: 6px;
  margin-left: auto;
}
.case-step-parallel { display: flex; width: 72px; justify-content: center; }

.case-step-actions .ant-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  color: #667085;
}
.case-step-actions .ant-btn:hover:not(:disabled) { color: #8b000f; background: #fff5f5; }
.case-step-actions .ant-btn-dangerous { color: #b42318; }
.case-step-actions .ant-btn-dangerous:hover:not(:disabled) { color: #b42318; background: #fff1f0; }
.case-step-modal-title { display: flex; align-items: baseline; gap: 10px; }
.case-step-modal-kicker { color: #8b000f; font-size: 12px; font-weight: 600; }
:global(.case-step-editor-modal .ant-modal) { top: 4vh; max-width: calc(100vw - 32px); }
:global(.case-step-editor-modal .ant-modal-content) { display: flex; flex-direction: column; height: 92vh; max-height: 92vh; overflow: hidden; border-radius: 10px; }
:global(.case-step-editor-modal .ant-modal-body) { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; padding: 20px 24px 0; }
:global(.case-step-editor-modal .case-step-name-field),
:global(.case-step-editor-modal .case-step-detail-tabs) { flex-shrink: 0; }
.case-step-detail-tabs { display: flex; margin-bottom: 12px; border-bottom: 1px solid #eaecf0; }
.case-step-editor-modal :deep(.case-request-panel),
.case-step-editor-modal :deep(.case-assertion-panel) { flex: 1; min-height: 0; height: auto; }
.case-step-editor-modal :deep(.ant-tabs) { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.case-step-editor-modal :deep(.ant-tabs-content-holder) { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.case-step-editor-modal :deep(.ant-tabs-content) { display: flex; flex: 1; min-height: 0; }
.case-step-editor-modal :deep(.ant-tabs-tabpane-active) { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; }
:global(.case-step-editor-modal .case-assertion-panel) { display: flex; flex: 1; min-height: 0; height: auto; overflow: hidden; }
:global(.case-step-editor-modal .case-assertion-shell) { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
:global(.case-step-editor-modal .assertion-rows-editor) { min-height: 0; height: 100%; }
:global(.case-step-editor-modal .assertion-rows-body) { flex: 1; min-height: 0; max-height: none; overflow: auto; }
.case-step-response-list { flex: 1; min-height: 0; max-height: none; overflow: auto; }
.case-step-response-list :deep(.ant-table) { min-width: 640px; }
.case-step-editor-modal .case-step-fields { margin-bottom: 14px; }
.case-step-modal-footer { display: grid; flex-shrink: 0; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; margin: 20px -24px 0; padding: 14px 24px; border-top: 1px solid #eaecf0; background: #fafbfc; }

.case-step-fields {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) minmax(220px, 1.4fr) minmax(240px, 1.6fr);
  gap: 8px;
}

.debug-history-title { display: flex; align-items: baseline; gap: 10px; }
.debug-history-title span { color: #98a2b3; font-size: 12px; font-weight: 400; }
.debug-history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #98a2b3;
  font-size: 12px;
}
.debug-history-list { display: flex; flex-direction: column; gap: 8px; max-height: 56vh; overflow-y: auto; }
.debug-history-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e1e4e9;
  border-radius: 8px;
  background: #fff;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.debug-history-row:hover { border-color: #cbd5e1; background: #fcfcfd; }
.debug-history-row-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.debug-history-status { margin-inline-end: 0; }
.debug-history-time { color: #344054; font-size: 13px; font-weight: 600; }
.debug-history-metric { color: #667085; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.debug-history-view { margin-left: auto; }
.debug-history-row-error {
  padding: 4px 8px;
  border: 1px solid #fecdca;
  border-radius: 4px;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
}
.debug-record-detail { display: grid; gap: 12px; }
.debug-record-detail-target {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 6px;
  background: #fafbfc;
  color: #667085;
  font-size: 12px;
}
.debug-record-detail-target strong { color: #344054; font-weight: 600; margin-right: 10px; }
.debug-record-detail-target--muted strong { color: #98a2b3; font-weight: 400; }
.debug-record-detail-head { margin-bottom: 6px; color: #344054; font-size: 13px; }
.debug-record-detail pre {
  max-height: 320px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid #e1e4e9;
  background: #fafbfc;
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .case-step-fields { grid-template-columns: 1fr; }
}
</style>
