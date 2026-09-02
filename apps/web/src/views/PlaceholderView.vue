<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Button from '@/components/ui/Button.vue'

const route = useRoute()
const title = computed(() => route.meta.title ?? '页面')
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-[1280px] items-center justify-center p-6">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>该页面将在后续阶段（t7 / t8）实现。</CardDescription>
      </CardHeader>
      <CardContent>
        <RouterLink to="/">
          <Button variant="outline" class="w-full">返回组件总览</Button>
        </RouterLink>
      </CardContent>
    </Card>
  </div>
</template>
