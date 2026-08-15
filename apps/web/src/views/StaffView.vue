<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Staff</h1>
        <p>Employees, departments, and designations</p>
      </div>
      <a-space>
        <a-input-search v-model:value="q" placeholder="Search" allow-clear @search="load" style="width: 220px" />
        <a-button v-if="auth.can('staff.create')" type="primary" @click="openCreate">Add staff</a-button>
      </a-space>
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
        <template v-if="column.key === 'name'">{{ record.firstName }} {{ record.lastName || '' }}</template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === 'active' ? 'green' : 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space>
            <a-button size="small" @click="openEdit(record)">Edit</a-button>
            <a-popconfirm
              v-if="auth.can('staff.delete')"
              title="Soft-delete this staff member?"
              @confirm="remove(record._id)"
            >
              <a-button size="small" danger>Delete</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalOpen" :title="editing ? 'Edit staff' : 'Add staff'" @ok="save" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Employee code" required>
              <a-input v-model:value="form.employeeCode" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Status">
              <a-select
                v-model:value="form.status"
                :options="['active', 'inactive', 'resigned'].map((v) => ({ label: v, value: v }))"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="First name" required>
              <a-input v-model:value="form.firstName" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Last name"><a-input v-model:value="form.lastName" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Department"><a-input v-model:value="form.department" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Designation"><a-input v-model:value="form.designation" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Email"><a-input v-model:value="form.email" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Phone"><a-input v-model:value="form.phone" /></a-form-item>
          </a-col>
        </a-row>
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
const modalOpen = ref(false);
const editing = ref<Record<string, unknown> | null>(null);
const q = ref('');
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });
const form = reactive({
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  status: 'active',
});

const columns = [
  { title: 'Code', dataIndex: 'employeeCode' },
  { title: 'Name', key: 'name' },
  { title: 'Department', dataIndex: 'department' },
  { title: 'Designation', dataIndex: 'designation' },
  { title: 'Status', key: 'status' },
  { title: 'Actions', key: 'actions' },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const { data } = await api.get('/staff', {
      params: { page: pagination.current, limit: pagination.pageSize, q: q.value || undefined },
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
  editing.value = null;
  Object.assign(form, {
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    status: 'active',
  });
  modalOpen.value = true;
}

function openEdit(record: Record<string, unknown>) {
  editing.value = record;
  Object.assign(form, {
    employeeCode: record.employeeCode,
    firstName: record.firstName,
    lastName: record.lastName ?? '',
    email: record.email ?? '',
    phone: record.phone ?? '',
    department: record.department ?? '',
    designation: record.designation ?? '',
    status: record.status ?? 'active',
  });
  modalOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/staff/${editing.value._id}`, form);
      message.success('Staff updated');
    } else {
      await api.post('/staff', form);
      message.success('Staff created');
    }
    modalOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

async function remove(id: string) {
  await api.delete(`/staff/${id}`);
  message.success('Staff deleted');
  await load({ silent: true });
}

onMounted(load);
</script>
