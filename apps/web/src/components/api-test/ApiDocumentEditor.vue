<template>
  <section class="panel document-panel">
    <div class="panel-header document-panel-header">
      <div class="document-panel-intro">
        <h2>接口文档</h2>
        <p class="document-panel-desc">上传并结构化接口文档，可 AI 生成测试案例</p>
        <div v-if="sourceDocName" class="doc-source-row">
          <a
            v-if="apiStore.apiDoc?.sourceDocUrl"
            class="doc-source-link"
            :href="apiStore.apiDoc.sourceDocUrl"
            target="_blank"
            rel="noopener"
            :title="sourceDocName"
          >
            当前文档：{{ sourceDocName }}
          </a>
          <span v-else class="doc-source-name" :title="sourceDocName">
            当前文档：{{ sourceDocName }}
          </span>
        </div>
      </div>
      <div class="toolbar action-toolbar document-panel-toolbar">
        <a-upload
          v-if="!isSmpSource"
          :show-upload-list="false"
          :before-upload="onUpload"
          :disabled="apiStore.loading"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        >
          <a-button :loading="apiStore.loading" :disabled="apiStore.loading">
            <template #icon><UploadOutlined /></template>
            {{ sourceDocName ? '重新上传' : '上传文档' }}
          </a-button>
        </a-upload>
        <a-button
          type="primary"
          :disabled="!apiStore.canGenerateCases || apiStore.docReadiness?.ok === false"
          :loading="generatingCases"
          @click="onGenerate"
        >
          <template #icon><ThunderboltOutlined /></template>
          AI 生成案例
        </a-button>
        <a-button @click="historyDrawerOpen = true">
          <template #icon><HistoryOutlined /></template>
          生成历史
        </a-button>
        <a-button :disabled="!canSave" @click="void onSave()">
          <template #icon><SaveOutlined /></template>
          保存
        </a-button>
        <a-dropdown v-model:open="moreMenuOpen" trigger="click">
          <a-button>
            更多
            <DownOutlined
              :class="['dropdown-trigger-chevron', { 'is-open': moreMenuOpen }]"
            />
          </a-button>
          <template #overlay>
            <a-menu @click="onMoreMenuClick">
              <a-menu-item key="data-functions">
                <CodeOutlined />
                函数库
              </a-menu-item>
              <a-menu-item key="database-connections">
                <CodeOutlined />
                数据库
              </a-menu-item>
              <a-menu-item key="step-library">
                <UnorderedListOutlined />
                步骤库
              </a-menu-item>
              <a-menu-item key="environments">
                <SettingOutlined />
                环境库
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>

    <a-alert
      v-if="generatingCases"
      type="info"
      show-icon
      class="document-panel-alert"
    >
      <template #message>
        <span>正在后台生成案例，完成后将自动进入案例编辑</span>
        <a-button type="link" size="small" @click="onCancelGenerate">
          取消
        </a-button>
      </template>
    </a-alert>

    <a-alert
      v-if="apiStore.apiDoc?.structuringStatus === 'failed'"
      type="error"
      show-icon
      :message="apiStore.apiDoc.structuringError"
      class="document-panel-alert"
    />

    <a-alert
      v-if="apiStore.docReadinessMessage"
      type="warning"
      show-icon
      :message="apiStore.docReadinessMessage"
      class="document-panel-alert"
    >
      <template #description>
        <span v-if="apiStore.docReadiness?.endpoints?.length">
          未通过检查的接口：
          <span
            v-for="ep in apiStore.docReadiness.endpoints.filter((e) => !e.ok)"
            :key="ep.endpointId"
            class="readiness-endpoint-tag"
          >
            {{ ep.endpointName }}（{{ ep.message }}）
          </span>
        </span>
      </template>
    </a-alert>

    <div ref="tableScrollRef" class="document-table-scroll">
      <div v-if="isSmpSource" class="smp-doc-source-tag">来源：服管平台</div>
      <a-empty
          v-if="!sections.length"
          description="上传 Excel 后将自动结构化，可 AI 生成案例"
        />
        <div
          v-for="(section, sectionIndex) in sections"
          :key="section.title"
          class="doc-section-block"
          :class="{
            'doc-section-block--collapsed': isSectionCollapsed(section.title),
            'doc-section-block--example': section.title === '示例报文',
          }"
        >
          <button
            type="button"
            class="doc-section-title-btn"
            @click="toggleSection(section.title)"
          >
            <span class="doc-section-chevron" aria-hidden="true">
              <RightOutlined v-if="isSectionCollapsed(section.title)" />
              <DownOutlined v-else />
            </span>
            <span class="doc-section-title">{{ section.title }}</span>
          </button>
          <div v-if="!isSectionCollapsed(section.title)" class="doc-section-body">
            <div v-if="section.title === '示例报文'" class="example-message-block">
              <div class="example-message-shell">
                <div class="example-message-actions">
                  <a-button type="link" size="small" class="example-message-action-btn" :disabled="!hasExampleCursor" @click="openFunctionInsert"><CodeOutlined /> 插入函数</a-button>
                  <a-button
                    type="link"
                    size="small"
                    class="example-message-beautify-btn"
                    :disabled="!exampleMessage.trim()"
                    @click="beautifyExampleMessage"
                  >
                    <template #icon><FormatPainterOutlined /></template>
                    美化
                  </a-button>
                  <a-button
                    type="link"
                    size="small"
                    class="example-message-expand-btn"
                    @click="exampleExpandModalOpen = true"
                  >
                    <template #icon><ExpandOutlined /></template>
                    编辑
                  </a-button>
                </div>
                <textarea
                  v-model="exampleMessage"
                  class="example-message-input"
                  placeholder="可选。填写后将作为 AI 生成案例的报文样例参考。"
                  spellcheck="false"
                  @focus="rememberExampleCursor"
                  @click="rememberExampleCursor"
                  @keyup="rememberExampleCursor"
                  @input="onExampleMessageInput"
                  @blur="onExampleMessageBlur"
                  @paste="onExampleMessagePaste"
                />
              </div>
            </div>
            <div v-else class="api-doc-table-wrap">
              <table class="api-doc-table">
                <thead>
                  <tr>
                    <th
                      v-for="(label, colIndex) in sectionTableHeaders(section)"
                      :key="`${section.title}-head-${colIndex}`"
                    >
                      {{ label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="record in visibleSectionData(sectionIndex)"
                    :key="record.key"
                  >
                    <td
                      v-for="colKey in sectionTableColumnKeys(section)"
                      :key="`${record.key}-${colKey}`"
                    >
                      <textarea
                        v-model="record[colKey]"
                        class="doc-cell-input"
                        rows="1"
                        @input="onCellInput(sectionIndex, $event)"
                        @blur="handleCellBlur(sectionIndex)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <a-pagination
                v-if="sectionData[sectionIndex].length > DOC_TABLE_PAGE_SIZE"
                v-model:current="sectionPages[sectionIndex]"
                :page-size="DOC_TABLE_PAGE_SIZE"
                :total="sectionData[sectionIndex].length"
                :show-size-changer="false"
                size="small"
                show-less-items
                @change="resizeAllDocCellInputs"
              />
            </div>
          </div>
        </div>
    </div>
  </section>

  <ApiCaseGenerateHistoryDrawer
    v-model:open="historyDrawerOpen"
    :project-id="projectId"
    :transaction-id="transactionId"
  />

  <ApiDataFunctionMaintainModal v-model:open="dataFunctionModalOpen" :project-id="apiStore.activeProjectId" />
  <ApiDatabaseConnectionMaintainModal v-model:open="databaseConnectionModalOpen" :project-id="apiStore.activeProjectId" />
  <ApiEnvironmentMaintainModal v-model:open="environmentModalOpen" />
  <a-modal v-model:open="functionInsertOpen" title="插入数据函数" :width="680" :z-index="NESTED_OVERLAY_Z_INDEX" ok-text="插入" @ok="insertFunctionExpression">
    <a-form layout="vertical">
      <a-form-item label="函数" required>
        <a-select v-model:value="insertFunctionName" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }" show-search :filter-option="filterInsertFunctionOption">
          <a-select-option v-for="item in insertFunctions" :key="item.name" :value="item.name" :label="item.name">
            <span class="function-option-name">{{ item.name }}</span>
            <span v-if="item.description" class="function-option-desc">{{ item.description }}</span>
          </a-select-option>
        </a-select>
      </a-form-item>
      <p v-if="selectedInsertFunction?.description" class="function-description-hint">{{ selectedInsertFunction.description }}</p>
      <div v-if="selectedInsertFunction?.params.length" class="function-argument-list">
        <label v-for="(param, index) in selectedInsertFunction.params" :key="`${param}-${index}`" class="function-argument-row">
          <span :title="param">{{ index + 1 }}. {{ param }}</span>
          <a-auto-complete v-model:value="insertFunctionArgs[index]" :options="examplePathOptions(index)" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }" filter-option placeholder="选择或输入参数来源" />
        </label>
      </div>
      <a-form-item v-if="selectedInsertFunction?.type === 'sql'" label="结果字段" required>
        <a-auto-complete
          v-model:value="insertFunctionField"
          :options="insertFieldOptions"
          :get-popup-container="popupContainer"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 1 }"
          placeholder="选择或输入查询结果字段"
        />
      </a-form-item>
      <div class="function-expression-preview"><span>调用预览</span><code>{{ functionInsertPreview }}</code></div>
    </a-form>
  </a-modal>

  <a-modal
    v-model:open="generateModalOpen"
    title="AI 生成案例"
    :width="800"
    ok-text="开始生成"
    cancel-text="取消"
    :confirm-loading="generatingCases"
    destroy-on-close
    wrap-class-name="api-generate-modal"
    @ok="onConfirmGenerate"
    @cancel="onCloseGenerateModal"
  >
    <div class="generate-modal-body">
      <a-form layout="vertical">
        <div class="generation-profile-grid">
          <a-form-item label="服务属性" required>
            <a-select v-model:value="generationProfile.serviceProperty" :options="servicePropertyOptions" />
          </a-form-item>
          <a-form-item label="通讯方式" required>
            <a-select v-model:value="generationProfile.transport" :options="transportOptions" />
          </a-form-item>
          <a-form-item label="报文类型" required>
            <a-select v-model:value="generationProfile.messageFormat" :options="messageFormatOptions" />
          </a-form-item>
        </div>
        <section class="step-orchestration large-payload-panel">
          <div class="step-orchestration-head">
            <div><strong>大报文测试</strong><span>请求报文长度 &gt; 100000 的字段会自动附加大报文与空字段案例；开启后为所选字段额外附加这两类案例</span></div>
            <a-switch v-model:checked="largePayloadEnabled" />
          </div>
          <div class="large-payload-body">
            <a-select
              v-if="largePayloadEnabled"
              v-model:value="largePayloadFieldPath"
              :options="largePayloadFieldOptions"
              show-search
              allow-clear
              option-filter-prop="label"
              placeholder="选择请求报文中传大报文的字段"
              :get-popup-container="popupContainer"
              :dropdown-style="nestedDropdownStyle"
            />
            <div v-else class="step-lane-empty">未开启：请求报文中长度 &gt; 100000 的字段仍会自动附加大报文与空字段案例</div>
          </div>
        </section>
        <section class="step-orchestration">
          <div class="step-orchestration-head">
            <div><strong>步骤编排</strong><span>按从上到下的顺序执行</span></div>
            <a-tag>{{ beforeStepIds.length + afterStepIds.length + 1 }} 个步骤</a-tag>
          </div>
          <div class="step-lane">
            <div class="step-lane-head"><span>前置步骤</span><a-select v-model:search-value="beforeStepSearch" size="small" placeholder="添加" :options="availableBeforeOptions" :value="undefined" show-search allow-clear option-filter-prop="label" :filter-option="true" @change="addBeforeStep" /></div>
            <div v-if="beforeStepIds.length" class="step-lane-list">
              <div v-for="(id, index) in beforeStepIds" :key="id" class="step-sequence-row">
                <span class="step-sequence-index">{{ index + 1 }}</span><span class="step-sequence-name">{{ libraryStepName(id) }}</span>
                <a-button type="text" size="small" :disabled="index === 0" title="上移" @click="moveSelectedStep(beforeStepIds, index, -1)">↑</a-button>
                <a-button type="text" size="small" :disabled="index === beforeStepIds.length - 1" title="下移" @click="moveSelectedStep(beforeStepIds, index, 1)">↓</a-button>
                <a-button type="text" danger size="small" title="移除" @click="beforeStepIds.splice(index, 1)"><DeleteOutlined /></a-button>
              </div>
            </div>
            <div v-else class="step-lane-empty">无前置步骤</div>
          </div>
          <div class="step-lane">
            <div class="step-lane-head"><span>后置步骤</span><a-select v-model:search-value="afterStepSearch" size="small" placeholder="添加" :options="availableAfterOptions" :value="undefined" show-search allow-clear option-filter-prop="label" :filter-option="true" @change="addAfterStep" /></div>
            <div v-if="afterStepIds.length" class="step-lane-list">
              <div v-for="(id, index) in afterStepIds" :key="id" class="step-sequence-row">
                <span class="step-sequence-index">{{ beforeStepIds.length + index + 2 }}</span><span class="step-sequence-name">{{ libraryStepName(id) }}</span>
                <a-button type="text" size="small" :disabled="index === 0" title="上移" @click="moveSelectedStep(afterStepIds, index, -1)">↑</a-button>
                <a-button type="text" size="small" :disabled="index === afterStepIds.length - 1" title="下移" @click="moveSelectedStep(afterStepIds, index, 1)">↓</a-button>
                <a-button type="text" danger size="small" title="移除" @click="afterStepIds.splice(index, 1)"><DeleteOutlined /></a-button>
              </div>
            </div>
            <div v-else class="step-lane-empty">无后置步骤</div>
          </div>
        </section>
        <section class="channel-panel">
          <div class="channel-editor-header">
            <div>
              <strong>渠道数据</strong>
              <span>勾选参与本次生成</span>
            </div>
            <div class="channel-editor-actions">
              <a-input-search
                v-model:value="channelKeyword"
                allow-clear
                class="channel-search"
                placeholder="搜索名称 / clientCd / serviceCd"
              />
              <a-upload
                :show-upload-list="false"
                accept=".xls,.xlsx,.csv"
                :before-upload="importChannels"
              >
                <a-button size="small" type="text" class="channel-add-btn">
                  <template #icon><ImportOutlined /></template>
                </a-button>
              </a-upload>
              <a-button size="small" type="text" class="channel-add-btn" @click="addChannel">
                <template #icon><PlusOutlined /></template>
              </a-button>
            </div>
          </div>
          <div class="channel-editor-columns" aria-hidden="true">
            <span>选择</span><span>渠道名称</span><span>clientCd</span><span>serviceCd</span><span>操作</span>
          </div>
          <div class="channel-editor-list">
            <div
              v-for="channel in filteredChannels"
              :key="channel.id"
              :class="['channel-editor-row', { 'is-selected': selectedChannelIds.includes(channel.id) }]"
            >
            <a-checkbox
              :checked="selectedChannelIds.includes(channel.id)"
              :disabled="!isChannelComplete(channel)"
              @change="toggleChannel(channel.id, $event.target.checked)"
            />
            <a-input v-model:value="channel.name" placeholder="渠道名称" />
            <a-input v-model:value="channel.clientCd" placeholder="clientCd" />
            <a-input v-model:value="channel.serviceCd" placeholder="serviceCd" />
              <a-button type="text" danger aria-label="删除渠道" @click="removeChannel(channel.id)">
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
            <a-empty v-if="channelKeyword && !filteredChannels.length" :image="false" description="未找到匹配渠道" />
          </div>
        </section>
      </a-form>
    </div>
  </a-modal>

  <a-modal v-model:open="stepLibraryOpen" title="步骤库" :width="900" :footer="null" wrap-class-name="step-library-modal" :z-index="NESTED_OVERLAY_Z_INDEX">
    <div class="step-library-table-scroll">
    <a-table class="step-library-table" :data-source="pagedStepLibrary" :pagination="stepLibraryPagination" row-key="id" size="small" :locale="{ emptyText: '' }" :custom-row="stepLibraryRowProps">
      <a-table-column title="序号" :width="56"><template #default="{ index }"><span class="step-library-order">{{ (stepLibraryPage - 1) * stepLibraryPageSize + index + 1 }}</span></template></a-table-column>
      <a-table-column title="步骤名称" data-index="name" />
      <a-table-column title="环境"><template #default="{ record }">{{ record.step.target?.name || '未选择环境' }}</template></a-table-column>
      <a-table-column title="地址"><template #default="{ record }"><span class="step-library-address">{{ record.step.target?.address || '未选择地址' }}</span></template></a-table-column>
      <a-table-column :width="148" align="center"><template #title><span>操作</span></template><template #default="{ record }"><div class="step-library-actions"><a-button type="text" size="small" title="编辑" @click.stop="editLibraryStep(record)"><EditOutlined /></a-button><a-button type="text" size="small" title="复制" @click.stop="copyLibraryStepRecord(record)"><CopyOutlined /></a-button><a-button type="text" danger size="small" title="删除" @click.stop="removeLibraryStep(record.id)"><DeleteOutlined /></a-button><a-button type="text" size="small" title="新增步骤" @click.stop="quickAddLibraryStep"><PlusOutlined /></a-button></div></template></a-table-column>
    </a-table>
    <div v-if="!stepLibrary.length" class="step-library-empty">
      <a-empty description="暂无步骤">
        <a-button type="primary" @click="quickAddLibraryStep">
          <template #icon><PlusOutlined /></template>
          新增步骤
        </a-button>
      </a-empty>
    </div>
    </div>
  </a-modal>
  <a-modal v-model:open="stepEditOpen" title="编辑步骤" :width="1080" :footer="null" :z-index="NESTED_OVERLAY_Z_INDEX" wrap-class-name="step-editor-modal">
    <div class="case-step-name-field">
      <span>步骤名称</span>
      <a-input v-model:value="stepEdit.name" size="small" placeholder="步骤名称" />
    </div>
    <div class="case-step-detail-tabs">
      <button v-for="tab in stepEditTabs" :key="tab.key" type="button" :class="['case-editor-main-tab', { active: stepEditTab === tab.key }]" @click="stepEditTab = tab.key">{{ tab.label }}</button>
    </div>

    <div v-show="stepEditTab === 'request'" class="case-editor-panel case-request-panel">
      <div class="case-request-shell">
        <div
          class="case-request-summary case-request-summary--clickable"
          role="button"
          tabindex="0"
          @click="libraryRequestConfigExpanded = !libraryRequestConfigExpanded"
          @keydown.enter="libraryRequestConfigExpanded = !libraryRequestConfigExpanded"
        >
          <span class="case-request-summary-method">{{ stepEdit.protocol === 'http' ? stepEdit.method : stepEdit.protocol.toUpperCase() }}</span>
          <span class="case-request-summary-url" :title="libraryFullRequestAddress">{{ libraryFullRequestAddress || '请选择环境和地址' }}</span>
          <span class="case-request-summary-encoding">{{ stepEdit.encoding }}</span>
          <a-button type="text" size="small" @click.stop="libraryRequestConfigExpanded = !libraryRequestConfigExpanded">
            {{ libraryRequestConfigExpanded ? '收起' : '展开' }}
            <DownOutlined :class="['request-config-chevron', { 'is-open': libraryRequestConfigExpanded }]" />
          </a-button>
        </div>
        <template v-if="libraryRequestConfigExpanded">
          <div class="case-request-config-block">
            <div class="case-target-bar">
              <div class="case-protocol-field case-protocol-field--target">
                <span class="case-protocol-label">环境</span>
                <a-select v-model:value="stepEdit.environmentId" :options="libraryEnvironmentOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" size="small" class="case-protocol-select" placeholder="选择环境" allow-clear @change="onLibraryEnvironmentChange" />
              </div>
              <div class="case-protocol-field case-protocol-field--target">
                <span class="case-protocol-label">地址</span>
                <a-select v-model:value="stepEdit.serviceId" :options="libraryServiceOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" size="small" class="case-protocol-select" placeholder="选择地址" :disabled="!stepEdit.environmentId" @change="onLibraryServiceChange" />
              </div>
            </div>
            <div class="case-protocol-bar" :class="`case-protocol-bar--${stepEdit.protocol}`">
              <div class="case-protocol-field case-protocol-field--protocol">
                <span class="case-protocol-label">通讯协议</span>
                <a-select v-model:value="stepEdit.protocol" :options="libraryProtocolOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" size="small" class="case-protocol-select" />
              </div>
              <template v-if="stepEdit.protocol === 'http'">
                <div class="case-protocol-field case-protocol-field--method">
                  <span class="case-protocol-label">请求方法</span>
                  <a-select v-model:value="stepEdit.method" :options="libraryMethodOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" size="small" class="case-protocol-select" />
                </div>
                <div class="case-protocol-field case-protocol-field--grow">
                  <span class="case-protocol-label">路径</span>
                  <a-input v-model:value="stepEdit.path" size="small" placeholder="相对路径，按环境与服务拼接 URL" />
                </div>
              </template>
              <div class="case-protocol-field case-protocol-field--encoding">
                <span class="case-protocol-label">编码</span>
                <a-select v-model:value="stepEdit.encoding" :options="libraryEncodingOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" size="small" class="case-protocol-select" />
              </div>
            </div>
          </div>
        </template>
        <div class="case-request-toolbar">
          <div class="case-request-tabs">
            <button
              v-for="tab in libraryRequestTabs"
              :key="tab.key"
              type="button"
              class="case-request-tab"
              :class="{ active: stepRequestTab === tab.key }"
              @click="stepRequestTab = tab.key"
            >
              {{ tab.label }}
              <span v-if="tab.count" class="case-request-tab-badge">{{ tab.count }}</span>
            </button>
          </div>
          <div v-if="stepEdit.protocol === 'http'" class="case-request-view-switch">
            <button type="button" :class="{ active: stepRequestView === 'template' }" @click="stepRequestView = 'template'">模板</button>
            <button type="button" :class="{ active: stepRequestView === 'curl' }" @click="stepRequestView = 'curl'">cURL</button>
          </div>
        </div>
        <div class="case-payload-fields case-payload-fields--body">
          <div v-if="stepRequestView === 'curl' && stepEdit.protocol === 'http'" class="case-curl-panel">
            <div class="case-curl-toolbar">
              <span>终端命令</span>
              <a-button type="link" size="small" @click="copyLibraryCurl">
                <template #icon><CopyOutlined /></template>
                复制
              </a-button>
            </div>
            <pre>{{ libraryCurlCommand }}</pre>
          </div>
          <template v-else-if="stepRequestTab === 'params'">
            <KeyValueRowsEditor v-model:rows="stepEdit.queryRows" />
          </template>
          <template v-else-if="stepRequestTab === 'headers'">
            <KeyValueRowsEditor v-model:rows="stepEdit.headerRows" />
          </template>
          <template v-else>
            <div class="case-body-panel">
              <div class="case-editor-surface">
                <div class="case-editor-chrome">
                  <div class="case-body-format-bar">
                    <button
                      v-for="item in libraryBodyFormatOptions"
                      :key="item.value"
                      type="button"
                      class="case-body-format-btn"
                      :class="{ active: stepEdit.bodyFormat === item.value }"
                      @click="switchLibraryBodyFormat(item.value as 'json' | 'xml' | 'text')"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                  <div class="case-editor-chrome-actions">
                    <a-button type="link" size="small" :disabled="!hasStepBodyCursor || !libraryVariableOptions.length" @click="openLibraryVariableInsert"><LinkOutlined /> 插入变量</a-button>
                    <a-button type="link" size="small" :disabled="!hasStepBodyCursor" @click="openStepBodyFunctionInsert"><CodeOutlined /> 插入函数</a-button>
                    <a-button type="link" size="small" class="case-editor-beautify-btn" @click="beautifyLibraryBody">
                      <template #icon><FormatPainterOutlined /></template>
                      美化
                    </a-button>
                  </div>
                </div>
                <div class="case-editor-content">
                  <textarea
                    v-model="stepEdit.body"
                    :class="['ant-input', 'case-payload-textarea', 'case-payload-textarea--expand', 'case-payload-textarea--in-surface', stepEdit.bodyFormat === 'json' ? 'case-json-editor' : stepEdit.bodyFormat === 'xml' ? 'case-xml-editor' : '']"
                    :placeholder="stepEdit.bodyFormat === 'xml' ? '<Transaction />' : stepEdit.bodyFormat === 'json' ? '{}' : '纯文本报文'"
                    spellcheck="false"
                    @focus="rememberStepBodyCursor"
                    @click="rememberStepBodyCursor"
                    @keyup="rememberStepBodyCursor"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-show="stepEditTab === 'assertion'" class="case-editor-panel case-assertion-panel">
      <div class="case-assertion-shell">
        <div class="case-assertion-toolbar">
          <div>
            <strong>断言内容（{{ stepEdit.assertionRows.filter((row) => row.type && row.operator).length }}）</strong>
          </div>
          <div class="case-assertion-toolbar-actions">
            <a-button
              type="primary"
              size="small"
              :loading="libraryDebugRunning || libraryGeneratingAssertions"
              :disabled="!stepEdit.address.trim()"
              @click="onLibraryGenerateAssertions"
            >
              <template #icon><RobotOutlined /></template>
              {{ libraryDebugRunning ? '正在请求接口' : libraryGeneratingAssertions ? '正在生成断言' : 'AI 生成断言' }}
            </a-button>
          </div>
        </div>
        <div v-if="libraryAssertionError" class="case-assertion-error">{{ libraryAssertionError }}</div>
        <AssertionRowsEditor v-model:rows="stepEdit.assertionRows" :protocol="stepEdit.protocol" :project-id="projectId" class="case-debug-assertion-editor" />
      </div>
    </div>

    <div v-show="stepEditTab === 'variables'" class="case-editor-panel case-assertion-panel">
      <div class="case-assertion-shell">
        <div class="case-assertion-toolbar">
          <div><strong>变量提取（{{ stepEdit.exports.length }}）</strong></div>
          <div class="case-assertion-toolbar-actions">
            <a-button type="primary" size="small" :loading="libraryDebugRunning" @click="addLibraryExportFromDebug">
              <template #icon><ThunderboltOutlined /></template>
              调试添加
            </a-button>
          </div>
        </div>
        <div class="case-step-response-list">
          <a-table :data-source="stepEdit.exports" :pagination="false" size="small" row-key="rowId">
            <a-table-column title="变量名" key="name"><template #default="{ record }"><a-input v-model:value="record.name" placeholder="accessToken" /></template></a-table-column>
            <a-table-column title="来源" key="source" :width="110"><template #default="{ record }"><a-select v-model:value="record.source" size="small" :options="exportSourceOptions" :get-popup-container="popupContainer" :dropdown-style="nestedDropdownStyle" /></template></a-table-column>
            <a-table-column title="提取表达式" key="expression"><template #default="{ record }"><a-input v-model:value="record.expression" placeholder="json:$.Transaction... | xml:/Transaction/./." /></template></a-table-column>
            <a-table-column title="引用" key="reference" :width="160"><template #default="{ record }"><code v-if="record.name">{{ variableReference(record.name) }}</code></template></a-table-column>
            <a-table-column key="action" :width="60" align="center">
              <template #title><a-button type="text" size="small" title="手动添加" @click="addLibraryExport"><PlusOutlined /></a-button></template>
              <template #default="{ index }"><a-button type="text" size="small" danger title="删除" @click="stepEdit.exports.splice(index, 1)"><MinusOutlined /></a-button></template>
            </a-table-column>
          </a-table>
        </div>
        <a-empty v-if="!stepEdit.exports.length" description="从本步骤请求/响应中提取共享变量，后续步骤用 ${变量名} 引用" />
      </div>
    </div>

    <div class="case-step-modal-footer">
      <a-button :loading="stepDebugging" :disabled="!stepEdit.address.trim()" @click="debugLibraryStep"><ThunderboltOutlined />调试</a-button>
      <span></span>
      <a-button @click="stepEditOpen = false">取消</a-button>
      <a-button type="primary" :loading="stepDebugging" @click="saveLibraryStep">确认</a-button>
    </div>
  </a-modal>
  <a-modal v-model:open="libraryVariableInsertOpen" title="插入变量" :z-index="NESTED_OVERLAY_Z_INDEX + 10" ok-text="插入" @ok="insertLibraryVariable">
    <a-form layout="vertical">
      <a-form-item label="变量" required><a-select v-model:value="libraryVariableName" :options="libraryVariableOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" show-search /></a-form-item>
      <div class="function-expression-preview"><span>引用预览</span><code>{{ libraryVariablePreview }}</code></div>
    </a-form>
  </a-modal>
  <a-modal v-model:open="libraryDebugExportOpen" title="从调试添加提取" :z-index="NESTED_OVERLAY_Z_INDEX + 10" ok-text="添加" @ok="confirmLibraryDebugExport">
    <a-form layout="vertical">
      <a-form-item label="来源"><a-select v-model:value="libraryDebugExportSource" :options="libraryDebugExportSourceOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" @change="onLibraryDebugExportSourceChange" /></a-form-item>
      <a-form-item label="字段路径"><a-select v-model:value="libraryDebugExportPath" show-search :options="libraryDebugExportPathOptions" :get-popup-container="popupContainer" :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 11 }" placeholder="选择字段" /></a-form-item>
      <a-form-item label="变量名"><a-input v-model:value="libraryDebugExportName" placeholder="accessToken" /></a-form-item>
    </a-form>
  </a-modal>
  <a-modal v-model:open="stepDebugResultOpen" title="步骤调试结果" :width="760" :z-index="NESTED_OVERLAY_Z_INDEX + 10" :footer="null">
    <div v-if="stepDebugResult" class="step-debug-result">
      <div class="step-debug-summary"><a-tag :color="stepDebugResult.error ? 'error' : 'success'">{{ stepDebugResult.error ? '失败' : '成功' }}</a-tag><span>{{ stepDebugResult.durationMs }} ms</span><span>{{ stepDebugResult.bodySize }} bytes</span></div>
      <a-alert v-if="stepDebugResult.error" type="error" :message="stepDebugResult.error" show-icon />
      <pre v-else>{{ JSON.stringify(stepDebugResult.body, null, 2) }}</pre>
    </div>
  </a-modal>

  <a-modal
    v-model:open="exampleExpandModalOpen"
    title="编辑示例报文"
    :width="1000"
    :z-index="IMMERSIVE_OVERLAY_Z_INDEX"
    ok-text="完成"
    cancel-text="取消"
    wrap-class-name="example-message-expand-modal-wrap"
    :destroy-on-close="false"
    @ok="onExampleExpandModalOk"
  >
    <div class="example-message-expand-modal">
      <div class="example-message-expand-toolbar">
        <p class="example-message-expand-hint">可选。填写后将作为 AI 生成案例的报文样例参考。</p>
        <div class="expand-toolbar-actions">
          <a-button type="link" size="small" :disabled="!hasExampleCursor" @click="openFunctionInsert"><CodeOutlined /> 插入函数</a-button>
          <a-button type="link" size="small" class="example-message-beautify-btn" :disabled="!exampleMessage.trim()" @click="beautifyExampleMessage">
            <template #icon><FormatPainterOutlined /></template>美化
          </a-button>
        </div>
      </div>
      <textarea
        v-model="exampleMessage"
        class="example-message-expand-input"
        placeholder="可选。填写后将作为 AI 生成案例的报文样例参考。"
        spellcheck="false"
        @focus="rememberExampleCursor"
        @click="rememberExampleCursor"
        @keyup="rememberExampleCursor"
        @input="onExampleMessageInput"
      />
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import {
  DownOutlined,
  DeleteOutlined,
  EditOutlined,
  CodeOutlined,
  CopyOutlined,
  ExpandOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  ImportOutlined,
  LinkOutlined,
  MinusOutlined,
  PlusOutlined,
  RobotOutlined,
  RightOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import type { MenuProps, UploadProps } from 'ant-design-vue';
import ApiCaseGenerateHistoryDrawer from '@/components/api-test/ApiCaseGenerateHistoryDrawer.vue';
import ApiDataFunctionMaintainModal from '@/components/api-test/ApiDataFunctionMaintainModal.vue';
import ApiDatabaseConnectionMaintainModal from '@/components/api-test/ApiDatabaseConnectionMaintainModal.vue';
import ApiEnvironmentMaintainModal from '@/components/api-test/ApiEnvironmentMaintainModal.vue';
import AssertionRowsEditor from '@/components/api-test/AssertionRowsEditor.vue';
import KeyValueRowsEditor from '@/components/api-test/KeyValueRowsEditor.vue';
import { IMMERSIVE_OVERLAY_Z_INDEX, NESTED_OVERLAY_Z_INDEX } from '@/constants/overlay-z-index';
import { useApiTestStore } from '@/stores/apiTest';
import type { ApiCaseRequest, ApiCaseStep, ApiDocGenerationProfile } from '@case-forge/shared';
import * as XLSX from 'xlsx';
import {
  parseApiDocTableText,
  API_DOC_SECTION_TITLES,
  sectionTableColumnKeys,
  sectionTableData,
  sectionTableHeaders,
  serializeApiDocTableText,
  tableDataToRows,
  type ApiDocTableSection,
} from '@/utils/api-doc-table.util';
import {
  beautifyCasePayloadJson,
  beautifyRequestBodyXml,
  httpMethodHasBody,
  type HttpMethod,
} from '@/utils/casePayloadFormat.util';
import { randomUuid } from '@/utils/randomUuid';
import { debugRunCase, deleteStepLibrary, generateAssertions, getAssertionGenerateResult, getAssertionGenerateStatus, listDataFunctions, listStepLibrary, saveStepLibrary, type ApiStepLibraryRow, type DebugRunResult } from '@/api/apiTestClient';
import { messagePathOptions } from '@/utils/messagePathOptions';
import { assertionsToRows, buildExpectedFromRows, type AssertionRow } from '@/utils/assertionRows.util';
import { createEmptyKeyValueRow, type KeyValueRow } from '@/utils/casePayloadFormat.util';
import { copyText } from '@/utils/copyText';
import { getDebugResponseIssue, parseDebugResponseBody, responsePaths } from '@/utils/debugResponse.util';
import { copyStepToClipboard } from '@/utils/stepClipboard.util';
import { dataFunctionFieldOptions } from '@/utils/sqlSelectColumns.util';

const tableScrollRef = ref<HTMLElement | null>(null);
const EXAMPLE_MESSAGE_MIN_HEIGHT_PX = 160;
const DOC_TABLE_PAGE_SIZE = 100;
const apiStore = useApiTestStore();
const popupContainer = () => document.body;
const nestedDropdownStyle = { zIndex: NESTED_OVERLAY_Z_INDEX + 1 };
const sections = ref<ApiDocTableSection[]>([]);
const sectionData = ref<Record<string, string>[][]>([]);
const sectionPages = ref<number[]>([]);
const exampleMessage = ref('');
const functionInsertOpen = ref(false);
const functionInsertRange = reactive({ start: 0, end: 0 });
const hasExampleCursor = ref(false);
const insertFunctionName = ref('');
const insertFunctionArgs = ref<string[]>([]);
const insertFunctionField = ref('');
const insertFunctions = ref<Awaited<ReturnType<typeof listDataFunctions>>>([]);
const selectedInsertFunction = computed(() => insertFunctions.value.find((item) => item.name === insertFunctionName.value));
const functionInsertTarget = ref<'example' | 'stepBody'>('example');
function functionInsertSourceText() { return functionInsertTarget.value === 'stepBody' ? stepEdit.body : exampleMessage.value; }
function examplePathOptions(index: number) {
  const keyword = (insertFunctionArgs.value[index] ?? '').trim().toLowerCase();
  return messagePathOptions(functionInsertSourceText()).filter((item) => !keyword || item.value.toLowerCase().includes(keyword));
}
function filterInsertFunctionOption(input: string, option: { value?: unknown }) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  const item = insertFunctions.value.find((row) => row.name === option.value);
  if (!item) return false;
  return item.name.toLowerCase().includes(keyword) || (item.description ?? '').toLowerCase().includes(keyword);
}
const insertFieldOptions = computed(() =>
  dataFunctionFieldOptions(selectedInsertFunction.value?.config).map((value) => ({ value })),
);
const functionInsertPreview = computed(() => {
  const call = `\${${insertFunctionName.value || '函数名'}(${insertFunctionArgs.value.join(', ')})`;
  if (selectedInsertFunction.value?.type !== 'sql') return `${call}}`;
  const field = insertFunctionField.value.trim();
  return `${call}.${field || '字段'}}`;
});
watch(selectedInsertFunction, (fn) => {
  insertFunctionArgs.value = (fn?.params ?? []).map((_, index) => insertFunctionArgs.value[index] ?? '');
  insertFunctionField.value = '';
});
const editorText = ref('');
const lastStoreText = ref('');
const autoSaveTimer = ref<number | null>(null);
const autoSaveInFlight = ref(false);
const generationProfileSaveTimer = ref<number | null>(null);
const syncingFromStore = ref(false);
const panelActive = ref(true);
const generateModalOpen = ref(false);
const exampleExpandModalOpen = ref(false);
const historyDrawerOpen = ref(false);
const moreMenuOpen = ref(false);
const dataFunctionModalOpen = ref(false);
const databaseConnectionModalOpen = ref(false);
const environmentModalOpen = ref(false);
const generationProfile = reactive<ApiDocGenerationProfile>({
  serviceProperty: 'query_non_accounting',
  transport: 'http',
  messageFormat: 'json',
  exampleMessage: '',
  channels: [],
});
const selectedChannelIds = ref<string[]>([]);
const largePayloadEnabled = ref(false);
const largePayloadFieldPath = ref<string | undefined>(undefined);
const largePayloadFieldOptions = computed(() => {
  const section = sections.value.find((item) => item.title === '请求报文');
  if (!section || section.rows.length < 2) return [];
  const header = section.rows[0] ?? [];
  const pathIndex = Math.max(0, header.findIndex((cell) => cell.includes('节点路径')));
  const codeIndex = Math.max(1, header.findIndex((cell) => cell.includes('节点代码')));
  const nameIndex = header.findIndex((cell) => cell.includes('节点名称'));
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const row of section.rows.slice(1)) {
    const path = (row[pathIndex] ?? '').trim().replace(/\/$/, '');
    const code = (row[codeIndex] ?? '').trim();
    if (!path || !code) continue;
    const value = `${path}/${code}`;
    if (seen.has(value)) continue;
    seen.add(value);
    const name = nameIndex >= 0 ? (row[nameIndex] ?? '').trim() : '';
    options.push({ label: name ? `${value}（${name}）` : value, value });
  }
  return options;
});
const stepLibrary = ref<ApiStepLibraryRow[]>([]);
const stepLibraryPage = ref(1);
const stepLibraryPageSize = 10;
const pagedStepLibrary = computed(() => stepLibrary.value.slice((stepLibraryPage.value - 1) * stepLibraryPageSize, stepLibraryPage.value * stepLibraryPageSize));
const stepLibraryPagination = computed(() => ({ current: stepLibraryPage.value, pageSize: stepLibraryPageSize, total: stepLibrary.value.length, onChange: (page: number) => { stepLibraryPage.value = page; } }));
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
const stepLibraryOpen = ref(false);
const stepEditOpen = ref(false);
const stepDebugging = ref(false);
const stepDebugResultOpen = ref(false);
const stepDebugResult = ref<DebugRunResult | null>(null);
const editingStepId = ref('');
const beforeStepIds = ref<string[]>([]);
const afterStepIds = ref<string[]>([]);
const beforeStepSearch = ref('');
const afterStepSearch = ref('');
type LibraryExportRow = { rowId: string; name: string; source: 'body' | 'header' | 'status' | 'request'; expression: string; required: boolean };
const exportSourceOptions = [
  { label: '响应体', value: 'body' },
  { label: '请求体', value: 'request' },
  { label: '响应头', value: 'header' },
  { label: '状态码', value: 'status' },
];
type LibraryBodyFormat = 'json' | 'xml' | 'text';
const stepEditTabs = [
  { key: 'request' as const, label: '请求报文' },
  { key: 'assertion' as const, label: '断言' },
  { key: 'variables' as const, label: '变量提取' },
];
const stepEditTab = ref<'request' | 'assertion' | 'variables'>('request');
const stepRequestTab = ref<'params' | 'body' | 'headers'>('body');
const stepRequestView = ref<'template' | 'curl'>('template');
const libraryRequestConfigExpanded = ref(false);
const libraryDebugRunning = ref(false);
const libraryGeneratingAssertions = ref(false);
const libraryAssertionError = ref('');
const stepBodyCursor = reactive({ start: 0, end: 0 });
const hasStepBodyCursor = ref(false);
function rememberStepBodyCursor(event: Event) { const input = event.target as HTMLTextAreaElement; stepBodyCursor.start = input.selectionStart; stepBodyCursor.end = input.selectionEnd; hasStepBodyCursor.value = true; }
const stepEdit = reactive({ name: '', environmentId: '', serviceId: '', targetName: '', address: '', protocol: 'http' as 'http' | 'socket', method: 'POST', path: '/', encoding: 'UTF-8', bodyFormat: 'json' as LibraryBodyFormat, body: '{}', bodyDrafts: { json: '{}', xml: '<Transaction></Transaction>', text: '' } as Record<LibraryBodyFormat, string>, queryRows: [createEmptyKeyValueRow()] as KeyValueRow[], headerRows: [createEmptyKeyValueRow()] as KeyValueRow[], assertionRows: [] as AssertionRow[], exports: [] as LibraryExportRow[] });
function shellQuote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'`; }
function buildLibraryDebugRequest(): ApiCaseRequest {
  const body = stepEdit.bodyFormat === 'json' ? JSON.parse(stepEdit.body || '{}') : stepEdit.body;
  const toRecord = (rows: KeyValueRow[]) => Object.fromEntries(rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]));
  return { method: stepEdit.protocol === 'socket' ? 'POST' : stepEdit.method, path: stepEdit.protocol === 'socket' ? '' : stepEdit.path || '/', transport: stepEdit.protocol === 'socket' ? 'tcp' : 'http', contentType: stepEdit.bodyFormat === 'json' ? 'application/json' : stepEdit.bodyFormat === 'xml' ? 'application/xml' : 'text/plain', encoding: stepEdit.encoding, query: stepEdit.protocol === 'http' ? toRecord(stepEdit.queryRows) : undefined, headers: toRecord(stepEdit.headerRows), body };
}
const libraryFullRequestAddress = computed(() => {
  const services = apiStore.environmentServices[stepEdit.environmentId] ?? [];
  const service = services.find((item) => item.id === stepEdit.serviceId);
  if (stepEdit.protocol !== 'http') {
    return service?.serverAddress || (service?.host && service.port ? `${service.host}:${service.port}` : '') || stepEdit.address;
  }
  const environment = apiStore.environments.find((item) => item.id === stepEdit.environmentId);
  let baseUrl = service?.baseUrl?.trim() || service?.serverAddress?.trim() || environment?.baseUrl?.trim() || stepEdit.address.trim() || '';
  if (!baseUrl) return '';
  if (service?.pathPrefix?.trim() && !service.baseUrl?.trim() && !service.serverAddress?.trim()) {
    baseUrl = `${baseUrl.replace(/\/$/, '')}/${service.pathPrefix.replace(/^\//, '')}`;
  }
  const query = new URLSearchParams(stepEdit.queryRows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value])).toString();
  const url = `${baseUrl.replace(/\/$/, '')}/${(stepEdit.path.trim() || '/').replace(/^\//, '')}`;
  return query ? `${url}?${query}` : url;
});
const libraryCurlCommand = computed(() => {
  const request = buildLibraryDebugRequest();
  const parts = [`curl --request ${request.method || 'GET'}`, shellQuote(libraryFullRequestAddress.value || request.path || '/')];
  for (const [key, value] of Object.entries(request.headers ?? {})) parts.push(`--header ${shellQuote(`${key}: ${value}`)}`);
  if (request.body !== undefined && request.body !== null && request.body !== '') {
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    parts.push(`--data-raw ${shellQuote(body)}`);
  }
  return parts.join(' \\\n  ');
});
async function copyLibraryCurl() { await copyText(libraryCurlCommand.value); message.success('cURL 已复制'); }
function countFilledRows(rows: KeyValueRow[]) { return rows.filter((row) => row.key.trim()).length; }
const libraryRequestTabs = computed(() => {
  if (stepEdit.protocol === 'http') {
    const tabs: Array<{ key: 'params' | 'body' | 'headers'; label: string; count: number }> = [{ key: 'params', label: 'Params', count: countFilledRows(stepEdit.queryRows) }];
    if (httpMethodHasBody(stepEdit.method as HttpMethod)) tabs.push({ key: 'body', label: 'Body', count: 1 });
    tabs.push({ key: 'headers', label: 'Headers', count: countFilledRows(stepEdit.headerRows) });
    return tabs;
  }
  return [
    { key: 'body' as const, label: 'Body', count: 1 },
    { key: 'headers' as const, label: 'Headers', count: countFilledRows(stepEdit.headerRows) },
  ];
});
function variableReference(name: string) { return `{{${name}}}`; }
function beautifyLibraryBody() { try { stepEdit.body = stepEdit.bodyFormat === 'json' ? JSON.stringify(JSON.parse(stepEdit.body), null, 2) : beautifyRequestBodyXml(stepEdit.body); } catch { message.warning('报文格式不正确'); } }
watch(() => stepEdit.protocol, (protocol) => {
  if (protocol === 'socket') {
    stepRequestTab.value = 'body';
    stepRequestView.value = 'template';
  }
});
const libraryProtocolOptions = [{ value: 'http', label: 'HTTP' }, { value: 'socket', label: 'SOCKET' }];
const libraryMethodOptions = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value }));
const libraryEncodingOptions = ['UTF-8', 'GBK'].map((value) => ({ value, label: value }));
const libraryBodyFormatOptions = [{ value: 'json', label: 'JSON' }, { value: 'xml', label: 'XML' }, { value: 'text', label: 'Text' }];
function switchLibraryBodyFormat(format: 'json' | 'xml' | 'text') { stepEdit.bodyDrafts[stepEdit.bodyFormat] = stepEdit.body; stepEdit.bodyFormat = format; stepEdit.body = stepEdit.bodyDrafts[format]; }
const libraryVariableInsertOpen = ref(false);
const libraryVariableName = ref('');
const libraryVariableOptions = computed(() => {
  const variables = new Map<string, string>();
  for (const row of stepLibrary.value) {
    if (row.id === editingStepId.value) continue;
    for (const item of row.step.exports ?? []) {
      if (!item.name?.trim()) continue;
      variables.set(item.name.trim(), `${row.name} · ${item.name.trim()}`);
    }
  }
  return [...variables].map(([value, label]) => ({ label, value }));
});
function openLibraryVariableInsert() { libraryVariableName.value = libraryVariableOptions.value[0]?.value ?? ''; libraryVariableInsertOpen.value = true; }
const libraryVariablePreview = computed(() => (libraryVariableName.value ? variableReference(libraryVariableName.value) : ''));
function insertLibraryVariable() {
  if (!libraryVariableName.value) return message.warning('请选择变量');
  const expression = `{{${libraryVariableName.value}}}`;
  stepEdit.body = `${stepEdit.body.slice(0, stepBodyCursor.start)}${expression}${stepEdit.body.slice(stepBodyCursor.end)}`;
  libraryVariableInsertOpen.value = false;
}
const libraryEnvironmentOptions = computed(() => apiStore.environments.filter((row) => row.enabled).map((row) => ({ label: row.name, value: row.id })));
const libraryServiceOptions = computed(() => (apiStore.environmentServices[stepEdit.environmentId] ?? []).filter((row) => row.enabled).map((row) => ({ label: `${row.name} · ${row.serverAddress || row.baseUrl || `${row.host ?? ''}:${row.port ?? ''}`}`, value: row.id })));
const stepLibraryOptions = computed(() => stepLibrary.value.map((row) => ({ label: row.name, value: row.id })));
const availableBeforeOptions = computed(() => stepLibraryOptions.value.filter((item) => !beforeStepIds.value.includes(item.value) && !afterStepIds.value.includes(item.value)));
const availableAfterOptions = computed(() => stepLibraryOptions.value.filter((item) => !beforeStepIds.value.includes(item.value) && !afterStepIds.value.includes(item.value)));
function libraryStepName(id: string) { return stepLibrary.value.find((row) => row.id === id)?.name ?? '已删除步骤'; }
function addBeforeStep(id?: string) { if (id) beforeStepIds.value.push(id); beforeStepSearch.value = ''; }
function addAfterStep(id?: string) { if (id) afterStepIds.value.push(id); afterStepSearch.value = ''; }
function moveSelectedStep(ids: string[], index: number, offset: number) { const next = index + offset; [ids[index], ids[next]] = [ids[next], ids[index]]; }
async function refreshStepLibrary() { stepLibrary.value = await listStepLibrary(); stepLibraryPage.value = 1; }
async function prepareLibraryStepEditor() { if (projectId.value && !apiStore.environments.length) await apiStore.refreshEnvironments(projectId.value); stepEditTab.value = 'request'; stepEditOpen.value = true; }
async function quickAddLibraryStep() { const step: ApiCaseStep = { id: randomUuid(), name: `步骤 ${stepLibrary.value.length + 1}`, request: { method: 'POST', path: '/' }, expected: {}, exports: [] }; await saveStepLibrary({ name: step.name, step }); await refreshStepLibrary(); }
function stepLibraryRowProps(record: ApiStepLibraryRow) { return { onClick: () => void editLibraryStep(record) }; }
function copyLibraryStepRecord(record: ApiStepLibraryRow) { copyStepToClipboard(record.step); message.success('步骤已复制，可在案例步骤列表粘贴'); }
async function editLibraryStep(row: ApiStepLibraryRow) {
  const request = row.step.request;
  const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}, null, 2);
  const bodyFormat = request.contentType?.includes('xml') ? 'xml' : request.contentType?.includes('text/plain') ? 'text' : 'json';
  const toRows = (record?: Record<string, string | number | boolean>) => Object.entries(record ?? {}).map(([key, value]) => ({ id: randomUuid(), key, value: String(value) }));
  stepRequestTab.value = 'body';
  stepRequestView.value = 'template';
  Object.assign(stepEdit, { name: row.name, environmentId: '', serviceId: '', targetName: row.step.target?.name ?? '', address: row.step.target?.address ?? '', protocol: request.transport === 'tcp' ? 'socket' : 'http', method: request.method || 'POST', path: request.path || '/', encoding: request.encoding || request.framing?.encoding || 'UTF-8', bodyFormat, body, bodyDrafts: { json: bodyFormat === 'json' ? body : '{}', xml: bodyFormat === 'xml' ? body : '<Transaction></Transaction>', text: bodyFormat === 'text' ? body : '' }, queryRows: toRows(request.query), headerRows: toRows(request.headers), assertionRows: assertionsToRows(row.step.expected.assertions), exports: row.step.exports.map((item) => ({ rowId: randomUuid(), name: item.name, source: item.source, expression: item.expression ?? '', required: item.required ?? false })) });
  editingStepId.value = row.id;
  await prepareLibraryStepEditor();
  if (!projectId.value || !stepEdit.address) return;
  for (const environment of apiStore.environments) {
    await apiStore.refreshEnvironmentServices(projectId.value, environment.id);
    const service = (apiStore.environmentServices[environment.id] ?? []).find((item) => {
      const address = item.serverAddress || item.baseUrl || (item.host && item.port ? `${item.host}:${item.port}` : '');
      return address === stepEdit.address && (!stepEdit.targetName || item.name === stepEdit.targetName);
    });
    if (service) {
      stepEdit.environmentId = environment.id;
      stepEdit.serviceId = service.id;
      return;
    }
  }
}
async function onLibraryEnvironmentChange(id: string) { stepEdit.serviceId = ''; stepEdit.address = ''; if (projectId.value) await apiStore.refreshEnvironmentServices(projectId.value, id); }
function onLibraryServiceChange(id: string) { const service = (apiStore.environmentServices[stepEdit.environmentId] ?? []).find((row) => row.id === id); if (!service) return; stepEdit.targetName = service.name; stepEdit.address = service.serverAddress || service.baseUrl || (service.host && service.port ? `${service.host}:${service.port}` : ''); stepEdit.protocol = service.transport === 'tcp' ? 'socket' : 'http'; }
function addLibraryExport() { stepEdit.exports.push({ rowId: randomUuid(), name: '', source: 'body', expression: '', required: true }); }
async function saveLibraryStep() { if (!stepEdit.name.trim() || !stepEdit.address.trim()) return message.warning('请填写步骤名称并选择环境地址'); try { const body = stepEdit.bodyFormat === 'json' ? JSON.parse(stepEdit.body || '{}') : stepEdit.body; const toRecord = (rows: KeyValueRow[]) => Object.fromEntries(rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value])); const step: ApiCaseStep = { id: randomUuid(), name: stepEdit.name.trim(), target: { name: stepEdit.targetName, address: stepEdit.address }, request: { method: stepEdit.protocol === 'socket' ? 'POST' : stepEdit.method, path: stepEdit.protocol === 'socket' ? '' : stepEdit.path || '/', transport: stepEdit.protocol === 'socket' ? 'tcp' : 'http', contentType: stepEdit.bodyFormat === 'json' ? 'application/json' : stepEdit.bodyFormat === 'xml' ? 'application/xml' : 'text/plain', encoding: stepEdit.encoding, query: stepEdit.protocol === 'http' ? toRecord(stepEdit.queryRows) : undefined, headers: toRecord(stepEdit.headerRows), body, bodyText: stepEdit.bodyFormat === 'json' ? stepEdit.body : undefined }, expected: buildExpectedFromRows(stepEdit.assertionRows), exports: stepEdit.exports.filter((item) => item.name.trim()).map(({ name, source, expression, required }) => ({ name: name.trim(), source, expression: source === 'status' ? undefined : expression.trim(), required })) }; await saveStepLibrary({ name: step.name, step }, editingStepId.value || undefined); stepEditOpen.value = false; await refreshStepLibrary(); } catch { message.error('请求报文格式不正确'); } }
async function runLibraryDebug() {
  if (!projectId.value || !transactionId.value) return null;
  if (!stepEdit.address.trim()) { message.warning('请先选择环境地址'); return null; }
  let request: ReturnType<typeof buildLibraryDebugRequest>;
  try { request = buildLibraryDebugRequest(); } catch { message.error('请求报文格式不正确'); return null; }
  try {
    stepDebugging.value = true;
    return await debugRunCase(projectId.value, transactionId.value, { request, expected: buildExpectedFromRows(stepEdit.assertionRows), target: { name: stepEdit.targetName, address: stepEdit.address } });
  } catch (error) { message.error(error instanceof Error ? error.message : '调试失败'); return null; }
  finally { stepDebugging.value = false; }
}
async function debugLibraryStep() {
  const result = await runLibraryDebug();
  if (result) {
    stepDebugResult.value = result;
    stepDebugResultOpen.value = true;
  }
}
async function onLibraryGenerateAssertions() {
  if (!projectId.value || !transactionId.value) return;
  if (!stepEdit.address.trim()) return message.warning('请先选择环境地址');
  libraryAssertionError.value = '';
  libraryDebugRunning.value = true;
  try {
    const result = await debugRunCase(projectId.value, transactionId.value, { request: buildLibraryDebugRequest(), expected: buildExpectedFromRows(stepEdit.assertionRows), target: { name: stepEdit.targetName, address: stepEdit.address } });
    const responseIssue = getDebugResponseIssue(result);
    if (responseIssue) throw new Error(result.error || responseIssue);
    if (stepEdit.assertionRows.some((row) => Boolean(row.type && row.operator))) {
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
    libraryGeneratingAssertions.value = true;
    const transport = stepEdit.protocol === 'socket' ? 'tcp' : 'http';
    const messageFormat = stepEdit.bodyFormat === 'xml' ? 'xml' : stepEdit.bodyFormat === 'text' ? 'text' : 'json';
    const job = await generateAssertions(projectId.value, transactionId.value, { transport, messageFormat, polarity: 'positive', statusCode: result.statusCode, headers: result.headers, body: result.body });
    while (true) {
      const status = await getAssertionGenerateStatus(projectId.value, transactionId.value, undefined, job.jobId);
      if (status.phase === 'completed') break;
      if (status.phase === 'failed' || status.phase === 'cancelled') throw new Error(status.errorMessage || 'AI 生成断言失败');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const { assertions } = await getAssertionGenerateResult(projectId.value, transactionId.value, undefined, job.jobId);
    stepEdit.assertionRows = assertionsToRows(assertions);
    message.success('断言已生成');
  } catch (error) {
    libraryAssertionError.value = `请求未成功，未调用 AI：${error instanceof Error ? error.message : '请检查请求配置'}`;
  } finally {
    libraryDebugRunning.value = false;
    libraryGeneratingAssertions.value = false;
  }
}
const libraryDebugExportOpen = ref(false);
const libraryDebugExportPath = ref('');
const libraryDebugExportName = ref('');
const libraryDebugExportSource = ref<'body' | 'request'>('body');
const libraryDebugExportSourceOptions = [
  { label: '响应体', value: 'body' },
  { label: '请求体', value: 'request' },
];
const libraryDebugResponsePathOptions = ref<Array<{ label: string; value: string }>>([]);
const libraryDebugRequestPathOptions = ref<Array<{ label: string; value: string }>>([]);
const libraryDebugExportPathOptions = computed(() => (libraryDebugExportSource.value === 'request' ? libraryDebugRequestPathOptions.value : libraryDebugResponsePathOptions.value));
async function addLibraryExportFromDebug() {
  const result = await runLibraryDebug();
  if (!result) return;
  const responsePathsList = responsePaths(parseDebugResponseBody(result.body));
  const requestPathsList = responsePaths(parseDebugResponseBody(result.requestBody));
  if (result.error && !requestPathsList.length) return message.warning(`调试请求失败：${result.error}`);
  if (!responsePathsList.length && !requestPathsList.length) return message.warning('请求/响应体中没有识别到 JSON 或 XML 字段');
  libraryDebugResponsePathOptions.value = responsePathsList.map((value) => ({ label: value, value }));
  libraryDebugRequestPathOptions.value = requestPathsList.map((value) => ({ label: value, value }));
  libraryDebugExportSource.value = responsePathsList.length ? 'body' : 'request';
  syncLibraryDebugExportSelection();
  libraryDebugExportOpen.value = true;
}
function syncLibraryDebugExportSelection() {
  libraryDebugExportPath.value = libraryDebugExportPathOptions.value[0]?.value ?? '';
  const pathParts = libraryDebugExportPath.value.split(/[./\[\]]/).filter((item) => item && item !== 'text()');
  libraryDebugExportName.value = pathParts[pathParts.length - 1] ?? '';
}
function onLibraryDebugExportSourceChange() { syncLibraryDebugExportSelection(); }
function confirmLibraryDebugExport() {
  if (!libraryDebugExportPath.value || !libraryDebugExportName.value.trim()) return message.warning('请选择字段并填写变量名');
  if (stepEdit.exports.some((item) => item.name.trim() === libraryDebugExportName.value.trim())) return message.warning('变量名已存在，请换一个');
  stepEdit.exports.push({ rowId: randomUuid(), name: libraryDebugExportName.value.trim(), source: libraryDebugExportSource.value, expression: libraryDebugExportPath.value, required: true });
  libraryDebugExportOpen.value = false;
}
async function removeLibraryStep(id: string) { await deleteStepLibrary(id); await refreshStepLibrary(); }
const channelKeyword = ref('');
const servicePropertyOptions = [
  ['query_non_accounting', '查询类非涉账'], ['query_accounting', '查询类涉账'],
  ['management_non_accounting', '管理类非涉账'], ['management_accounting', '管理类涉账'],
  ['accounting', '记账类'], ['reversal', '冲正类'], ['file', '文件类'], ['push', '推送类'],
].map(([value, label]) => ({ value, label }));
const transportOptions = [{ value: 'http', label: 'HTTP' }, { value: 'socket', label: 'SOCKET' }];
const messageFormatOptions = [{ value: 'json', label: 'JSON' }, { value: 'xml', label: 'XML' }, { value: 'text', label: 'TEXT' }];
const filteredChannels = computed(() => {
  const keyword = channelKeyword.value.trim().toLowerCase();
  if (!keyword) return generationProfile.channels;
  return generationProfile.channels.filter((channel) =>
    [channel.name, channel.clientCd, channel.serviceCd].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
});
const collapsedSections = reactive(
  new Set<string>(
    API_DOC_SECTION_TITLES.filter((title) => title !== '示例报文'),
  ),
);

function isSectionCollapsed(title: string) {
  return collapsedSections.has(title);
}

function toggleSection(title: string) {
  if (collapsedSections.has(title)) {
    collapsedSections.delete(title);
    void nextTick(() => {
      resizeAllDocCellInputs();
      resizeExampleMessageInput();
    });
  } else {
    collapsedSections.add(title);
  }
}

function resetSectionCollapseState() {
  collapsedSections.clear();
  for (const title of API_DOC_SECTION_TITLES) {
    if (title !== '示例报文') {
      collapsedSections.add(title);
    }
  }
}

function visibleSectionData(sectionIndex: number) {
  const page = sectionPages.value[sectionIndex] ?? 1;
  const start = (page - 1) * DOC_TABLE_PAGE_SIZE;
  return sectionData.value[sectionIndex]?.slice(start, start + DOC_TABLE_PAGE_SIZE) ?? [];
}

const projectId = computed(() => apiStore.activeProjectId ?? '');
const transactionId = computed(() => apiStore.activeTransactionId ?? '');
const generatingCases = computed(() =>
  transactionId.value
    ? apiStore.isGeneratingCases(transactionId.value)
    : false,
);

const isSmpSource = computed(() => apiStore.apiDoc?.source === 'smp');

const sourceDocName = computed(() => apiStore.apiDoc?.sourceDocName ?? '');

onActivated(() => {
  panelActive.value = true;
  const pid = projectId.value;
  const tid = transactionId.value;
  if (pid && tid) {
    void apiStore.syncCaseGenerateLoading(pid, tid);
  }
  resizeExampleMessageInput();
});

onDeactivated(() => {
  panelActive.value = false;
  syncExampleMessageToText();
  void flushAutoSave();
});

function loadFromText(text: string) {
  syncingFromStore.value = true;
  const parsed = parseApiDocTableText(text);
  if (!parsed.some((section) => section.title === '示例报文')) {
    parsed.push({ title: '示例报文', rows: [], freeText: '' });
  }
  const exampleSection = parsed.find((section) => section.title === '示例报文');
  const smpRequestBody = apiStore.apiDoc?.smpData?.serviceTestList?.[0] as Record<string, unknown> | undefined;
  exampleMessage.value = exampleSection?.freeText || String(smpRequestBody?.requestBody ?? '');
  hasExampleCursor.value = false;
  const previousTitles = sections.value.map((section) => section.title).join('\u0000');
  const nextTitles = parsed.map((section) => section.title).join('\u0000');
  sections.value = parsed;
  sectionData.value = sections.value.map((section) => sectionTableData(section));
  sectionPages.value = sections.value.map(() => 1);
  editorText.value = serializeApiDocTableText(parsed);
  lastStoreText.value = text;
  // 仅分区结构变化时重置折叠状态，避免 store 回包（自动保存/生成配置保存等）
  // 触发重载时把用户已展开的分区收回
  if (previousTitles !== nextTitles) {
    resetSectionCollapseState();
  }
  syncingFromStore.value = false;
  resizeAllDocCellInputs();
  resizeExampleMessageInput();
}

function onExampleMessageInput(event: Event) {
  const el = event.target;
  if (el instanceof HTMLTextAreaElement && el.classList.contains('example-message-input')) {
    autoResizeExampleTextarea(el);
  }
  syncExampleMessageToText();
  scheduleAutoSave();
}

function onExampleMessageBlur() {
  syncExampleMessageToText();
  void flushAutoSave({ notify: true });
}

async function loadInsertFunctionOptions() {
  const rows = await listDataFunctions(projectId.value);
  insertFunctions.value = rows;
  insertFunctionName.value ||= rows[0]?.name ?? '';
}
async function openFunctionInsert() {
  if (!hasExampleCursor.value) return;
  functionInsertTarget.value = 'example';
  await loadInsertFunctionOptions();
  functionInsertOpen.value = true;
}
async function openStepBodyFunctionInsert() {
  if (!hasStepBodyCursor.value) return;
  functionInsertTarget.value = 'stepBody';
  await loadInsertFunctionOptions();
  functionInsertOpen.value = true;
}

function rememberExampleCursor(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  functionInsertRange.start = input.selectionStart;
  functionInsertRange.end = input.selectionEnd;
  hasExampleCursor.value = true;
}

function insertFunctionExpression() {
  if (!insertFunctionName.value) return message.warning('请选择函数');
  if (selectedInsertFunction.value?.type === 'sql' && !insertFunctionField.value.trim())
    return message.warning('请选择结果字段');
  const expression = functionInsertPreview.value;
  if (functionInsertTarget.value === 'stepBody') {
    stepEdit.body = `${stepEdit.body.slice(0, stepBodyCursor.start)}${expression}${stepEdit.body.slice(stepBodyCursor.end)}`;
    functionInsertOpen.value = false;
    return;
  }
  exampleMessage.value = `${exampleMessage.value.slice(0, functionInsertRange.start)}${expression}${exampleMessage.value.slice(functionInsertRange.end)}`;
  functionInsertOpen.value = false;
  syncExampleMessageToText();
  scheduleAutoSave();
  resizeExampleMessageInput();
  void nextTick(() => {
    const input = resolveExampleMessageInput();
    const cursor = functionInsertRange.start + expression.length;
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  });
}

function onExampleExpandModalOk() {
  syncExampleMessageToText();
  void flushAutoSave({ notify: true });
  exampleExpandModalOpen.value = false;
  resizeExampleMessageInput();
}

function detectExampleMessageFormat(text: string): 'json' | 'xml' | 'text' {
  const trimmed = text.trim();
  if (!trimmed) return 'text';
  if (trimmed.startsWith('<') || trimmed.includes('<?xml')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'text';
}

function beautifyExampleMessage() {
  const raw = exampleMessage.value.trim();
  if (!raw) {
    message.info('示例报文为空');
    return;
  }
  const format = detectExampleMessageFormat(raw);
  try {
    if (format === 'xml') {
      exampleMessage.value = beautifyRequestBodyXml(raw);
    } else if (format === 'json') {
      exampleMessage.value = beautifyCasePayloadJson(raw);
    } else {
      message.info('纯文本示例报文无需美化');
      return;
    }
    syncExampleMessageToText();
    void flushAutoSave();
    message.success('示例报文已美化');
    resizeExampleMessageInput();
  } catch {
    message.error('报文格式不正确，无法美化');
  }
}

function onExampleMessagePaste(event: Event) {
  const el = event.target;
  if (!(el instanceof HTMLTextAreaElement)) return;
  void nextTick(() => {
    void nextTick(() => {
      autoResizeExampleTextarea(el);
    });
  });
}

function resolveExampleMessageInput(): HTMLTextAreaElement | null {
  return (
    tableScrollRef.value?.querySelector('textarea.example-message-input') ?? null
  );
}

function autoResizeExampleTextarea(el: HTMLTextAreaElement) {
  el.style.height = '0px';
  const nextHeight = Math.max(EXAMPLE_MESSAGE_MIN_HEIGHT_PX, el.scrollHeight);
  el.style.height = `${nextHeight}px`;
}

function resizeExampleMessageInput() {
  void nextTick(() => {
    void nextTick(() => {
      const el = resolveExampleMessageInput();
      if (el) {
        autoResizeExampleTextarea(el);
      }
    });
  });
}

function syncExampleMessageToText() {
  const hasExampleSection = sections.value.some(
    (section) => section.title === '示例报文',
  );
  const nextSections = hasExampleSection
    ? sections.value.map((section) => {
        if (section.title === '示例报文') {
          return { ...section, freeText: exampleMessage.value };
        }
        return section;
      })
    : [
        ...sections.value,
        { title: '示例报文', rows: [], freeText: exampleMessage.value },
      ];
  sections.value = nextSections;
  editorText.value = serializeApiDocTableText(nextSections);
}

function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function resizeAllDocCellInputs() {
  void nextTick(() => {
    tableScrollRef.value
      ?.querySelectorAll('textarea.doc-cell-input')
      .forEach((el) => autoResizeTextarea(el as HTMLTextAreaElement));
  });
}

function onCellInput(sectionIndex: number, event: Event) {
  autoResizeTextarea(event.target as HTMLTextAreaElement);
  onTableChange(sectionIndex);
}

function syncTextFromTables() {
  const nextSections = sections.value.map((section, index) => ({
    ...section,
    rows: tableDataToRows(section, sectionData.value[index] ?? []),
  }));
  sections.value = nextSections;
  syncExampleMessageToText();
}

watch(
  () => [projectId.value, transactionId.value] as const,
  ([pid, tid]) => {
    if (!panelActive.value || !pid || !tid) return;
    void apiStore.syncCaseGenerateLoading(pid, tid);
  },
);

watch(
  () => [
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown,
    (apiStore.apiDoc?.smpData?.serviceTestList?.[0] as Record<string, unknown> | undefined)?.requestBody,
  ] as const,
  ([value, smpRequestBody]) => {
    if (!panelActive.value || autoSaveInFlight.value) return;
    const next = value || '';
    // 后端原文与前端序列化稿是同一内容的两种形态，均视为未变化，
    // 否则 apiDoc 对象被任意回包替换时会反复重载并重置折叠状态
    if (next === editorText.value || next === lastStoreText.value) {
      if (!exampleMessage.value && smpRequestBody) {
        exampleMessage.value = String(smpRequestBody);
      }
      return;
    }
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    loadFromText(next);
  },
  { immediate: true },
);

watch(exampleMessage, (value) => {
  generationProfile.exampleMessage = value;
  resizeExampleMessageInput();
});

watch(() => apiStore.apiDoc?.generationProfile, (next) => {
  if (!next) return;
  Object.assign(generationProfile, next, { channels: next.channels.map((channel) => ({ ...channel })) });
}, { immediate: true, deep: true });

watch(
  generationProfile,
  () => {
    if (syncingFromStore.value || !projectId.value || !transactionId.value) return;
    if (generationProfileSaveTimer.value) {
      window.clearTimeout(generationProfileSaveTimer.value);
      generationProfileSaveTimer.value = null;
    }
    if (
      !generationProfile.exampleMessage.trim() ||
      generationProfile.channels.some((channel) => !isChannelComplete(channel))
    ) return;
    if (
      JSON.stringify(generationProfile) ===
      JSON.stringify(apiStore.apiDoc?.generationProfile)
    ) return;
    const saveProjectId = projectId.value;
    const saveTransactionId = transactionId.value;
    generationProfileSaveTimer.value = window.setTimeout(() => {
      generationProfileSaveTimer.value = null;
      if (
        !panelActive.value ||
        saveProjectId !== projectId.value ||
        saveTransactionId !== transactionId.value
      ) return;
      void apiStore
        .saveDocumentGenerationPrompts(saveProjectId, saveTransactionId, {
          ...generationProfile,
          channels: generationProfile.channels.map((channel) => ({ ...channel })),
        })
        .catch((error) => {
          if (saveProjectId === projectId.value && saveTransactionId === transactionId.value) {
            message.error((error as Error)?.message || '渠道数据自动保存失败');
          }
        });
    }, 1200);
  },
  { deep: true },
);

watch(
  () => [apiStore.activeProjectId, apiStore.activeTransactionId] as const,
  () => {
    if (autoSaveTimer.value) {
      window.clearTimeout(autoSaveTimer.value);
      autoSaveTimer.value = null;
    }
    if (generationProfileSaveTimer.value) {
      window.clearTimeout(generationProfileSaveTimer.value);
      generationProfileSaveTimer.value = null;
    }
  },
);


function scheduleAutoSave() {
  if (syncingFromStore.value) return;
  const pid = projectId.value;
  const tid = transactionId.value;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!pid || !tid || editorText.value === saved) return;

  if (autoSaveTimer.value) window.clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = window.setTimeout(() => {
    autoSaveTimer.value = null;
    void flushAutoSave();
  }, 1200);
}

async function flushAutoSave(options?: { notify?: boolean }) {
  if (autoSaveTimer.value) {
    window.clearTimeout(autoSaveTimer.value);
    autoSaveTimer.value = null;
  }
  if (syncingFromStore.value || autoSaveInFlight.value) return;
  const pid = projectId.value;
  const tid = transactionId.value;
  const saved =
    apiStore.apiDoc?.tempStructuredMarkdown ?? apiStore.apiDoc?.structuredMarkdown ?? '';
  if (!pid || !tid || editorText.value === saved) return;

  autoSaveInFlight.value = true;
  try {
    await apiStore.autoSave(pid, tid, editorText.value, {
      successMessage: options?.notify ? '已自动保存' : undefined,
    });
  } catch (error) {
    message.error((error as Error)?.message || '自动保存失败');
  } finally {
    autoSaveInFlight.value = false;
    scheduleAutoSave();
  }
}

function onTableChange(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  syncTextFromTables();
  scheduleAutoSave();
}

function handleCellBlur(sectionIndex: number) {
  if (syncingFromStore.value) return;
  const section = sections.value[sectionIndex];
  if (!section) return;
  section.rows = tableDataToRows(section, sectionData.value[sectionIndex] ?? []);
  syncTextFromTables();
  void flushAutoSave({ notify: true });
}

const canSave = computed(() => Boolean(editorText.value.trim()));

const onMoreMenuClick: MenuProps['onClick'] = ({ key }) => {
  moreMenuOpen.value = false;
  if (key === 'data-functions') {
    dataFunctionModalOpen.value = true;
  }
  if (key === 'database-connections') {
    databaseConnectionModalOpen.value = true;
  }
  if (key === 'step-library') {
    stepLibraryOpen.value = true;
    void refreshStepLibrary();
  }
  if (key === 'environments') {
    environmentModalOpen.value = true;
  }
};

const onUpload: UploadProps['beforeUpload'] = (file) => {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return false;

  if (apiStore.loading) {
    message.warning('文档处理中，请稍后再上传');
    return false;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['xls', 'xlsx'].includes(extension)) {
    message.warning('仅支持上传 xls、xlsx 格式的接口文档');
    return false;
  }

  if (apiStore.apiDoc?.sourceDocName) {
    Modal.confirm({
      title: '重新上传接口文档？',
      content: '继续上传将覆盖原文件并重新结构化，已有案例需重新 AI 生成，是否继续？',
      okText: '覆盖上传',
      cancelText: '取消',
      centered: true,
      onOk: () => apiStore.uploadDocument(pid, tid, file as File, true),
    });
    return false;
  }

  void apiStore.uploadDocument(pid, tid, file as File);
  return false;
};

async function onGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;

  generationProfile.exampleMessage = exampleMessage.value.trim();
  selectedChannelIds.value = selectedChannelIds.value.filter((id) => generationProfile.channels.some((channel) => channel.id === id));
  generateModalOpen.value = true;
  void refreshStepLibrary();
}

function addChannel() {
  generationProfile.channels.push({ id: randomUuid(), name: '', clientCd: '', serviceCd: '' });
}

async function importChannels(file: File) {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('文件中没有工作表');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const imported = rows.map((row) => ({
      id: randomUuid(),
      name: String(row['渠道名称'] ?? row.name ?? row.channelName ?? '').trim(),
      clientCd: String(row.clientCd ?? row['客户端代码'] ?? '').trim(),
      serviceCd: String(row.serviceCd ?? row['服务代码'] ?? '').trim(),
    })).filter(isChannelComplete);
    if (!imported.length) throw new Error('未识别到完整的渠道名称、clientCd、serviceCd');
    const keys = new Set(generationProfile.channels.map((channel) =>
      `${channel.name}\u0000${channel.clientCd}\u0000${channel.serviceCd}`,
    ));
    const added = imported.filter((channel) => {
      const key = `${channel.name}\u0000${channel.clientCd}\u0000${channel.serviceCd}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    generationProfile.channels.push(...added);
    message.success(`已导入 ${added.length} 条渠道${added.length < imported.length ? '，重复项已忽略' : ''}`);
  } catch (error) {
    message.error((error as Error).message || '渠道导入失败');
  }
  return false;
}

function removeChannel(id: string) {
  const index = generationProfile.channels.findIndex((channel) => channel.id === id);
  if (index < 0) return;
  const [removed] = generationProfile.channels.splice(index, 1);
  if (removed) selectedChannelIds.value = selectedChannelIds.value.filter((id) => id !== removed.id);
}

function toggleChannel(id: string, checked: boolean) {
  const channel = generationProfile.channels.find((item) => item.id === id);
  if (checked && (!channel || !isChannelComplete(channel))) return;
  selectedChannelIds.value = checked
    ? [...new Set([...selectedChannelIds.value, id])]
    : selectedChannelIds.value.filter((channelId) => channelId !== id);
}

function isChannelComplete(channel: ApiDocGenerationProfile['channels'][number]) {
  return Boolean(channel.name.trim() && channel.clientCd.trim() && channel.serviceCd.trim());
}

watch(
  () => generationProfile.channels.map((channel) => [channel.id, channel.name, channel.clientCd, channel.serviceCd]),
  () => {
    selectedChannelIds.value = selectedChannelIds.value.filter((id) => {
      const channel = generationProfile.channels.find((item) => item.id === id);
      return Boolean(channel && isChannelComplete(channel));
    });
  },
  { deep: true },
);

function onCloseGenerateModal() {
  generateModalOpen.value = false;
}

function onCancelGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  void apiStore.cancelCaseGenerate(pid, tid);
}

function onConfirmGenerate() {
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;

  generationProfile.exampleMessage = exampleMessage.value.trim();
  if (!generationProfile.exampleMessage) {
    message.warning('请先填写示例报文');
    return;
  }
  if (generationProfile.channels.some((channel) => !channel.name.trim() || !channel.clientCd.trim() || !channel.serviceCd.trim())) {
    message.warning('请完整填写渠道名称、clientCd 和 serviceCd');
    return;
  }
  if (largePayloadEnabled.value && !largePayloadFieldPath.value) {
    message.warning('请选择大报文测试字段');
    return;
  }
  apiStore.markCaseGenerateStarted(tid);
  generateModalOpen.value = false;

  void (async () => {
    try {
      await apiStore.saveDocumentGenerationPrompts(pid, tid, {
        ...generationProfile,
        channels: generationProfile.channels.map((channel) => ({ ...channel })),
      });
      runGenerate(pid, tid);
    } catch {
      apiStore.markCaseGenerateEnded(tid);
      message.error('启动案例生成失败，请稍后重试');
    }
  })();
}

function runGenerate(pid: string, tid: string) {
  void apiStore.generateCases(pid, tid, {
    channelIds: [...selectedChannelIds.value],
    beforeSteps: beforeStepIds.value.map((id) => cloneJson(stepLibrary.value.find((row) => row.id === id)!.step)),
    afterSteps: afterStepIds.value.map((id) => cloneJson(stepLibrary.value.find((row) => row.id === id)!.step)),
    largePayloadFieldPath: largePayloadEnabled.value ? largePayloadFieldPath.value : undefined,
    navigateToCases: true,
  });
}

async function onSave() {
  syncTextFromTables();
  const pid = projectId.value;
  const tid = transactionId.value;
  if (!pid || !tid) return;
  await apiStore.saveDocument(pid, tid, editorText.value);
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
.document-panel-header {
  align-items: flex-start;
}

.document-panel-intro {
  min-width: 0;
}

.document-panel-toolbar {
  flex-shrink: 0;
}

.document-panel-desc {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.doc-source-row {
  margin-top: 8px;
  min-width: 0;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.5;
}

.doc-source-link,
.doc-source-name {
  display: block;
  overflow: hidden;
  color: #667085;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-source-link:hover {
  color: var(--cf-brand, #b60f2d);
}

.generate-modal-alert {
  margin-bottom: 12px;
}

.generate-modal-hint {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.document-panel-alert {
  margin: 12px 12px 0;
}

.document-panel-alert :deep(.ant-alert-message) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readiness-endpoint-tag {
  margin-right: 8px;
  color: #d48806;
}

.generate-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: calc(100vh - 260px);
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.generation-profile-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.step-orchestration {
  margin-bottom: 16px;
  border: 1px solid #d9dde5;
  background: #fafbfc;
}

.large-payload-body {
  padding: 10px 12px;
}

.step-library-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.step-library-table-scroll {
  max-height: min(56vh, 520px);
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.step-library-table :deep(.ant-table-thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f7f8fa;
}

.step-library-table :deep(.ant-table-tbody > tr > td) {
  padding: 9px 12px;
}

.step-library-table :deep(.ant-table-tbody > tr) {
  cursor: pointer;
}

.step-library-table :deep(.ant-table-tbody > tr:hover > td) {
  background: #fff8f8;
}

.step-library-address { overflow: hidden; color: #667085; text-overflow: ellipsis; white-space: nowrap; }
.step-library-order { color: #c8102e; font-weight: 700; }
.step-library-actions { display: flex; justify-content: center; gap: 2px; }
.step-library-actions .ant-btn { width: 28px; height: 28px; padding: 0; border-radius: 4px; }
.step-library-empty { padding: 48px 0; border: 1px dashed #d0d5dd; border-radius: 6px; background: #fafbfc; }

.step-orchestration-head,
.step-lane-head,
.step-sequence-row,
.ai-step-anchor {
  display: flex;
  align-items: center;
}

.step-orchestration-head {
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e4e7ec;
  background: #fff;
}

.step-orchestration-head div,
.ai-step-anchor div {
  display: flex;
  flex-direction: column;
}

.step-orchestration-head span,
.ai-step-anchor span {
  color: #7a8290;
  font-size: 12px;
}

.step-lane {
  padding: 10px 12px;
}

.step-lane-head {
  justify-content: space-between;
  margin-bottom: 6px;
  color: #3f4652;
  font-weight: 600;
}

.step-lane-head :deep(.ant-select) {
  width: 180px;
}

.step-lane-list {
  display: grid;
  gap: 4px;
}

.step-sequence-row {
  min-height: 34px;
  padding: 2px 4px 2px 8px;
  border: 1px solid #e4e7ec;
  background: #fff;
}

.step-sequence-index {
  width: 24px;
  color: #8b000f;
  font-weight: 700;
}

.step-sequence-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-lane-empty {
  padding: 8px;
  border: 1px dashed #d9dde5;
  color: #969eaa;
  text-align: center;
}

.ai-step-anchor {
  gap: 10px;
  margin: 0 12px;
  padding: 9px 12px;
  border-left: 3px solid #1677ff;
  background: #edf5ff;
  color: #174b82;
}

.ai-step-anchor div {
  flex: 1;
}








.step-debug-result { display: grid; gap: 12px; }
.step-debug-summary { display: flex; align-items: center; gap: 12px; color: #606875; }
.step-debug-result pre { max-height: 480px; overflow: auto; padding: 12px; border: 1px solid #e1e4e9; background: #fafbfc; white-space: pre-wrap; }

/* 与案例侧步骤编辑器（ApiCaseWorkbench）保持一致的面板样式 */
.case-step-name-field { margin-bottom: 12px; }
.case-step-detail-tabs { display: flex; margin-bottom: 12px; border-bottom: 1px solid #eaecf0; }
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
.case-editor-main-tab.active { color: #7f1d1d; font-weight: 600; }
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
.case-editor-panel { min-width: 0; }
.case-request-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: visible; }
.case-request-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #eaecf0;
  background: #fff;
}
.case-assertion-shell { border: 1px solid #eaecf0; background: #fff; }
.case-assertion-panel .case-assertion-shell { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
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
.case-request-summary--clickable { cursor: pointer; user-select: none; }
.case-request-summary--clickable:hover { background: #f2f4f7; }
.case-request-summary-method { color: #b50930; font-weight: 700; }
.case-request-summary-url {
  overflow: hidden;
  color: #344054;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.case-request-summary-encoding { color: #667085; font-size: 12px; }
.request-config-chevron { margin-left: 4px; transition: transform 0.2s; }
.request-config-chevron.is-open { transform: rotate(180deg); }
.case-request-config-block { background: #fafbfc; }
.case-target-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 10px 12px;
  border-bottom: 1px solid #eaecf0;
}
.case-protocol-field--target :deep(.ant-select) { width: 100%; }
.case-protocol-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
}
.case-protocol-bar--http .case-protocol-field--grow { grid-row: 2; grid-column: 2; }
.case-protocol-bar--http .case-protocol-field--encoding { grid-row: 2; grid-column: 1; }
.case-protocol-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.case-protocol-label { font-size: 12px; color: #667085; text-align: right; white-space: nowrap; }
.case-protocol-select { width: 100%; min-width: 0; }
.case-request-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid #f2f4f7;
  flex-shrink: 0;
}
.case-request-tabs { display: flex; gap: 2px; min-width: 0; }
.case-request-tab {
  position: relative;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 12px;
  cursor: pointer;
}
.case-request-tab.active { color: #7f1d1d; font-weight: 600; }
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
.case-request-view-switch { display: flex; margin-left: auto; border: 1px solid #d0d5dd; }
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
.case-curl-panel { display: flex; min-height: 320px; flex-direction: column; border: 1px solid #eaecf0; background: #fff; }
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
.case-payload-fields { flex: 1; display: flex; flex-direction: column; gap: 0; min-height: 0; overflow: hidden; }
.case-payload-fields--body { padding: 12px; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.case-payload-fields--body :deep(.kv-rows-editor) { flex: 1; min-height: 0; }
.case-body-panel { min-width: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.case-request-panel .case-body-panel,
.case-request-panel .case-editor-surface { min-height: 0; }
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
.case-editor-chrome-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.case-editor-content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.case-editor-beautify-btn { flex-shrink: 0; height: auto; padding: 0 4px; font-size: 12px; }
.case-body-format-bar { display: inline-flex; border: 1px solid #d0d5dd; overflow: hidden; background: #fff; }
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
.case-body-format-btn:last-child { border-right: none; }
.case-body-format-btn.active { background: #7f1d1d; color: #fff; }
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
.case-payload-textarea--expand {
  display: block;
  width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: auto;
  border-radius: 0 !important;
}
.case-payload-textarea--expand.case-xml-editor { white-space: pre; }
.case-json-editor { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.6; }
.case-xml-editor { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.5; }
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
.case-assertion-toolbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; flex: 1; }
.case-assertion-error {
  margin: 12px 12px 0;
  padding: 8px 10px;
  border: 1px solid #fecdca;
  background: #fef3f2;
  color: #b42318;
  font-size: 12px;
}
.case-debug-assertion-editor { flex: 1; min-height: 0; margin: 12px; overflow: auto; }
.case-step-response-list { flex: 1; min-height: 0; max-height: none; overflow: auto; }
.case-step-response-list :deep(.ant-table) { min-width: 640px; }
.case-step-modal-footer {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: auto 1fr auto auto;
  gap: 10px;
  align-items: center;
  margin: 20px -24px 0;
  padding: 14px 24px;
  border-top: 1px solid #eaecf0;
  background: #fafbfc;
}
:global(.step-editor-modal .ant-modal) { top: 4vh; max-width: calc(100vw - 32px); }
:global(.step-editor-modal .ant-modal-content) { display: flex; flex-direction: column; height: 92vh; max-height: 92vh; overflow: hidden; border-radius: 10px; }
:global(.step-editor-modal .ant-modal-body) { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; padding: 20px 24px 0; }
:global(.step-editor-modal .case-step-name-field),
:global(.step-editor-modal .case-step-detail-tabs) { flex-shrink: 0; }
:global(.step-editor-modal .case-request-panel),
:global(.step-editor-modal .case-assertion-panel) { flex: 1; min-height: 0; height: auto; }
:global(.step-editor-modal .case-assertion-panel) { display: flex; flex: 1; min-height: 0; height: auto; overflow: hidden; }
:global(.step-editor-modal .case-assertion-shell) { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
:global(.step-editor-modal .assertion-rows-editor) { min-height: 0; height: 100%; }
:global(.step-editor-modal .assertion-rows-body) { flex: 1; min-height: 0; max-height: none; overflow: auto; }

@media (max-width: 900px) {
  .case-request-summary { grid-template-columns: auto minmax(0, 1fr) auto; }
  .case-request-summary-encoding { display: none; }
  .case-target-bar { grid-template-columns: 1fr; }
  .case-protocol-bar { grid-template-columns: 1fr; }
}

.channel-editor-columns,
.channel-editor-row {
  display: grid;
  align-items: center;
  gap: 8px;
}

.channel-panel {
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #fff;
}

.channel-editor-list {
  max-height: min(320px, 38vh);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.channel-search {
  width: 260px;
}

.channel-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
}

.channel-editor-header strong,
.channel-editor-header span {
  display: block;
}

.channel-editor-header span {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
}

.channel-editor-actions {
  display: flex;
  gap: 8px;
}

.channel-add-btn {
  color: #475467;
  font-weight: 500;
}

.channel-add-btn:hover {
  background: #f2f4f7;
  color: var(--cf-brand, #b60f2d);
}

.channel-editor-columns,
.channel-editor-row {
  grid-template-columns: 42px minmax(150px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 42px;
}

.channel-editor-columns {
  padding: 7px 12px;
  border-top: 1px solid #eaecf0;
  border-bottom: 1px solid #eaecf0;
  color: #667085;
  font-size: 12px;
}

.channel-editor-row {
  padding: 7px 12px;
  border-bottom: 1px solid #f0f1f3;
}

.channel-editor-row:last-child {
  border-bottom: 0;
}

.channel-editor-row.is-selected {
  background: #fff6f7;
}

@media (max-width: 720px) {
  .generation-profile-grid,
  .channel-editor-row {
    grid-template-columns: 1fr;
  }

  .channel-editor-columns {
    display: none;
  }

  .channel-editor-header,
  .channel-editor-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .channel-search {
    width: 100%;
  }
}

.generate-modal-body :deep(.scenario-prompt-picker--embedded) {
  flex: 1 1 auto;
  min-height: 0;
}

.document-table-scroll {
  padding: 16px 12px 12px;
}

.doc-section-block {
  margin-bottom: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.doc-section-block--collapsed {
  margin-bottom: 8px;
}

.doc-section-block--example {
  overflow: visible;
}

.doc-section-title-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: #f9fafb;
  color: #344054;
  text-align: left;
  cursor: pointer;
}

.doc-section-title-btn:hover {
  background: #f2f4f7;
}

.doc-section-chevron {
  display: inline-flex;
  flex-shrink: 0;
  width: 14px;
  color: #667085;
  font-size: 11px;
}

.doc-section-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.doc-section-body {
  padding: 0 10px 10px;
}

.doc-section-body .api-doc-table-wrap {
  margin-top: 0;
}

.doc-section-body .example-message-block {
  padding-top: 8px;
}

.example-message-shell {
  position: relative;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
}

.example-message-shell:focus-within {
  border-color: var(--cf-brand, #b60f2d);
  background: #fffbeb;
}

.example-message-actions {
  position: sticky;
  top: 0;
  justify-content: flex-end;
  min-height: 28px;
  padding: 2px 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  border-bottom: 1px solid #f2f4f7;
  background: rgba(255, 255, 255, 0.96);
}

.example-message-action-btn,
.example-message-beautify-btn,
.example-message-expand-btn {
  height: auto;
  padding: 0 4px;
  font-size: 12px;
}

.example-message-input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 160px;
  padding: 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  overflow-y: hidden;
  resize: none;
  field-sizing: content;
}

.example-message-input:focus {
  outline: none;
}

.example-message-hint {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.example-message-expand-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-message-expand-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}

.example-message-expand-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.expand-toolbar-actions { display: flex; align-items: center; gap: 2px; }

.example-message-expand-input {
  box-sizing: border-box;
  width: 100%;
  min-height: min(68vh, 720px);
  max-height: 72vh;
  padding: 12px 14px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  overflow: auto;
}

.example-message-expand-input:focus {
  outline: none;
  border-color: var(--cf-brand, #b60f2d);
  box-shadow: 0 0 0 2px rgb(182 15 45 / 8%);
}

.api-doc-table-wrap {
  overflow-x: auto;
}

.api-doc-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  table-layout: auto;
  background: #fff;
}

.api-doc-table th,
.api-doc-table td {
  border: 1px solid #eef2f6;
  vertical-align: top;
}

.api-doc-table th {
  padding: 6px 10px;
  background: #f9fafb;
  color: #667085;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.api-doc-table td {
  padding: 4px;
  background: #fff;
}

.doc-cell-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 100px;
  min-height: 32px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #344054;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  resize: none;
}

.api-doc-table td:first-child .doc-cell-input {
  min-width: 220px;
}

.doc-cell-input:focus {
  outline: none;
  background: #fffbeb;
}

.smp-doc-source-tag {
  display: inline-block;
  margin: 12px 0 6px;
  padding: 4px 12px;
  border-radius: 4px;
  background: #eff8ff;
  color: #175cd3;
  font-size: 12px;
}
</style>
