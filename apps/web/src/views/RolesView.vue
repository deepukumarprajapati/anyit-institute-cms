<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Roles & permissions</h1>
        <p>RBAC configuration for institute users</p>
      </div>
      <a-button type="primary" @click="openCreate">Create role</a-button>
    </div>

    <a-table :columns="columns" :data-source="roles" :loading="loading" row-key="_id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'permissions'">
          <a-tag v-if="record.permissions?.[0] === '*'" color="gold">All permissions</a-tag>
          <span v-else>{{ record.permissions?.length || 0 }} permissions</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-button size="small" @click="openEdit(record)">Edit</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" :title="editing ? 'Edit role' : 'Create role'" @ok="save" :confirm-loading="saving" width="720px">
      <a-form layout="vertical">
        <a-form-item v-if="!editing" label="Key" required>
          <a-input v-model:value="form.key" placeholder="e.g. librarian" />
        </a-form-item>
        <a-form-item label="Name" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="Description">
          <a-textarea v-model:value="form.description" />
        </a-form-item>
        <a-form-item label="Permissions">
          <a-checkbox-group v-model:value="form.permissions" :options="permissionOptions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import api from '@/lib/api';

const roles = ref<Record<string, any>[]>([]);
const permissions = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const open = ref(false);
const editing = ref<Record<string, any> | null>(null);
const form = reactive({ key: '', name: '', description: '', permissions: [] as string[] });
const permissionOptions = ref<{ label: string; value: string }[]>([]);

const columns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Key', dataIndex: 'key' },
  { title: 'System', dataIndex: 'isSystem', customRender: ({ text }: { text: boolean }) => (text ? 'Yes' : 'No') },
  { title: 'Permissions', key: 'permissions' },
  { title: 'Actions', key: 'actions' },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const [roleRes, permRes] = await Promise.all([api.get('/roles'), api.get('/roles/permissions')]);
    roles.value = roleRes.data.data;
    permissions.value = permRes.data.data;
    permissionOptions.value = permissions.value.map((p) => ({ label: p, value: p }));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  Object.assign(form, { key: '', name: '', description: '', permissions: [] });
  open.value = true;
}

function openEdit(record: Record<string, any>) {
  editing.value = record;
  Object.assign(form, {
    key: record.key,
    name: record.name,
    description: record.description || '',
    permissions: record.permissions?.[0] === '*' ? [...permissions.value] : [...(record.permissions || [])],
  });
  open.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/roles/${editing.value._id}`, {
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      });
      message.success('Role updated');
    } else {
      await api.post('/roles', form);
      message.success('Role created');
    }
    open.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
