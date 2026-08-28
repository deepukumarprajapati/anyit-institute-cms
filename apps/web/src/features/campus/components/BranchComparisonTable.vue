<template>
  <a-card title="Branches" :bordered="false" class="chart-card">
    <p class="hint">
      All campuses at a glance. Open a row for that branch, or choose All branches in the header.
    </p>
    <a-table
      size="small"
      row-key="campusId"
      :pagination="false"
      :data-source="rows"
      :columns="columns"
      :row-class-name="rowClass"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <strong>{{ record.name }}</strong>
          <a-tag v-if="record.isPrimary" color="green" style="margin-left: 8px">Head office</a-tag>
          <div class="muted">
            {{ record.code }}<span v-if="record.schoolCode"> · {{ record.schoolCode }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'pending'">
          <span :style="{ color: record.pending > 0 ? dangerColor : '#389e0d', fontWeight: 600 }">
            ₹{{ Number(record.pending).toLocaleString('en-IN') }}
          </span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space>
            <a-button size="small" type="link" @click="openBranch(record.campusId)">Open</a-button>
            <a-button size="small" type="link" @click="filterBranch(record.campusId)">Dashboard</a-button>
          </a-space>
        </template>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useCampusStore } from '@/stores/campus';
import type { BranchDashboardRow } from '@/features/campus/types';

defineProps<{
  rows: BranchDashboardRow[];
  dangerColor?: string;
}>();

const campus = useCampusStore();
const router = useRouter();

const columns = [
  { title: 'Branch', key: 'name' },
  { title: 'Students', dataIndex: 'students' },
  { title: 'Staff', dataIndex: 'staff' },
  {
    title: 'Received',
    dataIndex: 'received',
    customRender: ({ text }: { text: number }) => `₹${Number(text).toLocaleString('en-IN')}`,
  },
  { title: 'Pending', key: 'pending' },
  {
    title: 'Attendance',
    dataIndex: 'attendancePct',
    customRender: ({ text }: { text: number }) => `${text}%`,
  },
  { title: '', key: 'actions' },
];

function rowClass(record: BranchDashboardRow) {
  return !campus.isAll && record.campusId === campus.selectedId ? 'branch-row-active' : '';
}

function openBranch(id: string) {
  if (!id) return;
  campus.setSelected(id);
  router.push({ name: 'branch-detail', params: { id } });
}

function filterBranch(id: string) {
  campus.setSelected(id || 'all');
}
</script>

<style scoped>
.hint {
  margin-top: 0;
  font-size: 12px;
  color: #888;
}
.muted {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.chart-card {
  border: 1px solid #eef2f0;
  border-radius: 12px;
}
:deep(.branch-row-active) {
  background: #eef7f4;
}
</style>
