<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Events</h1>
        <p>Institute calendar and activities — open an event to tag student participants</p>
      </div>
      <RouterLink v-if="auth.can('events.manage')" to="/events/new">
        <a-button type="primary">Create event</a-button>
      </RouterLink>
    </div>

    <a-table :columns="columns" :data-source="items" :loading="loading" row-key="_id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <RouterLink :to="`/events/${record._id}`">{{ record.title }}</RouterLink>
        </template>
        <template v-else-if="column.key === 'when'">
          {{ format(record.startAt) }} → {{ format(record.endAt) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space>
            <RouterLink :to="`/events/${record._id}`">
              <a-button size="small">Open</a-button>
            </RouterLink>
            <RouterLink v-if="auth.can('events.manage')" :to="`/events/${record._id}/edit`">
              <a-button size="small">Edit</a-button>
            </RouterLink>
            <a-popconfirm
              v-if="auth.can('events.manage')"
              title="Delete event?"
              @confirm="remove(record._id)"
            >
              <a-button size="small" danger>Delete</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const items = ref<Record<string, any>[]>([]);
const loading = ref(false);

const columns = [
  { title: 'Title', key: 'title' },
  { title: 'When', key: 'when' },
  { title: 'Location', dataIndex: 'location' },
  { title: 'Audience', dataIndex: 'audience' },
  { title: 'Actions', key: 'actions' },
];

function format(value: string) {
  return dayjs(value).format('DD MMM YYYY HH:mm');
}

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const { data } = await api.get('/events');
    items.value = data.data;
  } finally {
    loading.value = false;
  }
}

async function remove(id: string) {
  await api.delete(`/events/${id}`);
  message.success('Event deleted');
  await load({ silent: true });
}

onMounted(load);
</script>
