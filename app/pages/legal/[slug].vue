<template>
  <main class="legal-page">
    <AppSpinner v-if="loading" />
    <article v-else-if="document" class="legal-content">
      <h1>{{ document.name }}</h1>
      <div class="markdown-body" v-html="renderedContent" />
    </article>
    <p v-else>{{ locale.notFound }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppSpinner from '~/components/UI/Common/AppSpinner.vue'
import { renderMarkdown } from '~/utils/markdown'
import { useLocale } from '~/utils/locale'

const route = useRoute()
const { common } = useLocale()
const locale = computed(() => ({ notFound: common.value?.notFound || '文档不存在' }))
const document = ref(null)
const loading = ref(true)
const loadError = ref(false)
const renderedContent = computed(() => document.value ? renderMarkdown(document.value.content) : '')
onMounted(async () => {
  try {
    const response = await $fetch('/api/legal-documents')
    document.value = response.documents?.find((item) => item.slug === route.params.slug) || null
  } catch { loadError.value = true } finally { loading.value = false }
})
</script>

<style scoped>
.legal-page { max-width: 900px; margin: 0 auto; padding: 48px 20px; color: var(--text-primary); }
.legal-content { background: var(--bg-secondary); border: 1px solid var(--border-secondary); border-radius: 16px; padding: 32px; }
h1 { margin-bottom: 24px; font-size: 28px; font-weight: 800; }
</style>
