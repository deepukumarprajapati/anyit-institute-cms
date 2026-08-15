<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Users</h1>
        <p>Staff logins and role assignments</p>
      </div>
      <a-button v-if="auth.can('users.manage')" type="primary" @click="openCreate">Add user</a-button>
    </div>

    <a-table :columns="columns" :data-source="items" :loading="loading" row-key="_id" :pagination="pagination" @change="onTableChange">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'role'">
          {{ record.roleId?.name || '-' }}
        </template>
        <template v-else-if="column.key === 'active'">
          <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? 'Active' : 'Inactive' }}</a-tag>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" title="Add user" @ok="save" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="Name" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="Email" required><a-input v-model:value="form.email" /></a-form-item>
        <a-form-item label="Password" required><a-input-password v-model:value="form.password" /></a-form-item>
        <a-form-item label="Role" required>
          <a-select v-model:value="form.roleId" :options="roleOptions" />
        </a-form-item>
        <a-form-item label="Phone"><a-input v-model:value="form.phone" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const items = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const saving = ref(false);
const open = ref(false);
const roleOptions = ref<{ label: string; value: string }[]>([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const form = reactive({ name: '', email: '', password: '', roleId: '', phone: '' });

const columns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Email', dataIndex: 'email' },
  { title: 'Role', key: 'role' },
  { title: 'Status', key: 'active' },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const { data } = await api.get('/users', {
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

function openCreate() {
  Object.assign(form, { name: '', email: '', password: '', roleId: '', phone: '' });
  open.value = true;
}

async function save() {
  saving.value = true;
  try {
    await api.post('/users', form);
    message.success('User created');
    open.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const roles = await api.get('/roles');
  roleOptions.value = roles.data.data.map((r: { _id: string; name: string }) => ({
    label: r.name,
    value: r._id,
  }));
  await load();
});
</script>
