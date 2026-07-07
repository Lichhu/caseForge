/** 需盖过沉浸全屏工作区（.immersive-stage z-index: 1100）的浮层 */
export const IMMERSIVE_OVERLAY_Z_INDEX = 2600;

/** 叠在 IMMERSIVE 浮层之上的二级弹窗（如环境维护内的编辑表单） */
export const NESTED_OVERLAY_Z_INDEX = IMMERSIVE_OVERLAY_Z_INDEX + 100;
