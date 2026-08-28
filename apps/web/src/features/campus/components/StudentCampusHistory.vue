<template>
  <div>
    <a-divider>Campus / branch history</a-divider>
    <p class="muted">
      When a student moves branch (for example after a parent relocation), fees from that month follow
      the new campus. Unpaid invoices for that month onward are cancelled so they can be billed at the
      new campus rates.
    </p>
    <a-table
      size="small"
      :pagination="false"
      row-key="fromMonth"
      :data-source="sorted"
      :columns="columns"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { campusDisplayName, type CampusHistoryRow } from '@/features/campus/types';

const props = defineProps<{
  history: CampusHistoryRow[];
}>();

const sorted = computed(() =>
  [...(props.history || [])].sort((a, b) => String(b.fromMonth || '').localeCompare(String(a.fromMonth || '')))
);

const columns = [
  {
    title: 'Campus',
    customRender: ({ record }: { record: CampusHistoryRow }) => campusDisplayName(record.campusId),
  },
  { title: 'From', dataIndex: 'fromMonth' },
  {
    title: 'Until',
    customRender: ({ record }: { record: CampusHistoryRow }) => record.toMonth || 'Current',
  },
  { title: 'Reason', dataIndex: 'reason' },
];
</script>

<style scoped>
.muted {
  font-size: 12px;
  margin-bottom: 8px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
