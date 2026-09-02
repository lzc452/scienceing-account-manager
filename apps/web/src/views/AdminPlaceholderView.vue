<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'

const route = useRoute()
const title = computed(() => route.meta.title ?? '管理')
</script>

<template>
  <AppShell>
    <Card>
      <CardHeader>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>该管理页面将在后续阶段（t8）实现。</CardDescription>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-mid-gray">App Shell 布局已就绪。</p>
      </CardContent>
    </Card>
  </AppShell>
</template>
