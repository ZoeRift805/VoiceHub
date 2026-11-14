<template>
  <button
    type="button"
    class="drilldown-link"
    :class="{ 'drilldown-link--mono': mono }"
    :disabled="disabled"
    @click="$emit('activate')"
  >
    <span>{{ label }}</span>
    <Icon name="external-link" :size="12" aria-hidden="true" />
  </button>
</template>

<script setup>
import Icon from '~/components/UI/Icon.vue'

defineProps({
  label: { type: String, required: true },
  mono: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})

defineEmits(['activate'])
</script>

<style scoped>
.drilldown-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--primary) 52%, transparent);
  padding: 0;
  color: var(--text-link, var(--primary));
  background: transparent;
  font-size: inherit;
  line-height: 1.3;
  text-align: left;
  transition: color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.drilldown-link--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.drilldown-link :deep(svg) {
  opacity: 0;
  transform: translate(-2px, 2px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.drilldown-link:hover:not(:disabled),
.drilldown-link:focus-visible {
  border-bottom-style: solid;
  border-color: var(--text-link-hover, var(--primary-hover));
  color: var(--text-link-hover, var(--primary-hover));
  outline: 0;
}

.drilldown-link:hover:not(:disabled) :deep(svg),
.drilldown-link:focus-visible :deep(svg) {
  opacity: 1;
  transform: translate(0, 0);
}

.drilldown-link:active:not(:disabled) {
  transform: translateY(1px);
}

.drilldown-link:disabled {
  cursor: not-allowed;
  border-color: color-mix(in srgb, var(--text-tertiary) 50%, transparent);
  color: var(--text-tertiary);
}

:global(:root[data-theme='ClassicLight']) .drilldown-link,
:global(:root[data-theme='ModernLight']) .drilldown-link {
  border-color: color-mix(in srgb, var(--text-secondary) 52%, transparent);
  color: var(--text-secondary);
}

:global(:root[data-theme='ClassicLight']) .drilldown-link:hover:not(:disabled),
:global(:root[data-theme='ClassicLight']) .drilldown-link:focus-visible,
:global(:root[data-theme='ModernLight']) .drilldown-link:hover:not(:disabled),
:global(:root[data-theme='ModernLight']) .drilldown-link:focus-visible {
  border-color: var(--text-primary);
  color: var(--text-primary);
}
</style>
