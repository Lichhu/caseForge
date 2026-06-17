import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import {
  configureAppMessage,
  dismissAppMessages,
} from "@/utils/globalFeedback";

const IMMERSIVE_BODY_CLASS = "cf-immersive-active";

export function useImmersiveWorkspace(onViewportRefresh?: () => void) {
  const immersiveMode = ref(false);
  const immersiveDockOpen = ref(false);
  const orbDragging = ref(false);
  const orbSuppressClick = ref(false);
  const orbCloseTimer = ref<number | null>(null);
  const orbPosition = ref({ x: 0, y: 0 });
  const orbDragState = ref({
    pointerId: 0,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const orbSize = 54;
  const orbMargin = 12;

  const immersiveOrbStyle = computed(() => ({
    left: `${orbPosition.value.x}px`,
    top: `${orbPosition.value.y}px`,
    right: "auto",
    bottom: "auto",
  }));

  const orbPanelRight = computed(() => orbPosition.value.x < 260);
  const orbPanelBelow = computed(() => orbPosition.value.y < 320);

  function scheduleViewportRefresh() {
    onViewportRefresh?.();
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function resetOrbPosition() {
    orbPosition.value = clampOrbPosition({
      x: window.innerWidth - orbSize - 22,
      y: window.innerHeight - orbSize - 22,
    });
  }

  async function enterImmersiveMode() {
    dismissAppMessages();
    immersiveMode.value = true;
    immersiveDockOpen.value = true;
    document.body.classList.add(IMMERSIVE_BODY_CLASS);
    resetOrbPosition();
    await nextTick();
    configureAppMessage();
    scheduleViewportRefresh();
  }

  async function exitImmersiveMode() {
    dismissAppMessages();
    immersiveMode.value = false;
    immersiveDockOpen.value = false;
    document.body.classList.remove(IMMERSIVE_BODY_CLASS);
    await nextTick();
    configureAppMessage();
    // 等顶栏/导航恢复后再触发 resize，避免退出全屏后 flex 高度链未重算
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scheduleViewportRefresh();
      });
    });
  }

  function startOrbDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    orbDragging.value = true;
    orbDragState.value = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: orbPosition.value.x,
      originY: orbPosition.value.y,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", moveOrbDrag);
    window.addEventListener("pointerup", stopOrbDrag);
  }

  function moveOrbDrag(event: PointerEvent) {
    if (!orbDragging.value || event.pointerId !== orbDragState.value.pointerId)
      return;
    const deltaX = event.clientX - orbDragState.value.startX;
    const deltaY = event.clientY - orbDragState.value.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      orbDragState.value.moved = true;
    }
    orbPosition.value = clampOrbPosition({
      x: orbDragState.value.originX + deltaX,
      y: orbDragState.value.originY + deltaY,
    });
  }

  function stopOrbDrag(event: PointerEvent) {
    if (event.pointerId !== orbDragState.value.pointerId) return;
    orbDragging.value = false;
    orbSuppressClick.value = orbDragState.value.moved;
    window.removeEventListener("pointermove", moveOrbDrag);
    window.removeEventListener("pointerup", stopOrbDrag);
  }

  function toggleImmersiveDock() {
    if (orbSuppressClick.value) {
      orbSuppressClick.value = false;
      return;
    }
    immersiveDockOpen.value = !immersiveDockOpen.value;
  }

  function openImmersiveDock() {
    cancelOrbClose();
    immersiveDockOpen.value = true;
  }

  function closeImmersiveDock() {
    if (orbDragging.value) return;
    cancelOrbClose();
    orbCloseTimer.value = window.setTimeout(() => {
      immersiveDockOpen.value = false;
      orbCloseTimer.value = null;
    }, 420);
  }

  function cancelOrbClose() {
    if (orbCloseTimer.value === null) return;
    window.clearTimeout(orbCloseTimer.value);
    orbCloseTimer.value = null;
  }

  function clampOrbPosition(position: { x: number; y: number }) {
    return {
      x: Math.min(
        Math.max(position.x, orbMargin),
        window.innerWidth - orbSize - orbMargin,
      ),
      y: Math.min(
        Math.max(position.y, orbMargin),
        window.innerHeight - orbSize - orbMargin,
      ),
    };
  }

  function bindImmersiveListeners(onKeydown: (event: KeyboardEvent) => void) {
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", () => {
      orbPosition.value = clampOrbPosition(orbPosition.value);
    });
    resetOrbPosition();
  }

  function unbindImmersiveListeners(onKeydown: (event: KeyboardEvent) => void) {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("pointermove", moveOrbDrag);
    window.removeEventListener("pointerup", stopOrbDrag);
    cancelOrbClose();
  }

  onBeforeUnmount(() => {
    cancelOrbClose();
    document.body.classList.remove(IMMERSIVE_BODY_CLASS);
  });

  return {
    immersiveMode,
    immersiveDockOpen,
    orbDragging,
    orbPanelRight,
    orbPanelBelow,
    immersiveOrbStyle,
    enterImmersiveMode,
    exitImmersiveMode,
    startOrbDrag,
    toggleImmersiveDock,
    openImmersiveDock,
    closeImmersiveDock,
    scheduleViewportRefresh,
    bindImmersiveListeners,
    unbindImmersiveListeners,
  };
}
