<template>
  <footer class="library-editor-footer">
    <div class="library-editor-footer__start">
      <slot name="start" />
    </div>
    <div class="library-editor-footer__end">
      <slot name="end" />
    </div>
  </footer>
</template>

<style scoped>
.library-editor-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 65px;
  padding: 14px 22px;
  border-top: 1px solid var(--cf-border, #e4e7ec);
  background: #fafbfc;
}

.library-editor-footer__start,
.library-editor-footer__end {
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-editor-footer__end {
  justify-content: flex-end;
}
</style>
