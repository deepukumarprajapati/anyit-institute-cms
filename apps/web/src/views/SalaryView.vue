<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Salary</h1>
        <p>Structures and monthly payroll</p>
      </div>
      <a-space>
        <a-date-picker v-model:value="month" picker="month" />
        <a-button v-if="auth.can('salary.run')" type="primary" :loading="running" @click="runPayroll">
          Run payroll
        </a-button>
        <a-button v-if="auth.can('salary.manage')" @click="structureOpen = true">Add structure</a-button>
      </a-space>
    </div>

    <a-tabs>
      <a-tab-pane key="payrolls" tab="Payrolls">
        <a-table :columns="payrollColumns" :data-source="payrolls" :loading="loading" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'staff'">
              {{ record.staffId?.firstName }} {{ record.staffId?.lastName || '' }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button
                v-if="auth.can('salary.run') && record.status !== 'paid'"
                size="small"
                @click="markPaid(record._id)"
              >
                Mark paid
              </a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="structures" tab="Structures">
        <a-table :columns="structureColumns" :data-source="structures" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'staff'">
              {{ record.staffId?.firstName }} {{ record.staffId?.lastName || '' }}
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <a-modal v-model:open="structureOpen" title="Salary structure" @ok="saveStructure" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="Staff" required>
          <a-select v-model:value="form.staffId" :options="staffOptions" show-search option-filter-prop="label" />
        </a-form-item>
        <a-form-item label="Basic" required>
          <a-input-number v-model:value="form.basic" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Effective from" required>
          <a-date-picker v-model:value="form.effectiveFrom" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const running = ref(false);
const structureOpen = ref(false);
const month = ref<Dayjs>(dayjs());
const payrolls = ref<Record<string, any>[]>([]);
const structures = ref<Record<string, any>[]>([]);
const staffOptions = ref<{ label: string; value: string }[]>([]);
const form = reactive<{ staffId: string; basic: number; effectiveFrom: Dayjs | null }>({
  staffId: '',
  basic: 0,
  effectiveFrom: dayjs(),
});

const payrollColumns = [
  { title: 'Staff', key: 'staff' },
  { title: 'Month', dataIndex: 'month' },
  { title: 'Basic', dataIndex: 'basic' },
  { title: 'Net pay', dataIndex: 'netPay' },
  { title: 'Status', dataIndex: 'status' },
  { title: 'Actions', key: 'actions' },
];
const structureColumns = [
  { title: 'Staff', key: 'staff' },
  { title: 'Basic', dataIndex: 'basic' },
  {
    title: 'Effective from',
    dataIndex: 'effectiveFrom',
    customRender: ({ text }: { text: string }) => dayjs(text).format('DD MMM YYYY'),
  },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const monthKey = month.value.format('YYYY-MM');
    const [pay, str, staff] = await Promise.all([
      api.get('/salary/payrolls', { params: { month: monthKey } }),
      api.get('/salary/structures'),
      api.get('/staff', { params: { limit: 100 } }),
    ]);
    payrolls.value = pay.data.data;
    structures.value = str.data.data;
    staffOptions.value = staff.data.data.map((s: { _id: string; firstName: string; employeeCode: string }) => ({
      label: `${s.employeeCode} — ${s.firstName}`,
      value: s._id,
    }));
  } finally {
    loading.value = false;
  }
}

async function runPayroll() {
  running.value = true;
  try {
    await api.post('/salary/payrolls/run', { month: month.value.format('YYYY-MM') });
    message.success('Payroll processed');
    await load({ silent: true });
  } finally {
    running.value = false;
  }
}

async function markPaid(id: string) {
  await api.patch(`/salary/payrolls/${id}/pay`);
  message.success('Marked paid');
  await load({ silent: true });
}

async function saveStructure() {
  if (!form.effectiveFrom) return;
  saving.value = true;
  try {
    await api.post('/salary/structures', {
      staffId: form.staffId,
      basic: form.basic,
      effectiveFrom: form.effectiveFrom.toISOString(),
      allowances: [],
      deductions: [],
    });
    message.success('Structure saved');
    structureOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
