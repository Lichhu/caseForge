import { message } from 'ant-design-vue';

export const GLOBAL_FEEDBACK_ROOT_ID = 'global-feedback-root';
const MESSAGE_DURATION_SEC = 3;

export function ensureGlobalFeedbackRoot() {
  let root = document.getElementById(GLOBAL_FEEDBACK_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = GLOBAL_FEEDBACK_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

export function isImmersiveMode() {
  return Boolean(document.querySelector('.app-frame.immersive-mode'));
}

/** 清理 message.config 切换后遗留的 DOM，避免全屏下残留遮罩拦截点击 */
function cleanupOrphanMessageDom() {
  document.querySelectorAll('.ant-message').forEach((node) => node.remove());
}

/** 进入/退出全屏或切换容器前调用，关闭当前与残留的提示层 */
export function dismissAppMessages() {
  message.destroy();
  cleanupOrphanMessageDom();
}

export function configureAppMessage() {
  dismissAppMessages();
  const root = ensureGlobalFeedbackRoot();
  message.config({
    top: isImmersiveMode() ? '20px' : '64px',
    duration: MESSAGE_DURATION_SEC,
    maxCount: 4,
    getContainer: () => root,
  });
}

export function configureScenarioModalMessage() {
  configureAppMessage();
}
