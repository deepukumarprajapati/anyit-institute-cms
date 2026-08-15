<template>
  <Teleport to="body">
    <div v-show="open" class="dd-root" :class="{ 'dd-root--open': open }">
      <div class="dd-mask" aria-hidden="true" />
      <div
        ref="panelRef"
        class="dd-panel"
        :class="{ 'dd-panel--dragging': dragging }"
        :style="panelStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div class="dd-header">
          <strong class="dd-title">{{ title }}</strong>
          <button type="button" class="dd-close" aria-label="Close" @click="close" @pointerdown.stop>
            ×
          </button>
        </div>
        <div class="dd-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  /** localStorage key so position is remembered */
  storageKey?: string;
  /** Panel width in px (default 680) */
  width?: number;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
}>();

const STORAGE_PREFIX = 'anyit.draggable-modal.';
const BODY_OPEN_CLASS = 'anyit-draggable-dialog-open';
const panelRef = ref<HTMLElement | null>(null);
const pos = ref<{ x: number; y: number } | null>(null);
const dragging = ref(false);

const panelWidth = computed(() => Math.max(320, Number(props.width) || 680));

const NON_DRAG = [
  'input',
  'textarea',
  'button',
  'a',
  'select',
  'option',
  '.ant-input',
  '.ant-input-affix-wrapper',
  '.ant-input-number',
  '.ant-input-number-input',
  '.ant-select',
  '.ant-select-selector',
  '.ant-picker',
  '.ant-picker-input',
  '.ant-btn',
  '.dd-close',
  '[contenteditable="true"]',
].join(',');

let dragOrigin = { x: 0, y: 0 };
let pointerOrigin = { x: 0, y: 0 };
let activePointerId: number | null = null;

function storageKey() {
  return STORAGE_PREFIX + (props.storageKey || 'dialog');
}

function setBodyOpenClass(on: boolean) {
  document.body.classList.toggle(BODY_OPEN_CLASS, on);
}

function readPos() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return null;
}

function writePos(p: { x: number; y: number }) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function clamp(p: { x: number; y: number }, el: HTMLElement) {
  const w = el.offsetWidth || panelWidth.value;
  const h = el.offsetHeight || 360;
  return {
    x: Math.min(Math.max(p.x, 8 - w + 96), Math.max(8, window.innerWidth - 96)),
    y: Math.min(Math.max(p.y, 8), Math.max(8, window.innerHeight - 96)),
  };
}

function defaultPos(el: HTMLElement) {
  const w = el.offsetWidth || panelWidth.value;
  return {
    x: Math.max(24, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(48, Math.round(window.innerHeight * 0.1)),
  };
}

const panelStyle = computed(() => {
  const base = {
    width: `min(${panelWidth.value}px, calc(100vw - 24px))`,
  };
  if (!pos.value) {
    return {
      ...base,
      visibility: 'hidden' as const,
    };
  }
  return {
    ...base,
    position: 'fixed' as const,
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`,
    margin: '0',
    transform: 'none',
    visibility: 'visible' as const,
  };
});

function isNonDragTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  const hit = target.closest(NON_DRAG);
  if (!hit) return false;
  // Disabled / readonly fields: allow drag (can't type anyway)
  if (hit instanceof HTMLInputElement || hit instanceof HTMLTextAreaElement) {
    if (hit.disabled || hit.readOnly) return false;
  }
  if (hit.closest('.ant-input-disabled, .ant-input-affix-wrapper-disabled, .ant-select-disabled')) {
    return false;
  }
  return true;
}

function cursorForTarget(target: EventTarget | null) {
  return isNonDragTarget(target) ? '' : 'grab';
}

async function placeOnOpen() {
  await nextTick();
  const el = panelRef.value;
  if (!el) return;
  // Force layout so width is known
  void el.offsetWidth;
  const saved = readPos();
  pos.value = clamp(saved || defaultPos(el), el);
}

function close() {
  emit('update:open', false);
}

function onPointerDown(e: PointerEvent) {
  if (!props.open || e.button !== 0) return;
  if (isNonDragTarget(e.target)) return;
  const el = panelRef.value;
  if (!el || !pos.value) return;

  dragging.value = true;
  activePointerId = e.pointerId;
  pointerOrigin = { x: e.clientX, y: e.clientY };
  dragOrigin = { ...pos.value };
  el.setPointerCapture(e.pointerId);
  el.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  const el = panelRef.value;
  if (!el) return;

  if (!dragging.value) {
    el.style.cursor = cursorForTarget(e.target) || 'grab';
    return;
  }
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  pos.value = clamp(
    {
      x: dragOrigin.x + (e.clientX - pointerOrigin.x),
      y: dragOrigin.y + (e.clientY - pointerOrigin.y),
    },
    el
  );
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  const el = panelRef.value;
  dragging.value = false;
  activePointerId = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (el) {
    el.style.cursor = 'grab';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pos.value) {
      pos.value = clamp(pos.value, el);
      writePos(pos.value);
    }
  }
}

watch(
  () => props.open,
  (open) => {
    setBodyOpenClass(open);
    if (open) placeOnOpen();
    else {
      dragging.value = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  setBodyOpenClass(false);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});
</script>

<style scoped>
.dd-root {
  position: fixed;
  inset: 0;
  z-index: 1100;
  pointer-events: none;
}
.dd-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.dd-panel {
  pointer-events: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12);
  border: 1px solid #f0f0f0;
  cursor: grab;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 24px);
  z-index: 1;
}
.dd-panel--dragging {
  cursor: grabbing;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
}
.dd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  border-radius: 10px 10px 0 0;
}
.dd-title {
  font-size: 16px;
}
.dd-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
  padding: 0 4px;
}
.dd-close:hover {
  color: rgba(0, 0, 0, 0.88);
}
.dd-body {
  padding: 18px 20px 20px;
  overflow: auto;
}
.dd-body :deep(input),
.dd-body :deep(textarea),
.dd-body :deep(button),
.dd-body :deep(.ant-btn),
.dd-body :deep(.ant-select),
.dd-body :deep(.ant-picker),
.dd-body :deep(.ant-input-number),
.dd-body :deep(.ant-input-affix-wrapper) {
  cursor: auto;
}
.dd-body :deep(.ant-select-selector),
.dd-body :deep(.ant-picker) {
  cursor: pointer;
}
</style>

<!-- Dropdowns teleport to body; keep them above this dialog (z-index 1100) -->
<style>
body.anyit-draggable-dialog-open .ant-select-dropdown,
body.anyit-draggable-dialog-open .ant-picker-dropdown,
body.anyit-draggable-dialog-open .ant-dropdown,
body.anyit-draggable-dialog-open .ant-cascader-dropdown,
body.anyit-draggable-dialog-open .ant-mentions-dropdown {
  z-index: 1300 !important;
}
</style>