<template>
  <a-select
    v-if="campus.campuses.length || always"
    :value="campus.selectedId"
    :style="{ minWidth: width }"
    :options="options"
    @change="(id: string) => campus.setSelected(id)"
  />
</template>

<script setup lang="ts">
import { useCampusSelect } from '@/features/campus/useCampusSelect';

withDefaults(
  defineProps<{
    width?: string;
    always?: boolean;
  }>(),
  { width: '200px', always: false }
);

const { campus, options } = useCampusSelect();
</script>
