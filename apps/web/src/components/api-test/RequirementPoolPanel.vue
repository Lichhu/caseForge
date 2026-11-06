<template>
  <section class="requirement-pool-panel">
    <header class="pool-header">
      <div class="pool-heading">
        <span class="pool-kicker">需求平台</span>
        <div class="pool-title-line">
          <h2>人员池维护</h2>
          <span class="pool-count">{{ members.length }} 位成员</span>
        </div>
        <p>
          普通成员可以认领需求，分发人拥有需求分发与管理权限。
        </p>
      </div>
      <div class="pool-summary" aria-label="人员角色统计">
        <div class="pool-summary-item">
          <span>普通成员</span>
          <strong>{{ regularCount }}</strong>
        </div>
        <div class="pool-summary-item is-dispatcher">
          <span>分发人</span>
          <strong>{{ dispatcherCount }}</strong>
        </div>
      </div>
    </header>

    <section class="pool-workspace">
      <div class="pool-toolbar">
        <div class="pool-toolbar-copy">
          <strong>成员列表</strong>
          <span>
            {{
              canEdit
                ? "选择一个用户加入人员池，或移除普通成员。"
                : "当前为只读视图，仅可查看成员与角色信息。"
            }}
          </span>
        </div>
        <div v-if="canEdit" class="pool-toolbar-actions">
          <a-select
            v-model:value="selectedUser"
            show-search
            :filter-option="false"
            :search-value="search"
            :loading="candidatesLoading"
            :options="
              candidates.map((user) => ({
                value: user.userName,
                label: `${user.nickName}（${user.userName}）`,
              }))
            "
            placeholder="搜索姓名或账号"
            :virtual="true"
            class="pool-user-select"
            @search="handleSearch"
          />
          <a-select
            v-model:value="selectedRole"
            :options="roleOptions"
            class="pool-role-select"
          />
          <a-button
            type="primary"
            :loading="saving"
            :disabled="!selectedUser"
            @click="addSelectedUser"
          >
            <template #icon><PlusOutlined /></template>
            {{ addButtonLabel }}
          </a-button>
        </div>
        <span v-else class="pool-readonly-badge">
          <EyeOutlined />
          只读
        </span>
      </div>

      <div
        class="pool-table"
        :class="{ 'is-readonly': !canEdit }"
        role="table"
        aria-label="需求人员池成员"
      >
        <div class="pool-table-head" role="row">
          <span role="columnheader">成员</span>
          <span role="columnheader">角色</span>
          <span role="columnheader">加入时间</span>
          <span v-if="canEdit" role="columnheader">操作</span>
        </div>

        <a-spin :spinning="loading">
          <div class="pool-table-body">
            <div
              v-for="item in members"
              :key="item.id"
              class="pool-table-row"
              :class="{ 'is-dispatcher': item.isDispatcher }"
              role="row"
            >
              <div class="pool-member-identity" role="cell">
                <span
                  class="pool-member-avatar"
                  :class="{ 'is-dispatcher': item.isDispatcher }"
                  aria-hidden="true"
                >
                  {{ memberInitial(item) }}
                </span>
                <span class="pool-member-copy">
                  <strong class="pool-member-name">{{ item.nickName }}</strong>
                  <small class="pool-member-account">{{ item.userName }}</small>
                </span>
              </div>
              <div role="cell">
                <span
                  class="pool-role"
                  :class="{ 'is-dispatcher': item.isDispatcher }"
                >
                  {{ item.isDispatcher ? "分发人" : "普通成员" }}
                </span>
              </div>
              <div class="pool-joined-at" role="cell">
                <time :datetime="item.createdAt">
                  {{ formatJoinedAt(item.createdAt) }}
                </time>
              </div>
              <div v-if="canEdit" class="pool-member-actions" role="cell">
                <a-button
                  v-if="canRemoveMember(item)"
                  type="text"
                  size="small"
                  danger
                  :loading="saving"
                  @click="removeUser(item)"
                >
                  <template #icon><DeleteOutlined /></template>
                  移出
                </a-button>
                <span v-else-if="item.isDispatcher" class="pool-protected">
                  通知管理员移出
                </span>
            </div>
            </div>

            <div v-if="!loading && members.length === 0" class="pool-empty">
              <TeamOutlined />
              <strong>人员池暂无成员</strong>
              <span>
                {{
                  canEdit
                    ? "从上方搜索用户并添加第一位成员。"
                    : "当前人员池暂无可见成员。"
                }}
              </span>
            </div>
          </div>
        </a-spin>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { message } from "ant-design-vue";
import {
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  TeamOutlined,
} from "@ant-design/icons-vue";
import {
  addDispatcher,
  addPoolMember,
  fetchPoolMembers,
  removeDispatcher,
  removePoolMember,
  searchPoolCandidates,
  type RequirementPoolMember,
} from "@/api/requirementPlatform";
import { getUserName } from "@/utils/userContext";

const props = withDefaults(
  defineProps<{
    canEdit?: boolean;
  }>(),
  { canEdit: false },
);

const loading = ref(false);
const saving = ref(false);
const currentUserName = getUserName();
const candidatesLoading = ref(false);
const members = ref<RequirementPoolMember[]>([]);
const candidates = ref<Array<{ userName: string; nickName: string }>>([]);
const selectedUser = ref<string>();
const search = ref("");
const selectedRole = ref<"member" | "dispatcher">("member");
const roleOptions = [
  { value: "member", label: "普通成员" },
  { value: "dispatcher", label: "分发人" },
];
const regularCount = computed(
  () => members.value.filter((member) => !member.isDispatcher).length,
);
const dispatcherCount = computed(
  () => members.value.filter((member) => member.isDispatcher).length,
);
const addButtonLabel = computed(() =>
  selectedRole.value === "dispatcher" ? "添加分发人" : "添加成员",
);
const joinedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function memberInitial(member: RequirementPoolMember) {
  return (member.nickName?.trim() || member.userName?.trim() || "?")
    .slice(0, 1)
    .toUpperCase();
}

function canRemoveMember(member: RequirementPoolMember) {
  if (!props.canEdit) return false;
  if (!member.isDispatcher) return true;
  return currentUserName === "system";
}

function formatJoinedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : joinedAtFormatter.format(date).replaceAll("/", "-");
}

async function loadMembers() {
  loading.value = true;
  try {
    members.value = await fetchPoolMembers();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "加载人员池失败");
  } finally {
    loading.value = false;
  }
}

let searchTimer: number | undefined;
function handleSearch(value: string) {
  search.value = value;
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void loadCandidates(value), 250);
}

async function loadCandidates(keyword: string) {
  candidatesLoading.value = true;
  try {
    candidates.value = await searchPoolCandidates(keyword);
  } catch (error) {
    message.error(error instanceof Error ? error.message : "搜索用户失败");
  } finally {
    candidatesLoading.value = false;
  }
}

async function addSelectedUser() {
  if (!selectedUser.value) return;
  const role = selectedRole.value;
  saving.value = true;
  try {
    if (role === "dispatcher") {
      await addDispatcher(selectedUser.value);
    } else {
      await addPoolMember(selectedUser.value);
    }
    selectedUser.value = undefined;
    selectedRole.value = "member";
    search.value = "";
    await Promise.all([loadMembers(), loadCandidates("")]);
    message.success(
      role === "dispatcher" ? "已添加为分发人" : "已添加到人员池",
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : "添加失败");
  } finally {
    saving.value = false;
  }
}

async function removeUser(member: RequirementPoolMember) {
  saving.value = true;
  try {
    if (member.isDispatcher) {
      if (currentUserName !== "system") {
        message.warning("仅 system 分发人可移除分发人");
        return;
      }
      await removeDispatcher(member.id.replace(/^dispatcher:/, ""));
    } else {
      await removePoolMember(member.id);
    }
    await Promise.all([loadMembers(), loadCandidates(search.value)]);
    message.success(
      member.isDispatcher ? "已移除分发人" : "已从人员池移除",
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : "移除失败");
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void (props.canEdit
    ? Promise.all([loadMembers(), loadCandidates("")])
    : loadMembers());
});

onUnmounted(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
});
</script>

<style scoped>
.requirement-pool-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 12px;
  background: var(--cf-surface, #fff);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  overflow: hidden;
}

.pool-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 24px 28px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background:
    linear-gradient(110deg, rgba(182, 15, 45, 0.035), transparent 46%),
    var(--cf-surface, #fff);
}

.pool-heading {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.pool-kicker {
  color: var(--cf-brand, #b60f2d);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pool-title-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pool-title-line h2 {
  margin: 0;
  color: var(--cf-text, #1d2129);
  font-size: 22px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.pool-count {
  padding: 2px 8px;
  border: 1px solid rgba(182, 15, 45, 0.12);
  border-radius: 999px;
  background: rgba(182, 15, 45, 0.055);
  color: var(--cf-brand, #b60f2d);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.pool-heading p {
  margin: 0;
  color: var(--cf-text-muted, #667085);
  font-size: 13px;
  line-height: 1.55;
  text-wrap: pretty;
}

.pool-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(112px, 1fr));
  flex: none;
  gap: 10px;
}

.pool-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  min-width: 124px;
  padding: 12px 14px;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
}

.pool-summary-item span {
  color: var(--cf-text-muted, #667085);
  font-size: 12px;
  white-space: nowrap;
}

.pool-summary-item strong {
  color: var(--cf-text, #1d2129);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.pool-summary-item.is-dispatcher {
  border-color: rgba(182, 15, 45, 0.14);
  background: rgba(182, 15, 45, 0.045);
}

.pool-summary-item.is-dispatcher strong {
  color: var(--cf-brand, #b60f2d);
}

.pool-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 20px 28px 24px;
}

.pool-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 14px;
}

.pool-toolbar-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pool-toolbar-copy strong {
  color: var(--cf-text, #1d2129);
  font-size: 15px;
  font-weight: 650;
}

.pool-toolbar-copy span {
  color: var(--cf-text-muted, #8a8f99);
  font-size: 12px;
}

.pool-toolbar-actions {
  display: flex;
  flex: 0 1 700px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pool-user-select {
  flex: 1;
  min-width: 260px;
}

.pool-role-select {
  flex: 0 0 116px;
}

.pool-readonly-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 999px;
  background: #f8f9fb;
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}

.pool-table {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--cf-border, #e4e7ec);
  border-radius: 10px;
  overflow: hidden;
}

.pool-table-head,
.pool-table-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px 180px 130px;
  align-items: center;
}

.pool-table.is-readonly .pool-table-head,
.pool-table.is-readonly .pool-table-row {
  grid-template-columns: minmax(260px, 1fr) 160px 180px;
}

.pool-table-head {
  flex: none;
  min-height: 42px;
  padding: 0 20px;
  border-bottom: 1px solid var(--cf-border, #e4e7ec);
  background: #f8f9fb;
  color: var(--cf-text-muted, #667085);
  font-size: 12px;
  font-weight: 600;
}

.pool-table > :deep(.ant-spin-nested-loading) {
  flex: 1;
  min-height: 0;
}

.pool-table :deep(.ant-spin-nested-loading > div),
.pool-table :deep(.ant-spin-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.pool-table-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.pool-table-row {
  min-height: 68px;
  padding: 10px 20px;
  border-bottom: 1px solid #f0f1f4;
  background: var(--cf-surface, #fff);
  transition:
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.pool-table-row:last-child {
  border-bottom: 0;
}

.pool-table-row:hover {
  position: relative;
  z-index: 1;
  background: #fbfbfd;
  box-shadow: inset 3px 0 0 rgba(182, 15, 45, 0.22);
}

.pool-member-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.pool-member-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f0f2f5;
  color: #596273;
  font-size: 14px;
  font-weight: 700;
}

.pool-member-avatar.is-dispatcher {
  background: rgba(182, 15, 45, 0.085);
  color: var(--cf-brand, #b60f2d);
}

.pool-member-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.pool-member-name {
  overflow: hidden;
  color: var(--cf-text, #1d2129);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pool-member-account {
  color: var(--cf-text-muted, #8a8f99);
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.35;
}

.pool-role {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid #e4e7ec;
  border-radius: 999px;
  background: #f8f9fb;
  color: #596273;
  font-size: 12px;
  font-weight: 600;
}

.pool-role.is-dispatcher {
  border-color: rgba(182, 15, 45, 0.14);
  background: rgba(182, 15, 45, 0.06);
  color: var(--cf-brand, #b60f2d);
}

.pool-joined-at {
  color: #667085;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pool-member-actions {
  display: flex;
  justify-content: flex-start;
}

.pool-member-actions :deep(.ant-btn) {
  margin-left: -8px;
}

.pool-protected {
  color: #a0a5af;
  font-size: 12px;
}

.pool-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  gap: 6px;
  color: var(--cf-text-muted, #8a8f99);
}

.pool-empty :deep(svg) {
  margin-bottom: 4px;
  font-size: 28px;
}

.pool-empty strong {
  color: var(--cf-text, #1d2129);
  font-size: 14px;
}

.pool-empty span {
  font-size: 12px;
}

@media (max-width: 900px) {
  .pool-header,
  .pool-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .pool-summary,
  .pool-toolbar-actions {
    flex-basis: auto;
    width: 100%;
  }

  .pool-table-head,
  .pool-table-row {
    grid-template-columns: minmax(180px, 1fr) 110px 150px 90px;
  }

  .pool-table.is-readonly .pool-table-head,
  .pool-table.is-readonly .pool-table-row {
    grid-template-columns: minmax(180px, 1fr) 110px 150px;
  }
}

@media (max-width: 620px) {
  .pool-header {
    padding: 20px;
  }

  .pool-workspace {
    padding: 16px 20px 20px;
  }

  .pool-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pool-toolbar-actions {
    flex-wrap: wrap;
  }

  .pool-user-select {
    min-width: 100%;
  }

  .pool-role-select {
    flex: 1;
  }

  .pool-table-head {
    display: none;
  }

  .pool-table-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .pool-table-row > [role="cell"]:nth-child(2) {
    grid-column: 2;
    grid-row: 1;
  }

  .pool-table-row > [role="cell"]:nth-child(3) {
    grid-column: 1;
    grid-row: 2;
  }

  .pool-table-row > [role="cell"]:nth-child(4) {
    grid-column: 2;
    grid-row: 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pool-table-row {
    transition: none;
  }
}
</style>
