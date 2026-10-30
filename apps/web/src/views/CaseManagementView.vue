<template>
  <main class="case-management-page">
    <section class="management-card case-list-card">
      <div class="list-card-head">
        <div class="list-card-tabs" role="tablist" aria-label="准生产数据">
          <button
            type="button"
            role="tab"
            :class="{ active: viewMode === 'cases' }"
            :aria-selected="viewMode === 'cases'"
            @click="switchViewMode('cases')"
          >
            准生产案例列表
            <span>{{ loading ? "…" : `${totalCount} 条` }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :class="{ active: viewMode === 'sets' }"
            :aria-selected="viewMode === 'sets'"
            @click="switchViewMode('sets')"
          >
            执行推送集
            <span>{{ runSetsLoading ? "…" : `${runSetsTotal} 个` }}</span>
          </button>
        </div>
        <div v-if="viewMode === 'sets'" class="run-set-filters">
          <a-input
            v-model:value="runSetKeyword"
            class="run-set-search"
            placeholder="搜索推送集名称 / 版本"
            allow-clear
          >
            <template #prefix><SearchOutlined /></template>
          </a-input>
        </div>
        <div v-if="viewMode === 'cases'" class="filters">
          <a-select
            v-model:value="projectId"
            class="filter-select filter-project-select"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部需求"
            aria-label="需求编号"
            :disabled="running"
            :options="projectOptions"
          />
          <a-select
            v-model:value="transactionId"
            class="filter-select filter-transaction-select"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部交易码"
            aria-label="交易码"
            :disabled="running"
            :options="transactionOptions"
          />
          <a-select
            v-model:value="applicationFilter"
            class="filter-select filter-application-select"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="全部归属应用"
            aria-label="归属应用"
            :disabled="running"
            :options="applicationOptions"
          />
        </div>
        <div v-if="viewMode === 'cases'" class="case-batch-area">
          <div class="case-selection-meta">
            <span>
              已选 <strong>{{ selectedCases.length }}</strong> 条
            </span>
            <a-button
              v-if="!selectedCases.length"
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
          <div
            v-if="selectedCases.length"
            class="list-card-actions case-batch-actions"
          >
            <a-button
              size="small"
              :disabled="loading || selecting"
              :loading="exporting"
              @click="exportSelected"
              >导出</a-button
            >
            <a-button
              size="small"
              :disabled="loading || selecting || running"
              :loading="attaching"
              @click="prepareAttachToRunSet"
              >关联</a-button
            >
            <a-button
              size="small"
              type="primary"
              :disabled="loading || selecting"
              :loading="running"
              @click="prepareExecution"
              >执行</a-button
            >
            <span class="case-action-divider" aria-hidden="true" />
            <a-button
              size="small"
              danger
              :disabled="loading || selecting || running"
              :loading="deleting"
              @click="deleteSelected"
              >删除</a-button
            >
          </div>
        </div>
        <div v-if="viewMode === 'sets'" class="list-card-actions">
          <a-button
            size="small"
            :loading="creatingRunSet"
            @click="prepareCreateRunSet"
            >新建集合</a-button
          >
        </div>
      </div>
      <a-alert v-if="loadError" type="error" :message="loadError" show-icon />
      <div ref="tableArea" class="case-table-area">
        <a-table
          v-if="viewMode === 'cases'"
          size="middle"
          table-layout="fixed"
          :data-source="cases"
          :loading="loading"
          row-key="id"
          :scroll="{ x: 1520, y: tableBodyHeight }"
          :pagination="false"
          :row-selection="rowSelection"
          :custom-row="caseRowProps"
          :locale="{ emptyText: '暂无准生产案例，请先在项目管理中同步' }"
        >
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
                  <span class="application-value">{{
                    record.applicationPath || "未指定"
                  }}</span>
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
          <a-table-column title="执行 / 推送" key="runRecord" width="250">
            <template #default="{ record }">
              <div
                class="run-record-cell"
                role="button"
                tabindex="0"
                :title="`点击查看运行推送记录：${latestRunRecords[record.id] ? runRecordDetail(latestRunRecords[record.id]) : '暂无记录'}`"
                @click.stop="openRunRecords(record)"
                @keydown.enter.stop="openRunRecords(record)"
                @keydown.space.prevent.stop="openRunRecords(record)"
              >
                <template v-if="latestRunRecords[record.id]">
                  <div class="run-record-statuses">
                    <span
                      :class="[
                        'run-status-pill',
                        `run-status-pill--${latestRunRecords[record.id].executionStatus}`,
                      ]"
                    >
                      {{
                        executionStatusLabel(
                          latestRunRecords[record.id].executionStatus,
                        )
                      }}
                    </span>
                    <span
                      :class="[
                        'run-status-pill',
                        `run-status-pill--push-${latestRunRecords[record.id].pushStatus}`,
                      ]"
                    >
                      {{
                        pushStatusLabel(latestRunRecords[record.id].pushStatus)
                      }}
                    </span>
                  </div>
                  <span class="run-record-summary">
                    {{ runRecordDetail(latestRunRecords[record.id]) }}
                  </span>
                </template>
                <span v-else class="run-record-empty">暂无记录</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column
            title="属性"
            key="polarity"
            width="64"
            align="center"
            ><template #default="{ record }"
              ><a-tag
                :color="record.polarity === 'negative' ? 'orange' : 'blue'"
                >{{ record.polarity === "negative" ? "反向" : "正向" }}</a-tag
              ></template
            ></a-table-column
          >
          <a-table-column
            title="交易码"
            data-index="transactionCode"
            width="140"
          />
          <a-table-column
            title="需求编号"
            data-index="requirementNo"
            width="175"
          />
        </a-table>
        <a-table
          v-else
          size="middle"
          :data-source="runSets"
          :loading="runSetsLoading"
          row-key="id"
          :pagination="false"
          :scroll="{ x: 1240, y: tableBodyHeight }"
          :custom-row="runSetRowProps"
          :locale="{ emptyText: '暂无执行推送集' }"
        >
          <a-table-column title="名称" key="name" width="170">
            <template #default="{ record }">
              <span>{{ record.name || "未命名推送集" }}</span>
            </template>
          </a-table-column>
          <a-table-column
            title="版本 / 应用 / 轮次"
            key="selection"
            width="250"
          >
            <template #default="{ record }">
              <div class="run-set-selection">
                <span>{{ record.versionLabel }}</span>
                <span>{{ record.applicationLabel || "按案例归属应用" }}</span>
                <span>{{ record.roundLabel || "执行时选择" }}</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="集合状态" key="status" width="110">
            <template #default="{ record }">
              <a-tag :color="runSetStatusColor(record.status)">
                {{ runSetStatusLabel(record.status) }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="案例进度" key="progress" width="100">
            <template #default="{ record }">
              <strong>{{ record.completedCount }}</strong> /
              {{ record.totalCount }}
            </template>
          </a-table-column>
          <a-table-column title="执行结果" key="execution" width="170">
            <template #default="{ record }">
              <div class="run-set-counts">
                <span class="is-success">通过 {{ record.passedCount }}</span>
                <span class="is-warning">未通过 {{ record.failedCount }}</span>
                <span class="is-error">异常 {{ record.errorCount }}</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="测管推送" key="push" width="130">
            <template #default="{ record }">
              <div class="run-set-counts">
                <span class="is-success"
                  >成功 {{ record.pushSuccessCount }}</span
                >
                <span class="is-error">失败 {{ record.pushFailedCount }}</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="最近执行时间" key="lastExecutedAt" width="170">
            <template #default="{ record }">
              <a-tooltip :title="`创建于 ${formatDateTime(record.createdAt)}`">
                <span>
                  {{
                    record.lastExecutedAt
                      ? formatDateTime(record.lastExecutedAt)
                      : "未执行"
                  }}
                </span>
              </a-tooltip>
            </template>
          </a-table-column>
          <a-table-column title="操作" key="actions" width="170">
            <template #default="{ record }">
              <a-button
                type="link"
                size="small"
                :disabled="running"
                @click.stop="startAttachCasesToRunSet(record)"
                >关联</a-button
              >
              <a-button
                v-if="record.totalCount"
                type="link"
                size="small"
                :disabled="running"
                :loading="runningRunSetId === record.id"
                @click.stop="executeRunSet(record)"
                >执行</a-button
              >
              <a-popconfirm
                title="确认删除该执行推送集？"
                description="集合及其成员关系将被删除，已产生的执行记录会保留。"
                ok-text="删除"
                cancel-text="取消"
                @confirm="removeRunSet(record)"
              >
                <a-button
                  type="link"
                  size="small"
                  danger
                  :disabled="record.status === 'running' || running"
                  @click.stop
                  >删除</a-button
                >
              </a-popconfirm>
            </template>
          </a-table-column>
        </a-table>
      </div>
      <footer v-if="viewMode === 'cases'" class="case-pagination">
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
      <footer v-else class="case-pagination">
        <a-pagination
          v-model:current="runSetPage"
          v-model:page-size="runSetPageSize"
          :total="runSetsTotal"
          :page-size-options="['10', '20', '50']"
          :show-total="
            (total: number, range: [number, number]) =>
              `共 ${total} 条 · ${range[0]}–${range[1]} 条`
          "
          show-size-changer
          show-quick-jumper
          :disabled="runSetsLoading"
        />
      </footer>
    </section>
    <a-modal
      v-model:open="exportOpen"
      :width="680"
      centered
      wrap-class-name="management-dialog"
      title="导出测试案例"
      ok-text="导出"
      :confirm-loading="exporting"
      :ok-button-props="{ disabled: !designer }"
      @ok="confirmExport"
    >
      <p class="dialog-intro">
        已选择 {{ selectedKeys.length }} 条准生产案例。请选择设计人后导出测试案例文件。
      </p>
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
    </a-modal>
    <PreproductionCaseDetailDrawer
      v-model:open="detailDrawerOpen"
      :case-row="detailCase"
      :deleting="deleting"
      :loading="detailLoading"
      :running="running"
      @delete="deleteCurrentCase"
      @updated="onCaseUpdated"
      @run-push="prepareSingleExecution"
    />
    <a-modal
      v-model:open="executionOpen"
      :width="680"
      centered
      wrap-class-name="management-dialog"
      :title="executionCases.length === 1 ? '确认运行推送' : '确认批量执行'"
      :ok-text="executionCases.length === 1 ? '开始运行推送' : '开始批量执行'"
      :confirm-loading="running"
      :z-index="NESTED_OVERLAY_Z_INDEX"
      :ok-button-props="{
        disabled:
          !executionVersionId ||
          !executionRoundValue ||
          Boolean(executionValidationError),
      }"
      @ok="runSelected"
    >
      <p class="dialog-intro">
        将按顺序执行
        {{ executionCases.length }} 个案例的完整步骤列表。每个案例生成独立 HTML
        报告并推送结果到测管；批量执行会在当前案例完成“执行 +
        推送”后再处理下一条。
      </p>
      <a-alert
        type="warning"
        message="会按照案例步骤中已配置的环境和地址发送真实测试请求。测管推送失败会记录在列表，可单独重试且不会重新执行案例。"
        show-icon
      />
      <div class="execution-fields">
        <label>版本</label>
        <a-select
          v-model:value="executionVersionId"
          :options="executionVersionOptions"
          :loading="executionOptionsLoading"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 10 }"
          placeholder="请选择版本"
          @change="onExecutionVersionChange"
        />
        <label>归属应用</label>
        <div class="execution-application-summary">
          <a-spin :spinning="executionPlansLoading" size="small">
            <template v-if="executionApplicationGroups.length">
              <a-tag
                v-for="group in executionApplicationGroups"
                :key="group.application.id"
                color="blue"
              >
                {{ group.application.name }}
              </a-tag>
            </template>
            <span v-else-if="executionValidationError" class="execution-validation-error">
              {{ executionValidationError }}
            </span>
            <span v-else>选择版本后自动校验案例归属应用</span>
            <small
              v-if="executionApplicationGroups.length > 1"
              class="execution-application-hint"
            >
              多个应用将分别创建执行推送集，仅展示共同可用轮次
            </small>
          </a-spin>
        </div>
        <label>轮次</label>
        <a-select
          v-model:value="executionRoundValue"
          :options="executionRoundOptions"
          :loading="executionRoundsLoading"
          :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 10 }"
          :disabled="
            !executionVersionId ||
            executionPlansLoading ||
            Boolean(executionValidationError)
          "
          placeholder="请选择轮次"
        />
      </div>
    </a-modal>
    <a-modal
      v-model:open="attachOpen"
      :width="680"
      centered
      wrap-class-name="management-dialog attach-run-set-modal"
      title="关联"
      ok-text="确认关联"
      :confirm-loading="attaching"
      @ok="confirmAttachToRunSet"
    >
      <p class="dialog-intro">
        将已选中的
        {{ selectedCases.length }} 个案例关联到指定的执行推送集。关联只做编组，
        不会立即执行；需要执行时请到「执行推送集」页签点击该集合的「执行」按钮。
      </p>
      <div class="execution-fields">
        <label>执行推送集</label>
        <a-select
          v-model:value="attachTargetSetId"
          :options="runSetOptions"
          placeholder="请选择执行推送集"
        />
      </div>
    </a-modal>
    <a-modal
      v-model:open="deleteConfirmOpen"
      :width="680"
      centered
      wrap-class-name="management-dialog"
      :z-index="NESTED_OVERLAY_Z_INDEX"
      title="删除准生产案例"
      ok-text="确认删除"
      cancel-text="取消"
      :ok-button-props="{ danger: true, loading: deleting }"
      :confirm-loading="deleting"
      @ok="submitDeleteCases"
    >
      <a-alert
        type="warning"
        show-icon
        message="仅删除准生产快照，不会删除项目管理中的源案例。"
      />
      <p class="dialog-intro">
        确定删除{{ deleteConfirmLabel }}吗？删除后不可恢复。
      </p>
    </a-modal>
    <a-modal
      v-model:open="createRunSetOpen"
      title="新建执行推送集"
      ok-text="创建"
      :confirm-loading="creatingRunSet"
      :ok-button-props="{
        disabled: !createRunSetVersionId,
      }"
      @ok="confirmCreateRunSet"
    >
      <p>
        新建的推送集先处于「待执行」状态。这里只需选择版本，应用按集合内案例的归属应用确定，
        轮次在点击执行时动态查询。
      </p>
      <div class="execution-fields">
        <label>名称</label>
        <a-input
          v-model:value="createRunSetName"
          placeholder="例如：第一轮核心交易回归"
          allow-clear
        />
        <label>版本</label>
        <a-select
          v-model:value="createRunSetVersionId"
          :options="createRunSetVersionOptions"
          :loading="createRunSetOptionsLoading"
          placeholder="请选择版本"
        />
      </div>
    </a-modal>
    <a-modal
      v-model:open="runSetExecutionOpen"
      title="执行推送集"
      ok-text="开始执行"
      :z-index="NESTED_OVERLAY_Z_INDEX"
      :confirm-loading="Boolean(runningRunSetId)"
      :ok-button-props="{
        disabled:
          runSetExecutionLoading ||
          !runSetExecutionRoundValue ||
          Boolean(runSetExecutionError),
      }"
      @ok="confirmExecuteRunSet"
    >
      <p v-if="runSetExecutionTarget">
        {{ runSetExecutionTarget.name || "未命名推送集" }} ·
        {{ runSetExecutionTarget.versionLabel }}
      </p>
      <a-spin :spinning="runSetExecutionLoading">
        <div class="execution-fields">
          <label>归属应用</label>
          <div class="execution-application-summary">
            <template v-if="runSetExecutionGroups.length">
              <a-tag
                v-for="group in runSetExecutionGroups"
                :key="group.application.id"
                color="blue"
              >
                {{ group.application.name }}
              </a-tag>
            </template>
            <span
              v-else-if="runSetExecutionError"
              class="execution-validation-error"
            >
              {{ runSetExecutionError }}
            </span>
            <span v-else>正在校验集合内案例的归属应用</span>
          </div>
          <label>轮次</label>
          <a-select
            v-model:value="runSetExecutionRoundValue"
            :options="runSetExecutionRoundOptions"
            :loading="runSetExecutionLoading"
            :dropdown-style="{ zIndex: NESTED_OVERLAY_Z_INDEX + 10 }"
            :disabled="
              runSetExecutionLoading || Boolean(runSetExecutionError)
            "
            placeholder="请选择轮次"
          />
        </div>
      </a-spin>
    </a-modal>
    <a-modal
      v-model:open="runRecordsOpen"
      title="准生产案例运行推送记录"
      :width="1040"
      :footer="null"
    >
      <div v-if="runRecordsCase" class="run-records-head">
        <div>
          <strong>{{ runRecordsCase.caseNo || runRecordsCase.title }}</strong>
          <span>{{ runRecordsCase.title }}</span>
        </div>
        <a-button
          size="small"
          :loading="runRecordsLoading"
          @click="loadRunRecords(runRecordsCase)"
        >
          刷新
        </a-button>
      </div>
      <a-spin :spinning="runRecordsLoading">
        <a-empty v-if="!runRecords.length" description="暂无运行推送记录" />
        <a-table
          v-else
          :data-source="runRecords"
          row-key="id"
          size="small"
          :pagination="false"
          :scroll="{ x: 900, y: 420 }"
        >
          <a-table-column title="执行时间" key="createdAt" width="170">
            <template #default="{ record }">
              {{ formatDateTime(record.createdAt) }}
            </template>
          </a-table-column>
          <a-table-column title="执行" key="execution" width="100">
            <template #default="{ record }">
              <a-tag :color="executionStatusColor(record.executionStatus)">
                {{ executionStatusLabel(record.executionStatus) }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="执行位置 / 问题" key="step" width="260">
            <template #default="{ record }">
              <div class="run-record-detail">
                <span>
                  {{
                    record.currentStepIndex
                      ? `步骤 ${record.currentStepIndex}`
                      : "—"
                  }}
                  {{ record.currentStepName || "" }}
                </span>
                <span v-if="record.executionError" class="run-record-error">
                  {{ record.executionError }}
                </span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="测管推送" key="push" width="190">
            <template #default="{ record }">
              <div class="run-record-detail">
                <a-tag :color="pushStatusColor(record.pushStatus)">
                  {{ pushStatusLabel(record.pushStatus) }}
                </a-tag>
                <span v-if="record.pushError" class="run-record-error">
                  {{ record.pushError }}
                </span>
                <a
                  v-if="record.reportUrl"
                  :href="record.reportUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看报告
                </a>
                <a-button
                  v-if="record.runId && record.pushStatus === 'failed'"
                  type="link"
                  size="small"
                  :disabled="runRecordsLoading || running"
                  @click="retryRecordPush(record)"
                >
                  重试推送
                </a-button>
              </div>
            </template>
          </a-table-column>
        </a-table>
      </a-spin>
    </a-modal>
    <a-drawer
      v-model:open="runSetDetailOpen"
      title="执行推送集详情"
      placement="right"
      width="min(1400px, 96vw)"
      root-class-name="run-set-detail-drawer"
      :body-style="{ padding: '20px 24px 28px' }"
    >
      <template v-if="runSetDetail">
        <div class="run-set-detail-head">
          <div>
            <strong>
              {{ runSetDetail.name || "未命名推送集" }} ·
              {{ runSetDetail.versionLabel }} /
              {{ runSetDetail.applicationLabel || "按案例归属应用" }} /
              {{ runSetDetail.roundLabel || "执行时选择" }}
            </strong>
            <span>{{ formatDateTime(runSetDetail.createdAt) }}</span>
          </div>
          <a-tag :color="runSetStatusColor(runSetDetail.status)">
            {{ runSetStatusLabel(runSetDetail.status) }}
          </a-tag>
        </div>
        <div class="run-set-detail-summary">
          <span>已关联 {{ runSetMembers.length }} 个案例</span>
          <span
            >案例 {{ runSetDetail.completedCount }} /
            {{ runSetDetail.totalCount }}</span
          >
          <span>执行通过 {{ runSetDetail.passedCount }}</span>
          <span>执行未通过 {{ runSetDetail.failedCount }}</span>
          <span>执行异常 {{ runSetDetail.errorCount }}</span>
          <span>推送成功 {{ runSetDetail.pushSuccessCount }}</span>
          <span>推送失败 {{ runSetDetail.pushFailedCount }}</span>
        </div>
        <a-spin :spinning="runSetRecordsLoading">
          <a-empty
            v-if="!runSetDetailRows.length"
            description="该集合尚未关联案例"
          />
          <a-table
            v-else
            :data-source="runSetDetailRows"
            row-key="id"
            size="small"
            :pagination="false"
            :scroll="{ x: 1080 }"
            class="run-set-detail-table"
          >
            <a-table-column title="序号" key="sequence" width="70">
              <template #default="{ record }">
                {{ Number(record.sortOrder) + 1 }}
              </template>
            </a-table-column>
            <a-table-column title="案例" data-index="caseTitle" />
            <a-table-column title="执行" key="execution" width="120">
              <template #default="{ record }">
                <a-tag
                  v-if="record.latestRecord"
                  :color="
                    executionStatusColor(record.latestRecord.executionStatus)
                  "
                >
                  {{
                    executionStatusLabel(record.latestRecord.executionStatus)
                  }}
                </a-tag>
                <span v-else class="run-record-empty">未执行</span>
              </template>
            </a-table-column>
            <a-table-column title="执行位置 / 问题" key="step" width="360">
              <template #default="{ record }">
                <div v-if="record.latestRecord" class="run-record-detail">
                  <span>
                    {{
                      record.latestRecord.currentStepIndex
                        ? `步骤 ${record.latestRecord.currentStepIndex}`
                        : "—"
                    }}
                    {{ record.latestRecord.currentStepName || "" }}
                  </span>
                  <span
                    v-if="record.latestRecord.executionError"
                    class="run-record-error"
                  >
                    {{ record.latestRecord.executionError }}
                  </span>
                </div>
                <span v-else class="run-record-empty">—</span>
              </template>
            </a-table-column>
            <a-table-column title="推送" key="push" width="210">
              <template #default="{ record }">
                <div v-if="record.latestRecord" class="run-record-detail">
                  <a-tag
                    :color="pushStatusColor(record.latestRecord.pushStatus)"
                  >
                    {{ pushStatusLabel(record.latestRecord.pushStatus) }}
                  </a-tag>
                  <span
                    v-if="record.latestRecord.pushError"
                    class="run-record-error"
                  >
                    {{ record.latestRecord.pushError }}
                  </span>
                </div>
                <span v-else class="run-record-empty">—</span>
              </template>
            </a-table-column>
            <a-table-column title="操作" key="actions" width="90">
              <template #default="{ record }">
                <a-button
                  type="link"
                  size="small"
                  :disabled="running"
                  @click="removeRunSetMember(record)"
                  >移出</a-button
                >
              </template>
            </a-table-column>
          </a-table>
        </a-spin>
      </template>
    </a-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { message } from "ant-design-vue";
import { SearchOutlined } from "@ant-design/icons-vue";
import type {
  ApiPreproductionRunExecutionStatus,
  ApiPreproductionRunPushStatus,
  ApiPreproductionRunRecord,
  ApiPreproductionRunSet,
  ApiPreproductionRunSetCase,
  ApiPreproductionRunSetStatus,
} from "@case-forge/shared";
import {
  listManagedCases,
  getManagedCaseOptions,
  selectManagedCases,
  getManagedCaseDetails,
  listExecutionVersions,
  listExecutionPlans,
  listCaseDesigners,
  exportCaseTemplate,
  deleteManagedCase,
  deleteManagedCases,
  type ManagedCaseRow,
  type ManagedCaseSelection,
  type ManagedCaseOptions,
  listLatestPreproductionRunRecords,
  listPreproductionRunRecords,
  runPreproductionCaseAndPush,
  retryPreproductionRunPush,
  createPreproductionRunSet,
  listPreproductionRunSets,
  listPreproductionRunSetRecords,
  listPreproductionRunSetCases,
  attachPreproductionRunSetCases,
  detachPreproductionRunSetCase,
  deletePreproductionRunSet,
  finishPreproductionRunSet,
} from "@/api/apiTestClient";
import { exportApiCasesToExcel } from "@/utils/apiCaseExcelExport.util";
import { versionLabel } from "@/utils/caseManagement";
import { getUserName } from "@/utils/userContext";
import { NESTED_OVERLAY_Z_INDEX } from "@/constants/overlay-z-index";
import PreproductionCaseDetailDrawer from "@/components/api-test/PreproductionCaseDetailDrawer.vue";

type Result = {
  caseId: string;
  title: string;
  projectId: string;
  transactionId: string;
  execution: string;
  delivery: string;
  recordId?: string;
  runId?: string;
  reportUrl?: string;
  publishing?: boolean;
};
type ExecutionCase = Pick<
  ManagedCaseRow,
  | "id"
  | "projectId"
  | "transactionId"
  | "title"
  | "enabled"
  | "applicationPath"
>;
type ExecutionPlan = Awaited<ReturnType<typeof listExecutionPlans>>[number];
type ExecutionApplicationGroup = {
  application: ExecutionPlan;
  rounds: ExecutionPlan[];
  cases: ExecutionCase[];
};
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
let executionValidationSequence = 0;
let runSetRequestSequence = 0;
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
const viewMode = ref<"cases" | "sets">("cases");
const runSets = ref<ApiPreproductionRunSet[]>([]);
const runSetsTotal = ref(0);
const runSetsLoading = ref(false);
const runSetPage = ref(1);
const runSetPageSize = ref(10);
const runSetKeyword = ref("");
let runSetFilterTimer: ReturnType<typeof setTimeout> | undefined;
const attachRunSets = ref<ApiPreproductionRunSet[]>([]);
const runSetDetailOpen = ref(false);
const runSetDetail = ref<ApiPreproductionRunSet | null>(null);
const runSetRecords = ref<ApiPreproductionRunRecord[]>([]);
const runSetRecordsLoading = ref(false);
const runSetMembers = ref<ApiPreproductionRunSetCase[]>([]);
const creatingRunSet = ref(false);
const attaching = ref(false);
const runningRunSetId = ref<string>();
const attachOpen = ref(false);
const attachTargetSetId = ref<string>();
const pendingAttachRunSet = ref<ApiPreproductionRunSet | null>(null);
const createRunSetOpen = ref(false);
const createRunSetName = ref("");
const createRunSetOptionsLoading = ref(false);
const createRunSetVersionId = ref<string>();
const createRunSetVersionOptions = ref<Array<{ value: string; label: string }>>(
  [],
);
const runSetExecutionOpen = ref(false);
const runSetExecutionTarget = ref<ApiPreproductionRunSet | null>(null);
const runSetExecutionGroups = ref<ExecutionApplicationGroup[]>([]);
const runSetExecutionRoundOptions = ref<
  Array<{ value: string; label: string }>
>([]);
const runSetExecutionRoundValue = ref<string>();
const runSetExecutionLoading = ref(false);
const runSetExecutionError = ref("");
const running = ref(false);
const executionCases = ref<ExecutionCase[]>([]);
const executionOpen = ref(false);
const executionOptionsLoading = ref(false);
const executionPlansLoading = ref(false);
const executionRoundsLoading = ref(false);
const executionVersionId = ref<string>();
const executionRoundValue = ref<string>();
const executionValidationError = ref("");
const executionApplicationGroups = ref<ExecutionApplicationGroup[]>([]);
const executionVersionOptions = ref<Array<{ value: string; label: string }>>(
  [],
);
const executionRoundOptions = ref<Array<{ value: string; label: string }>>([]);
const exportOpen = ref(false);
const deleteConfirmOpen = ref(false);
const deleteConfirmIds = ref<string[]>([]);
const deleteConfirmLabel = ref("");
const deleteConfirmSingle = ref(false);
const detailDrawerOpen = ref(false);
const detailCase = ref<ManagedCaseRow | null>(null);
const detailLoading = ref(false);
const latestRunRecords = ref<Record<string, ApiPreproductionRunRecord>>({});
const runRecordsOpen = ref(false);
const runRecordsCase = ref<ManagedCaseRow | null>(null);
const runRecords = ref<ApiPreproductionRunRecord[]>([]);
const runRecordsLoading = ref(false);
let detailRequestSequence = 0;
const designer = ref<string>();
const designerOptions = ref<Array<{ value: string; label: string; user: any }>>(
  [],
);
const results = ref<Result[]>([]);
const projectOptions = computed(() => filterOptions.value.projects);
const transactionOptions = computed(() => filterOptions.value.transactions);
const applicationOptions = computed(() => filterOptions.value.applications);
const selectedCases = computed(() => [...selectedRows.value.values()]);
const runSetOptions = computed(() =>
  attachRunSets.value.map((item) => ({
    value: item.id,
    label: `${item.name || "未命名推送集"} · ${item.versionLabel} / ${item.applicationLabel || "按案例归属应用"} / ${item.roundLabel || "执行时选择"}`,
  })),
);
const runSetDetailRows = computed(() => {
  const latestRecordByCase = new Map<string, ApiPreproductionRunRecord>();
  for (const record of runSetRecords.value) {
    const current = latestRecordByCase.get(record.caseId);
    if (
      !current ||
      new Date(record.createdAt).getTime() >=
        new Date(current.createdAt).getTime()
    ) {
      latestRecordByCase.set(record.caseId, record);
    }
  }
  return runSetMembers.value.map((member) => ({
    ...member,
    latestRecord: latestRecordByCase.get(member.caseId) ?? null,
  }));
});
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

function executionStatusLabel(status: ApiPreproductionRunExecutionStatus) {
  return {
    running: "执行中",
    passed: "执行通过",
    failed: "断言未通过",
    error: "执行异常",
  }[status];
}
function executionStatusColor(status: ApiPreproductionRunExecutionStatus) {
  return {
    running: "processing",
    passed: "success",
    failed: "warning",
    error: "error",
  }[status];
}
function pushStatusLabel(status: ApiPreproductionRunPushStatus) {
  return {
    pending: "推送中",
    success: "已推送测管",
    failed: "推送失败",
  }[status];
}
function pushStatusColor(status: ApiPreproductionRunPushStatus) {
  return {
    pending: "processing",
    success: "success",
    failed: "error",
  }[status];
}
function runSetStatusLabel(status: ApiPreproductionRunSetStatus) {
  return {
    pending: "待执行",
    running: "执行推送中",
    completed: "全部成功",
    partial_failed: "部分失败",
    failed: "执行失败",
  }[status];
}
function runSetStatusColor(status: ApiPreproductionRunSetStatus) {
  return {
    pending: "default",
    running: "processing",
    completed: "success",
    partial_failed: "warning",
    failed: "error",
  }[status];
}
function runRecordDetail(record: ApiPreproductionRunRecord) {
  if (record.executionStatus === "running") return "正在执行步骤列表";
  const step = [
    record.currentStepIndex ? `步骤 ${record.currentStepIndex}` : "",
    record.currentStepName || "",
  ]
    .filter(Boolean)
    .join(" · ");
  return record.executionError || record.pushError || step || "执行完成";
}
function upsertLatestRunRecord(record: ApiPreproductionRunRecord) {
  latestRunRecords.value = {
    ...latestRunRecords.value,
    [record.caseId]: record,
  };
}
async function loadLatestRunRecords(rows: ManagedCaseRow[]) {
  if (!rows.length) {
    latestRunRecords.value = {};
    return;
  }
  try {
    const records = await listLatestPreproductionRunRecords(
      rows.map((row) => row.id),
    );
    latestRunRecords.value = Object.fromEntries(
      records.map((record) => [record.caseId, record]),
    );
  } catch {
    latestRunRecords.value = {};
  }
}
async function switchViewMode(mode: "cases" | "sets") {
  viewMode.value = mode;
  if (mode === "sets") await loadRunSets();
}
async function loadRunSets() {
  const sequence = ++runSetRequestSequence;
  runSetsLoading.value = true;
  try {
    const result = await listPreproductionRunSets(
      projectId.value || cases.value[0]?.projectId || "all",
      {
        page: runSetPage.value,
        size: runSetPageSize.value,
        keyword: runSetKeyword.value.trim() || undefined,
      },
    );
    if (sequence !== runSetRequestSequence) return;
    runSetsTotal.value = result.count;
    const lastPage = Math.max(
      1,
      Math.ceil(result.count / runSetPageSize.value),
    );
    if (runSetPage.value > lastPage) {
      runSetPage.value = lastPage;
      return;
    }
    runSets.value = result.rows;
  } catch (error) {
    if (sequence !== runSetRequestSequence) return;
    message.error(
      error instanceof Error ? error.message : "加载执行推送集失败",
    );
  } finally {
    if (sequence === runSetRequestSequence) runSetsLoading.value = false;
  }
}
watch([runSetPage, runSetPageSize], ([page], [previousPage, previousSize]) => {
  if (runSetPageSize.value !== previousSize && page !== 1) {
    runSetPage.value = 1;
    return;
  }
  if (
    (page !== previousPage || runSetPageSize.value !== previousSize) &&
    viewMode.value === "sets"
  ) {
    void loadRunSets();
  }
});
watch(runSetKeyword, () => {
  if (viewMode.value !== "sets") return;
  if (runSetFilterTimer) clearTimeout(runSetFilterTimer);
  runSetFilterTimer = setTimeout(() => {
    runSetFilterTimer = undefined;
    if (runSetPage.value !== 1) {
      runSetPage.value = 1;
      return;
    }
    void loadRunSets();
  }, 300);
});
function runSetRowProps(record: ApiPreproductionRunSet) {
  return {
    onClick: () => void openRunSetDetail(record),
  };
}
async function openRunSetDetail(record: ApiPreproductionRunSet) {
  runSetDetail.value = record;
  runSetDetailOpen.value = true;
  runSetRecordsLoading.value = true;
  const scopeProjectId = projectId.value || cases.value[0]?.projectId || "all";
  try {
    const [records, members] = await Promise.all([
      listPreproductionRunSetRecords(scopeProjectId, record.id),
      listPreproductionRunSetCases(scopeProjectId, record.id),
    ]);
    runSetRecords.value = records;
    runSetMembers.value = members;
  } catch (error) {
    runSetRecords.value = [];
    runSetMembers.value = [];
    message.error(
      error instanceof Error ? error.message : "加载集合案例记录失败",
    );
  } finally {
    runSetRecordsLoading.value = false;
  }
}

/** 删除执行推送集：集合与成员标记删除，已产生的执行记录保留。 */
async function removeRunSet(record: ApiPreproductionRunSet) {
  if (running.value) return;
  const scopeProjectId = projectId.value || cases.value[0]?.projectId || "all";
  try {
    await deletePreproductionRunSet(scopeProjectId, record.id);
    message.success(`已删除执行推送集「${record.name || "未命名推送集"}」`);
    if (runSetDetail.value?.id === record.id) {
      runSetDetailOpen.value = false;
      runSetDetail.value = null;
      runSetMembers.value = [];
      runSetRecords.value = [];
    }
    await loadRunSets();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "删除执行推送集失败",
    );
  }
}

/** 把案例从执行推送集中移出（不影响已有的执行记录）。 */
async function removeRunSetMember(member: ApiPreproductionRunSetCase) {
  if (!runSetDetail.value || running.value) return;
  const scopeProjectId = projectId.value || cases.value[0]?.projectId || "all";
  try {
    runSetMembers.value = await detachPreproductionRunSetCase(
      scopeProjectId,
      runSetDetail.value.id,
      member.caseId,
    );
    message.success(`已将「${member.caseTitle}」移出执行推送集`);
    await loadRunSets();
    if (runSetDetail.value) {
      const refreshed = runSets.value.find(
        (item) => item.id === runSetDetail.value?.id,
      );
      if (refreshed) runSetDetail.value = refreshed;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "移出案例失败");
  }
}

/** 从空执行推送集跳到案例列表，并记住后续关联的目标集合。 */
function startAttachCasesToRunSet(record: ApiPreproductionRunSet) {
  if (running.value) return;
  pendingAttachRunSet.value = record;
  clearSelection();
  viewMode.value = "cases";
  message.info(
    `请勾选要关联到「${record.name || "未命名推送集"}」的案例，然后点击「关联到执行推送集」`,
  );
  requestAnimationFrame(() => {
    document.querySelector(".case-management-page")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
}

/** 从案例列表把选中的案例关联进已有执行推送集；关联不会触发执行。 */
async function prepareAttachToRunSet() {
  if (attaching.value || running.value || !selectedCases.value.length) return;
  const disabled = selectedCases.value.filter((item) => !item.enabled);
  if (disabled.length) {
    message.warning("选中案例包含未启用案例，请先启用或取消勾选");
    return;
  }
  try {
    const result = await listPreproductionRunSets(
      projectId.value || cases.value[0]?.projectId || "all",
      { page: 1, size: 100 },
    );
    const preferred = pendingAttachRunSet.value;
    attachRunSets.value =
      preferred && !result.rows.some((item) => item.id === preferred.id)
        ? [preferred, ...result.rows]
        : result.rows;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "加载执行推送集失败",
    );
    return;
  }
  if (!attachRunSets.value.length) {
    message.warning("还没有执行推送集，请先在「执行推送集」页签新建");
    return;
  }
  const preferred = pendingAttachRunSet.value;
  attachTargetSetId.value =
    attachRunSets.value.find((item) => item.id === preferred?.id)?.id ??
    attachRunSets.value[0].id;
  pendingAttachRunSet.value = null;
  attachOpen.value = true;
}

async function confirmAttachToRunSet() {
  if (!attachTargetSetId.value || attaching.value) return;
  attaching.value = true;
  try {
    const targets = [...selectedCases.value];
    const scopeProjectId =
      projectId.value || cases.value[0]?.projectId || "all";
    const currentMembers = await listPreproductionRunSetCases(
      scopeProjectId,
      attachTargetSetId.value,
    );
    const existingCaseIds = new Set(
      currentMembers.map((item) => item.caseId),
    );
    const newCases = targets.filter(
      (item) => !existingCaseIds.has(item.id),
    );
    if (!newCases.length) {
      message.warning(
        `所选 ${targets.length} 个案例已全部存在于该执行推送集，无需重复关联`,
      );
      return;
    }
    const members = await attachPreproductionRunSetCases(
      scopeProjectId,
      attachTargetSetId.value,
      newCases.map((item) => item.id),
    );
    const attachedCaseIds = new Set(members.map((item) => item.caseId));
    const addedCount = newCases.filter((item) =>
      attachedCaseIds.has(item.id),
    ).length;
    const skippedCount = targets.length - addedCount;
    if (!addedCount) {
      message.warning("所选案例均已在执行推送集中，无需重复关联");
      return;
    }
    message.success(
      skippedCount
        ? `本次新增 ${addedCount} 个案例，${skippedCount} 个已存在并已跳过`
        : `已关联 ${addedCount} 个案例，可在「执行推送集」页签统一执行`,
    );
    attachOpen.value = false;
    clearSelection();
    await loadRunSets();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "关联案例到执行推送集失败",
    );
  } finally {
    attaching.value = false;
  }
}

/** 新建执行推送集：只建集不执行，之后再从案例列表关联案例。 */
async function prepareCreateRunSet() {
  if (creatingRunSet.value) return;
  createRunSetName.value = "";
  createRunSetVersionId.value = undefined;
  createRunSetOpen.value = true;
  createRunSetOptionsLoading.value = true;
  try {
    const versions = await listExecutionVersions();
    createRunSetVersionOptions.value = versions.map((item) => ({
      value: item.id,
      label: item.name,
    }));
  } catch {
    message.error("加载执行版本失败，请重试");
  } finally {
    createRunSetOptionsLoading.value = false;
  }
}

async function confirmCreateRunSet() {
  if (creatingRunSet.value) return;
  if (!createRunSetVersionId.value) {
    message.warning("请选择版本");
    return;
  }
  creatingRunSet.value = true;
  try {
    const findLabel = (
      options: Array<{ value: string; label: string }>,
      value: string,
    ) => options.find((item) => item.value === value)?.label ?? value;
    const created = await createPreproductionRunSet(
      projectId.value || cases.value[0]?.projectId || "all",
      {
        name: createRunSetName.value.trim() || undefined,
        versionId: createRunSetVersionId.value,
        versionLabel: findLabel(
          createRunSetVersionOptions.value,
          createRunSetVersionId.value,
        ),
        totalCount: 0,
      },
    );
    message.success(`已创建执行推送集「${created.name || "未命名推送集"}」`);
    createRunSetOpen.value = false;
    await loadRunSets();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "创建执行推送集失败",
    );
  } finally {
    creatingRunSet.value = false;
  }
}

async function executeRunSet(record: ApiPreproductionRunSet) {
  if (running.value || runningRunSetId.value) return;
  const scopeProjectId = projectId.value || cases.value[0]?.projectId || "all";
  runSetExecutionTarget.value = record;
  runSetExecutionGroups.value = [];
  runSetExecutionRoundOptions.value = [];
  runSetExecutionRoundValue.value = undefined;
  runSetExecutionError.value = "";
  runSetExecutionOpen.value = true;
  runSetExecutionLoading.value = true;
  runningRunSetId.value = record.id;
  try {
    const members = await listPreproductionRunSetCases(
      scopeProjectId,
      record.id,
    );
    if (!members.length) {
      message.warning("该执行推送集还没有关联案例");
      runSetExecutionOpen.value = false;
      return;
    }
    const caseRows = await getManagedCaseDetails(
      members.map((member) => member.caseId),
    );
    const caseById = new Map(caseRows.map((row) => [row.id, row]));
    const executionCasesForSet = members
      .map((member) => caseById.get(member.caseId))
      .filter((row): row is ManagedCaseRow => Boolean(row));
    const applications = await listExecutionPlans(record.versionId, "0");
    if (!applications.length) {
      runSetExecutionError.value = "当前版本下没有可执行应用";
      return;
    }
    const applicationByName = new Map(
      applications.map((application) => [
        executionApplicationKey(application.name),
        application,
      ]),
    );
    const groups = new Map<string, ExecutionApplicationGroup>();
    const missingApplications = new Set<string>();
    for (const testCase of executionCasesForSet) {
      const applicationName = testCase.applicationPath?.trim();
      if (!applicationName) {
        missingApplications.add("未设置归属应用");
        continue;
      }
      const application = applicationByName.get(
        executionApplicationKey(applicationName),
      );
      if (!application) {
        missingApplications.add(applicationName);
        continue;
      }
      const group = groups.get(application.id) ?? {
        application,
        rounds: [],
        cases: [],
      };
      group.cases.push(testCase);
      groups.set(application.id, group);
    }
    if (missingApplications.size) {
      runSetExecutionError.value = `版本「${record.versionLabel}」下不存在应用：${[
        ...missingApplications,
      ].join("、")}`;
      return;
    }
    const resolvedGroups = [...groups.values()];
    await Promise.all(
      resolvedGroups.map(async (group) => {
        group.rounds = await listExecutionPlans(
          record.versionId,
          group.application.id,
        );
      }),
    );
    const missingRounds = resolvedGroups.find(
      (group) => group.rounds.length === 0,
    );
    if (missingRounds) {
      runSetExecutionError.value = `应用「${missingRounds.application.name}」在当前版本下没有可用轮次`;
      return;
    }
    let commonRoundKeys: Set<string> | null = null;
    for (const group of resolvedGroups) {
      const keys = new Set(group.rounds.map(executionRoundKey));
      if (commonRoundKeys === null) {
        commonRoundKeys = keys;
        continue;
      }
      const intersection = new Set<string>();
      for (const key of commonRoundKeys) {
        if (keys.has(key)) intersection.add(key);
      }
      commonRoundKeys = intersection;
    }
    const roundPlans = new Map<string, ExecutionPlan>();
    for (const group of resolvedGroups) {
      for (const round of group.rounds) {
        const key = executionRoundKey(round);
        if (!commonRoundKeys?.has(key) || roundPlans.has(key)) continue;
        roundPlans.set(key, round);
      }
    }
    runSetExecutionGroups.value = resolvedGroups;
    runSetExecutionRoundOptions.value = [...roundPlans.entries()]
      .map(([value, round]) => ({
        value,
        label: executionRoundLabel(round),
        sort:
          round.roundNum == null
            ? Number.MAX_SAFE_INTEGER
            : Number(round.roundNum),
      }))
      .sort((left, right) => left.sort - right.sort)
      .map(({ value, label }) => ({ value, label }));
    if (!runSetExecutionRoundOptions.value.length) {
      runSetExecutionError.value = "集合内应用没有共同可用轮次";
      return;
    }
    runSetExecutionRoundValue.value =
      runSetExecutionRoundOptions.value[0].value;
  } catch (error) {
    runSetExecutionError.value =
      error instanceof Error ? error.message : "校验集合执行条件失败";
  } finally {
    runSetExecutionLoading.value = false;
    runningRunSetId.value = undefined;
  }
}

async function confirmExecuteRunSet() {
  const record = runSetExecutionTarget.value;
  const roundKey = runSetExecutionRoundValue.value;
  if (
    !record ||
    !roundKey ||
    runSetExecutionLoading.value ||
    runSetExecutionError.value
  ) {
    return;
  }
  const groups = runSetExecutionGroups.value
    .map((group) => ({
      ...group,
      round: group.rounds.find((round) => executionRoundKey(round) === roundKey),
    }))
    .filter(
      (
        group,
      ): group is ExecutionApplicationGroup & { round: ExecutionPlan } =>
        Boolean(group.round),
    );
  if (!groups.length) {
    message.warning("集合内应用没有可用轮次");
    return;
  }
  const scopeProjectId = projectId.value || cases.value[0]?.projectId || "all";
  runningRunSetId.value = record.id;
  running.value = true;
  runSetExecutionOpen.value = false;
  let failedCount = 0;
  let firstError = "";
  try {
    for (const group of groups) {
      for (const testCase of group.cases) {
        try {
          const runRecord = await runPreproductionCaseAndPush(
            testCase.projectId,
            testCase.id,
            {
              versionId: record.versionId,
              applicationId: group.application.id,
              roundId: group.round.id,
              runSetId: record.id,
            },
          );
          upsertLatestRunRecord(runRecord);
        } catch (error) {
          failedCount += 1;
          if (!firstError) {
            firstError =
              error instanceof Error ? error.message : "执行请求失败";
          }
        }
      }
    }
    try {
      await finishPreproductionRunSet(scopeProjectId, record.id);
    } catch {
      /* 单条记录已落库，集合汇总失败不影响已执行结果 */
    }
    await loadLatestRunRecords(cases.value);
    await loadRunSets();
    if (failedCount) {
      message.warning(
        `${failedCount} 个案例执行失败：${firstError || "请查看集合执行记录"}`,
      );
    } else {
      message.success("执行推送集已完成");
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : "执行推送集失败");
  } finally {
    runningRunSetId.value = undefined;
    running.value = false;
  }
}
async function openRunRecords(row: ManagedCaseRow) {
  runRecordsCase.value = row;
  runRecordsOpen.value = true;
  await loadRunRecords(row);
}
async function loadRunRecords(row: ManagedCaseRow) {
  runRecordsLoading.value = true;
  try {
    runRecords.value = await listPreproductionRunRecords(row.projectId, row.id);
    if (runRecords.value[0]) upsertLatestRunRecord(runRecords.value[0]);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "加载运行推送记录失败",
    );
  } finally {
    runRecordsLoading.value = false;
  }
}
async function retryRecordPush(record: ApiPreproductionRunRecord) {
  if (running.value || runRecordsLoading.value) return;
  runRecordsLoading.value = true;
  try {
    const updated = await retryPreproductionRunPush(
      record.projectId,
      record.id,
    );
    upsertLatestRunRecord(updated);
    runRecords.value = runRecords.value.map((item) =>
      item.id === updated.id ? updated : item,
    );
    const result = results.value.find((item) => item.caseId === updated.caseId);
    if (result) applyRunRecord(result, updated);
    if (updated.pushStatus === "success") {
      message.success("已重新推送到测管");
    } else {
      message.error(updated.pushError || "推送失败，请重试");
    }
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "重试推送失败，请重试",
    );
  } finally {
    runRecordsLoading.value = false;
  }
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
  deleteConfirmIds.value = [...caseIds];
  deleteConfirmLabel.value = label;
  deleteConfirmSingle.value = single;
  deleteConfirmOpen.value = true;
}

async function submitDeleteCases() {
  const caseIds = [...deleteConfirmIds.value];
  if (!caseIds.length || deleting.value) return;
  deleting.value = true;
  try {
    const result = deleteConfirmSingle.value
      ? await deleteManagedCase(caseIds[0])
      : await deleteManagedCases(caseIds);
    clearSelection();
    await Promise.all([loadCases(), loadOptions()]);
    if (detailCase.value && caseIds.includes(detailCase.value.id)) {
      detailDrawerOpen.value = false;
      detailCase.value = null;
    }
    deleteConfirmOpen.value = false;
    message.success(`已删除 ${result.deleted} 条准生产案例`);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "删除失败，请重试",
    );
  } finally {
    deleting.value = false;
  }
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
    await loadLatestRunRecords(result.rows);
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
  [projectId, transactionId, applicationFilter, currentPage, pageSize],
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
  try {
    const users = await listCaseDesigners();
    designerOptions.value = users.map((user) => ({
      value: user.userName,
      label: `${user.nickName}（${user.userName}）`,
      user,
    }));
  } catch {
    message.error("加载导出选项失败，请重试");
  }
}
async function confirmExport() {
  if (!designer.value) return;
  if (selectedKeys.value.length > 1000) {
    message.warning("一次最多导出 1000 条案例");
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
    const picked = designerOptions.value.find(
      (o) => o.value === designer.value,
    );
    const file = await exportCaseTemplate({
      caseIds: rows.map((row) => row.id),
      designer: picked?.user?.nickName,
    });
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    exportOpen.value = false;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "案例导出失败，请稍后重试",
    );
  } finally {
    exporting.value = false;
  }
}
async function prepareExecution() {
  await prepareExecutionFor(selectedCases.value);
}
async function prepareSingleExecution() {
  if (!detailCase.value) return;
  await prepareExecutionFor([detailCase.value]);
}
async function prepareExecutionFor(targets: ExecutionCase[]) {
  if (running.value || publishing.value) return;
  if (!targets.length) {
    message.warning("请至少选择一条案例");
    return;
  }
  if (targets.some((c) => !c.enabled)) {
    message.warning("选中案例包含未启用案例，请先启用或取消勾选");
    return;
  }
  executionCases.value = targets;
  executionVersionId.value = undefined;
  executionRoundValue.value = undefined;
  executionValidationError.value = "";
  executionApplicationGroups.value = [];
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

function executionApplicationKey(value?: string | null) {
  const segments = String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  return (segments[segments.length - 1] ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function executionRoundKey(plan: ExecutionPlan) {
  return plan.roundNum == null
    ? `name:${plan.name.trim().toLowerCase()}`
    : `num:${String(plan.roundNum)}`;
}

function executionRoundLabel(plan: ExecutionPlan) {
  return plan.roundNum == null ? plan.name : `第 ${plan.roundNum} 轮`;
}

async function validateExecutionApplications(versionId: string) {
  const sequence = ++executionValidationSequence;
  executionPlansLoading.value = true;
  executionRoundsLoading.value = true;
  executionValidationError.value = "";
  executionApplicationGroups.value = [];
  executionRoundOptions.value = [];
  executionRoundValue.value = undefined;
  try {
    const applications = await listExecutionPlans(versionId, "0");
    if (sequence !== executionValidationSequence) return;
    if (!applications.length) {
      executionValidationError.value = "当前版本下没有可执行应用";
      message.error(executionValidationError.value);
      return;
    }
    const applicationByName = new Map(
      applications.map((application) => [
        executionApplicationKey(application.name),
        application,
      ]),
    );
    const groups = new Map<string, ExecutionApplicationGroup>();
    const missingApplications = new Set<string>();
    for (const testCase of executionCases.value) {
      const applicationName = testCase.applicationPath?.trim();
      if (!applicationName) {
        missingApplications.add("未设置归属应用");
        continue;
      }
      const application = applicationByName.get(
        executionApplicationKey(applicationName),
      );
      if (!application) {
        missingApplications.add(applicationName);
        continue;
      }
      const group = groups.get(application.id) ?? {
        application,
        rounds: [],
        cases: [],
      };
      group.cases.push(testCase);
      groups.set(application.id, group);
    }
    if (missingApplications.size) {
      const versionName =
        executionVersionOptions.value.find((item) => item.value === versionId)
          ?.label ?? versionId;
      executionValidationError.value = `版本「${versionName}」下不存在应用：${[
        ...missingApplications,
      ].join("、")}`;
      message.error(executionValidationError.value);
      return;
    }

    const resolvedGroups = [...groups.values()];
    await Promise.all(
      resolvedGroups.map(async (group) => {
        group.rounds = await listExecutionPlans(
          versionId,
          group.application.id,
        );
      }),
    );
    if (sequence !== executionValidationSequence) return;
    const missingRounds = resolvedGroups.find(
      (group) => group.rounds.length === 0,
    );
    if (missingRounds) {
      executionValidationError.value = `应用「${missingRounds.application.name}」在当前版本下没有可用轮次`;
      message.error(executionValidationError.value);
      return;
    }

    let commonRoundKeys: Set<string> | null = null;
    for (const group of resolvedGroups) {
      const keys = new Set(group.rounds.map(executionRoundKey));
      if (commonRoundKeys === null) {
        commonRoundKeys = keys;
        continue;
      }
      const intersection = new Set<string>();
      for (const key of commonRoundKeys) {
        if (keys.has(key)) intersection.add(key);
      }
      commonRoundKeys = intersection;
    }
    const roundPlans = new Map<string, ExecutionPlan>();
    for (const group of resolvedGroups) {
      for (const round of group.rounds) {
        const key = executionRoundKey(round);
        if (!commonRoundKeys?.has(key) || roundPlans.has(key)) continue;
        roundPlans.set(key, round);
      }
    }
    executionRoundOptions.value = [...roundPlans.entries()]
      .map(([value, round]) => ({
        value,
        label: executionRoundLabel(round),
        sort: round.roundNum == null ? Number.MAX_SAFE_INTEGER : Number(round.roundNum),
      }))
      .sort((left, right) => left.sort - right.sort)
      .map(({ value, label }) => ({ value, label }));
    if (!executionRoundOptions.value.length) {
      executionValidationError.value =
        "所选应用在该版本下没有共同可用轮次";
      message.error(executionValidationError.value);
      return;
    }
    executionApplicationGroups.value = resolvedGroups;
    executionRoundValue.value = executionRoundOptions.value[0].value;
  } catch {
    if (sequence !== executionValidationSequence) return;
    executionValidationError.value = "校验执行应用或轮次失败，请重试";
    message.error(executionValidationError.value);
  } finally {
    if (sequence === executionValidationSequence) {
      executionPlansLoading.value = false;
      executionRoundsLoading.value = false;
    }
  }
}

async function onExecutionVersionChange(value?: string) {
  executionValidationSequence += 1;
  executionValidationError.value = "";
  executionApplicationGroups.value = [];
  executionRoundOptions.value = [];
  executionRoundValue.value = undefined;
  if (!value) {
    executionPlansLoading.value = false;
    executionRoundsLoading.value = false;
    return;
  }
  await validateExecutionApplications(value);
}
function applyRunRecord(result: Result, record: ApiPreproductionRunRecord) {
  result.recordId = record.id;
  result.runId = record.runId ?? undefined;
  result.reportUrl = record.reportUrl ?? undefined;
  result.execution = executionStatusLabel(record.executionStatus);
  if (record.pushStatus === "success") {
    result.delivery = "已推送测管";
  } else if (record.pushStatus === "failed") {
    result.delivery = `推送失败：${record.pushError || "未知原因"}`;
  } else {
    result.delivery = "推送测管中";
  }
}
async function runSelected() {
  if (running.value || publishing.value || !executionCases.value.length) return;
  if (!executionVersionId.value || !executionRoundValue.value) {
    message.warning("请选择版本和轮次");
    return;
  }
  if (executionValidationError.value) {
    message.warning(executionValidationError.value);
    return;
  }
  const roundKey = executionRoundValue.value;
  const groups = executionApplicationGroups.value
    .map((group) => ({
      ...group,
      round: group.rounds.find((round) => executionRoundKey(round) === roundKey),
    }))
    .filter(
      (
        group,
      ): group is ExecutionApplicationGroup & { round: ExecutionPlan } =>
        Boolean(group.round),
    );
  if (!groups.length) {
    message.warning("所选应用没有可用轮次");
    return;
  }
  const targets = [...executionCases.value];
  const versionId = executionVersionId.value;
  const versionLabel =
    executionVersionOptions.value.find((item) => item.value === versionId)
      ?.label ?? versionId;
  running.value = true;
  try {
    results.value = targets.map((c) => ({
      caseId: c.id,
      title: c.title,
      projectId: c.projectId,
      transactionId: c.transactionId,
      execution: "待执行",
      delivery: "—",
    }));
    const resultByCase = new Map(
      results.value.map((result) => [result.caseId, result]),
    );
    executionOpen.value = false;
    for (const group of groups) {
      const runSet = await createPreproductionRunSet(
        group.cases[0].projectId,
        {
          versionId,
          versionLabel,
          applicationId: group.application.id,
          applicationLabel: group.application.name,
          roundId: group.round.id,
          roundLabel: executionRoundLabel(group.round),
          totalCount: group.cases.length,
        },
      );
      const selection = {
        versionId,
        applicationId: group.application.id,
        roundId: group.round.id,
        runSetId: runSet.id,
      };
      await attachPreproductionRunSetCases(
        group.cases[0].projectId,
        runSet.id,
        group.cases.map((testCase) => testCase.id),
      );
      for (const testCase of group.cases) {
        const result = resultByCase.get(testCase.id);
        if (!result) continue;
        result.execution = "执行中";
        try {
          const record = await runPreproductionCaseAndPush(
            result.projectId,
            result.caseId,
            selection,
          );
          applyRunRecord(result, record);
          upsertLatestRunRecord(record);
        } catch (error) {
          result.execution = "请求失败";
          result.delivery =
            error instanceof Error
              ? error.message
              : "执行请求失败，请检查案例步骤配置";
        }
      }
      try {
        await finishPreproductionRunSet(group.cases[0].projectId, runSet.id);
      } catch {
        /* 单条记录已落库，集合汇总失败不影响执行结果展示 */
      }
    }
    await loadLatestRunRecords(cases.value);
    await loadRunSets();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : "创建执行推送集失败",
    );
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
    message.warning("运行推送尚未结束，请完成后离开");
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
    void loadRunSets();
  }
  window.addEventListener("beforeunload", preventUnload);
});
onBeforeUnmount(() => {
  requestSequence += 1;
  optionsSequence += 1;
  selectionSequence += 1;
  if (loadTimer) clearTimeout(loadTimer);
  if (runSetFilterTimer) clearTimeout(runSetFilterTimer);
  tableResizeObserver?.disconnect();
  window.removeEventListener("beforeunload", preventUnload);
});
</script>

<style scoped>
.case-management-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 16px 20px 18px;
  background: var(--cf-canvas, #f5f6f8);
}
.management-card {
  border: 1px solid var(--cf-border, #e5e7eb);
  border-radius: 10px;
  background: white;
  padding: 16px;
}
.case-list-card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: auto;
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
  flex-wrap: nowrap;
  flex-shrink: 0;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--cf-border);
}
.list-card-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
}
.list-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
.case-batch-area {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  white-space: nowrap;
}
.case-selection-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--cf-text-secondary, #687280);
  font-size: 13px;
}
.case-selection-meta strong {
  color: var(--cf-brand);
  font-weight: 600;
}
.case-batch-actions {
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.case-action-divider {
  width: 1px;
  height: 20px;
  background: var(--cf-border, #e5e7eb);
}
.list-card-tabs button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 1px 8px;
  border: 0;
  background: transparent;
  color: #667085;
  font-size: 14px;
  cursor: pointer;
}
.list-card-tabs button.active {
  color: var(--cf-brand);
  font-weight: 600;
}
.list-card-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--cf-brand);
  content: "";
}
.list-card-tabs button span {
  padding: 0 8px;
  border-radius: 10px;
  background: var(--cf-brand-soft);
  color: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
}
.run-set-filters {
  flex: 1 1 280px;
  min-width: 220px;
  max-width: 360px;
}
.run-set-search :deep(.ant-input-affix-wrapper) {
  border-radius: 8px;
}
.filters {
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
}
.filters .ant-select {
  flex: 0 1 190px;
  width: 190px;
  min-width: 150px;
}
.filters .filter-application-select {
  flex-basis: 210px;
  width: 210px;
}
.filters :deep(.ant-checkbox-wrapper) {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  white-space: nowrap;
  margin: 0;
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
.management-card :deep(.ant-alert) {
  margin: 0 16px 12px;
  flex-shrink: 0;
}
.run-record-cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 3px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.run-record-cell:hover,
.run-record-cell:focus-visible {
  background: #fff5f7;
  outline: none;
}
.run-record-statuses {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.run-status-pill {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  max-width: 50%;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 9px;
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-status-pill::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}
.run-status-pill--running,
.run-status-pill--push-pending {
  border-color: #b2ddff;
  background: #eff8ff;
  color: #175cd3;
}
.run-status-pill--passed,
.run-status-pill--push-success {
  border-color: #abefc6;
  background: #ecfdf3;
  color: #067647;
}
.run-status-pill--failed {
  border-color: #fedf89;
  background: #fffaeb;
  color: #b54708;
}
.run-status-pill--error,
.run-status-pill--push-failed {
  border-color: #fecdca;
  background: #fef3f2;
  color: #b42318;
}
.run-record-summary {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--cf-text-secondary, #687280);
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-record-empty {
  color: #98a2b3;
  font-size: 12px;
}
.run-records-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.run-records-head strong,
.run-records-head span {
  display: block;
}
.run-records-head strong {
  color: #1d2939;
}
.run-records-head span {
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
}
.run-record-detail {
  display: grid;
  gap: 4px;
  color: #475467;
  font-size: 12px;
}
.run-record-error {
  color: #b42318;
  word-break: break-word;
}
.run-set-selection,
.run-set-counts,
.run-set-detail-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  color: #475467;
  font-size: 12px;
}
.run-set-selection span:not(:last-child)::after {
  margin-left: 10px;
  color: #d0d5dd;
  content: "/";
}
.run-set-counts .is-success {
  color: #067647;
}
.run-set-counts .is-warning {
  color: #b54708;
}
.run-set-counts .is-error {
  color: #b42318;
}
.run-set-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.run-set-detail-head strong,
.run-set-detail-head span {
  display: block;
}
.run-set-detail-head span {
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
}
.run-set-detail-summary {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fafbfc;
}
.report-link {
  margin-left: 12px;
}
.dialog-intro {
  margin: 0 0 18px;
  color: #475467;
  font-size: 13px;
  line-height: 1.7;
}
:global(.management-dialog .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid #eaecf0;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(16, 24, 40, 0.2);
}
:global(.management-dialog.ant-modal-centered .ant-modal) {
  top: -4vh;
}
:global(.management-dialog .ant-modal-header) {
  margin: 0;
  padding: 20px 24px 14px;
  border-bottom: 1px solid #f0f2f5;
}
:global(.management-dialog .ant-modal-title) {
  color: #1d2939;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}
:global(.management-dialog .ant-modal-body) {
  padding: 20px 24px 10px;
}
:global(.management-dialog .ant-modal-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 14px 24px 18px;
  border-top: 1px solid #f0f2f5;
}
:global(.management-dialog .ant-modal-footer .ant-btn) {
  min-width: 88px;
  height: 34px;
  border-radius: 8px;
}
:global(.management-dialog .ant-modal-close) {
  top: 17px;
  right: 18px;
}
:global(.management-dialog .ant-alert) {
  margin-bottom: 16px;
  border-radius: 10px;
}
:global(.management-dialog .execution-fields),
:global(.management-dialog .export-field) {
  grid-template-columns: 84px minmax(0, 1fr);
  margin: 0;
  padding: 16px;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background: #fafbfc;
}
:global(.management-dialog .execution-fields > label),
:global(.management-dialog .export-field label) {
  color: #475467;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
:global(.management-dialog .execution-fields .ant-select),
:global(.management-dialog .export-field .ant-select) {
  width: 100%;
}
.execution-fields {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 14px 12px;
  margin-top: 20px;
}
.execution-fields > label {
  white-space: nowrap;
}
.execution-application-summary {
  min-height: 32px;
  color: #667085;
  font-size: 12px;
}
.execution-application-summary :deep(.ant-tag) {
  margin: 0 6px 6px 0;
}
.execution-validation-error {
  color: #b42318;
}
.execution-application-hint {
  display: block;
  margin-top: 4px;
  color: #98a2b3;
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
@media (max-width: 1400px) {
  .list-card-head {
    flex-wrap: wrap;
  }
  .filters {
    flex-wrap: wrap;
    width: 100%;
  }
  .run-set-filters {
    max-width: none;
  }
  .case-batch-area {
    width: 100%;
    justify-content: flex-end;
  }
}
@media (max-width: 900px) {
  .case-management-page {
    padding: 12px;
  }
  .management-header {
    align-items: flex-start;
  }
  .management-card:not(.case-list-card) {
    padding: 12px;
  }
  .filters {
    gap: 10px;
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
