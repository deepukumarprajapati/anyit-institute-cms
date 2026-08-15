<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Audit log</h1>
        <p>Immutable trail of mutating operations</p>
      </div>
      <a-button @click="load" :loading="loading">Refresh</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="pagination"
      row-key="_id"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'user'">
          {{ record.userId?.name || record.userId?.email || '-' }}
        </template>
        <template v-else-if="column.key === 'when'">
          {{ format(record.createdAt) }}
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import api from '@/lib/api';

const items = ref<Record<string, any>[]>([]);
const loading = ref(false);
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });

const columns = [
  { title: 'When', key: 'when' },
  { title: 'User', key: 'user' },
  { title: 'Action', dataIndex: 'action' },
  { title: 'Resource', dataIndex: 'resource' },
  { title: 'Method', dataIndex: 'method' },
  { title: 'Path', dataIndex: 'path' },
];

function format(value: string) {
  return dayjs(value).format('DD MMM YYYY HH:mm:ss');
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/audit', {
      params: { page: pagination.current, limit: pagination.pageSize },
    });
    items.value = data.data;
    pagination.total = data.meta?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function onTableChange(pag: { current?: number; pageSize?: number }) {
  pagination.current = pag.current ?? 1;
  pagination.pageSize = pag.pageSize ?? 20;
  load();
}

onMounted(load);
</script>
