<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Reports</h1>
        <p>Class / section student directory and pending fee analytics</p>
      </div>
    </div>

    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="students" tab="Students by class / section">
        <a-space wrap style="margin-bottom: 16px">
          <a-select
            v-model:value="studentFilters.sessionId"
            placeholder="Session"
            style="width: 160px"
            :options="sessionOptions"
            allow-clear
            @change="onStudentSessionChange"
          />
          <a-select
            v-model:value="studentFilters.classId"
            placeholder="Class"
            style="width: 160px"
            :options="classOptions"
            allow-clear
            @change="onStudentClassChange"
          />
          <a-select
            v-model:value="studentFilters.sectionId"
            placeholder="Section"
            style="width: 140px"
            :options="sectionOptions"
            allow-clear
          />
          <a-input-search
            v-model:value="studentFilters.q"
            placeholder="Search name / admission"
            style="width: 220px"
            allow-clear
            @search="loadStudents"
          />
          <a-button type="primary" :loading="studentLoading" @click="loadStudents">Apply</a-button>
        </a-space>

        <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Students (filtered)" :value="studentTotal" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Classes" :value="studentSummary.length" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Sections" :value="sectionCount" />
            </a-card>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :xs="24" :lg="8">
            <a-card title="Summary by class" size="small">
              <a-table
                size="small"
                :pagination="false"
                row-key="classId"
                :data-source="studentSummary"
                :columns="classSummaryColumns"
                :custom-row="classSummaryRowProps"
              >
                <template #expandedRowRender="{ record }">
                  <a-space wrap>
                    <a-tag
                      v-for="sec in record.sections"
                      :key="sec.sectionId"
                      color="blue"
                      style="cursor: pointer"
                      @click.stop="filterBySection(record.classId, sec.sectionId)"
                    >
                      Sec {{ sec.sectionName }}: {{ sec.count }}
                    </a-tag>
                  </a-space>
                </template>
              </a-table>
            </a-card>
          </a-col>
          <a-col :xs="24" :lg="16">
            <a-card title="Student list" size="small">
              <a-table
                :columns="studentColumns"
                :data-source="studentRows"
                :loading="studentLoading"
                :pagination="studentPagination"
                row-key="enrollmentId"
                @change="onStudentTableChange"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <RouterLink :to="`/students/${record.studentId}`">
                      {{ record.firstName }} {{ record.lastName || '' }}
                    </RouterLink>
                  </template>
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="fees" tab="Pending fees">
        <a-space wrap style="margin-bottom: 16px">
          <a-select
            v-model:value="feeFilters.sessionId"
            placeholder="Session"
            style="width: 160px"
            :options="sessionOptions"
            allow-clear
          />
          <a-select
            v-model:value="feeFilters.classId"
            placeholder="Class"
            style="width: 160px"
            :options="classOptions"
            allow-clear
          />
          <a-date-picker
            v-model:value="feeFilters.month"
            picker="month"
            placeholder="Month"
            style="width: 150px"
          />
          <a-button type="primary" :loading="feeLoading" @click="loadFees">Apply</a-button>
          <a-button @click="clearFeeFilters">Reset</a-button>
        </a-space>

        <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Total pending" :value="feeSummary.totalDue" prefix="₹" :precision="0" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Open invoices" :value="feeSummary.invoiceCount" />
            </a-card>
          </a-col>
          <a-col :xs="24" :sm="8">
            <a-card size="small">
              <a-statistic title="Students with dues" :value="feeSummary.studentCount" />
            </a-card>
          </a-col>
        </a-row>

        <a-row :gutter="16" style="margin-bottom: 16px">
          <a-col :xs="24" :lg="12">
            <a-card title="Pending by class" size="small">
              <div v-for="row in feeByClass" :key="row.classId || row.className" class="bar-row">
                <div class="bar-meta">
                  <strong
                    style="cursor: pointer"
                    @click="feeFilters.classId = row.classId; loadFees()"
                  >
                    {{ row.className }}
                  </strong>
                  <span class="muted">{{ row.studentCount }} students · {{ row.invoiceCount }} invoices</span>
                </div>
                <a-progress
                  :percent="feeClassPercent(row.pendingAmount)"
                  :format="() => `₹${row.pendingAmount.toLocaleString('en-IN')}`"
                  stroke-color="#c45c26"
                />
              </div>
              <a-empty v-if="!feeByClass.length" description="No pending dues" />
            </a-card>
          </a-col>
          <a-col :xs="24" :lg="12">
            <a-card title="Pending by month" size="small">
              <div v-for="row in feeByMonth" :key="row.month" class="bar-row">
                <div class="bar-meta">
                  <strong
                    style="cursor: pointer"
                    @click="setFeeMonth(row.month)"
                  >
                    {{ formatMonth(row.month) }}
                  </strong>
                  <span class="muted">{{ row.studentCount }} students · {{ row.invoiceCount }} invoices</span>
                </div>
                <a-progress
                  :percent="feeMonthPercent(row.pendingAmount)"
                  :format="() => `₹${row.pendingAmount.toLocaleString('en-IN')}`"
                  stroke-color="#0f5c4c"
                />
              </div>
              <a-empty v-if="!feeByMonth.length" description="No pending dues" />
            </a-card>
          </a-col>
        </a-row>

        <a-card title="Pending invoice details" size="small">
          <a-table
            :columns="feeColumns"
            :data-source="feeRows"
            :loading="feeLoading"
            :pagination="feePagination"
            row-key="invoiceId"
            @change="onFeeTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'actions'">
                <a-button size="small" type="link" @click="openStudentLedger(String(record.studentId))">
                  Student detail
                </a-button>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="student-ledger" tab="Student fee ledger">
        <a-space wrap style="margin-bottom: 16px">
          <a-select
            v-model:value="ledgerStudentId"
            show-search
            placeholder="Search student"
            style="width: 320px"
            :filter-option="false"
            :options="ledgerStudentOptions"
            @search="searchLedgerStudents"
          />
          <a-button type="primary" :loading="ledgerLoading" :disabled="!ledgerStudentId" @click="loadLedger">
            Load ledger
          </a-button>
        </a-space>

        <template v-if="ledger">
          <a-card size="small" style="margin-bottom: 16px">
            <a-descriptions :column="3" size="small">
              <a-descriptions-item label="Student">{{ ledger.student.name }}</a-descriptions-item>
              <a-descriptions-item label="Admission">{{ ledger.student.admissionNo }}</a-descriptions-item>
              <a-descriptions-item label="Class">
                {{ ledger.student.className || '-' }} / {{ ledger.student.sectionName || '-' }}
              </a-descriptions-item>
            </a-descriptions>
          </a-card>

          <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Total pending" :value="ledger.summary.totalPending" prefix="₹" />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Months pending" :value="ledger.summary.monthsPendingCount" />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Open invoices" :value="ledger.summary.openInvoiceCount" />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card size="small">
                <a-statistic title="Paid to date" :value="ledger.summary.totalPaid" prefix="₹" />
              </a-card>
            </a-col>
          </a-row>

          <a-row :gutter="16" style="margin-bottom: 16px">
            <a-col :xs="24" :lg="12">
              <a-card title="Pending by category" size="small">
                <a-table
                  size="small"
                  :pagination="false"
                  row-key="category"
                  :data-source="ledger.byCategory"
                  :columns="[
                    { title: 'Category', customRender: ({ record }: any) => categoryLabel(record.category) },
                    {
                      title: 'Pending',
                      customRender: ({ record }: any) => `₹${record.pendingAmount.toLocaleString('en-IN')}`,
                    },
                  ]"
                />
              </a-card>
            </a-col>
            <a-col :xs="24" :lg="12">
              <a-card title="Pending by month" size="small">
                <a-collapse>
                  <a-collapse-panel
                    v-for="m in ledger.monthsPending"
                    :key="m.month"
                    :header="`${formatMonth(m.month)} — ₹${m.pendingAmount.toLocaleString('en-IN')} pending`"
                  >
                    <a-space wrap style="margin-bottom: 8px">
                      <a-tag v-for="(amt, cat) in m.byCategory" :key="cat" color="orange">
                        {{ categoryLabel(String(cat)) }}: ₹{{ Number(amt).toLocaleString('en-IN') }}
                      </a-tag>
                    </a-space>
                    <a-table
                      size="small"
                      :pagination="false"
                      :data-source="m.lines"
                      row-key="name"
                      :columns="[
                        { title: 'Item', dataIndex: 'name' },
                        {
                          title: 'Category',
                          customRender: ({ record }: any) => categoryLabel(record.category),
                        },
                        {
                          title: 'Pending',
                          customRender: ({ record }: any) =>
                            `₹${Number(record.pendingAmount).toLocaleString('en-IN')}`,
                        },
                      ]"
                    />
                  </a-collapse-panel>
                </a-collapse>
                <a-empty v-if="!ledger.monthsPending.length" description="No pending months" />
              </a-card>
            </a-col>
          </a-row>

          <a-card title="All invoices" size="small">
            <a-table
              size="small"
              :data-source="ledger.invoices"
              row-key="invoiceId"
              :pagination="{ pageSize: 8 }"
              :columns="ledgerInvoiceColumns"
            >
              <template #expandedRowRender="{ record }">
                <a-table
                  size="small"
                  :pagination="false"
                  :data-source="record.items"
                  row-key="name"
                  :columns="[
                    { title: 'Item', dataIndex: 'name' },
                    {
                      title: 'Category',
                      customRender: ({ record: r }: any) => categoryLabel(r.category),
                    },
                    {
                      title: 'Amount',
                      customRender: ({ record: r }: any) => `₹${r.amount.toLocaleString('en-IN')}`,
                    },
                    {
                      title: 'Pending share',
                      customRender: ({ record: r }: any) =>
                        `₹${r.pendingAmount.toLocaleString('en-IN')}`,
                    },
                  ]"
                />
              </template>
            </a-table>
          </a-card>
        </template>
        <a-empty v-else description="Select a student to view month-wise pending fees" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import dayjs, { Dayjs } from 'dayjs';
import { FEE_CATEGORY_LABELS, type FeeCategory } from '@anyit/shared';
import api from '@/lib/api';

const tab = ref('students');

const sessionOptions = ref<{ label: string; value: string }[]>([]);
const classOptions = ref<{ label: string; value: string }[]>([]);
const sectionOptions = ref<{ label: string; value: string }[]>([]);

const studentLoading = ref(false);
const studentRows = ref<Record<string, unknown>[]>([]);
const studentSummary = ref<
  {
    classId: string;
    className: string;
    count: number;
    sections: { sectionId: string; sectionName: string; count: number }[];
  }[]
>([]);
const studentTotal = ref(0);
const studentFilters = reactive({
  sessionId: undefined as string | undefined,
  classId: undefined as string | undefined,
  sectionId: undefined as string | undefined,
  q: '',
});
const studentPagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });

const feeLoading = ref(false);
const feeRows = ref<Record<string, unknown>[]>([]);
const feeByClass = ref<
  { classId: string; className: string; pendingAmount: number; invoiceCount: number; studentCount: number }[]
>([]);
const feeByMonth = ref<
  { month: string; pendingAmount: number; invoiceCount: number; studentCount: number }[]
>([]);
const feeSummary = reactive({ totalDue: 0, invoiceCount: 0, studentCount: 0 });
const feeFilters = reactive({
  sessionId: undefined as string | undefined,
  classId: undefined as string | undefined,
  month: null as Dayjs | null,
});
const feePagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });

const ledgerLoading = ref(false);
const ledgerStudentId = ref<string | undefined>();
const ledgerStudentOptions = ref<{ label: string; value: string }[]>([]);
const ledger = ref<{
  student: {
    name: string;
    admissionNo: string;
    className?: string;
    sectionName?: string;
  };
  summary: {
    totalPending: number;
    totalPaid: number;
    monthsPendingCount: number;
    openInvoiceCount: number;
  };
  byCategory: { category: string; pendingAmount: number }[];
  monthsPending: {
    month: string;
    pendingAmount: number;
    byCategory: Record<string, number>;
    lines: { name: string; category: string; pendingAmount: number }[];
  }[];
  invoices: {
    invoiceId: string;
    invoiceNo: string;
    billingMonth: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    items: { name: string; category: string; amount: number; pendingAmount: number }[];
  }[];
} | null>(null);

function categoryLabel(cat: string) {
  return FEE_CATEGORY_LABELS[cat as FeeCategory] || cat;
}

const sectionCount = computed(() =>
  studentSummary.value.reduce((n, c) => n + (c.sections?.length || 0), 0)
);

const maxClassDue = computed(() => Math.max(1, ...feeByClass.value.map((r) => r.pendingAmount), 1));
const maxMonthDue = computed(() => Math.max(1, ...feeByMonth.value.map((r) => r.pendingAmount), 1));

function feeClassPercent(amount: number) {
  return Math.round((amount / maxClassDue.value) * 100);
}
function feeMonthPercent(amount: number) {
  return Math.round((amount / maxMonthDue.value) * 100);
}

function formatMonth(m: string) {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return dayjs(`${m}-01`).format('MMM YYYY');
}

const classSummaryColumns = [
  { title: 'Class', dataIndex: 'className' },
  { title: 'Students', dataIndex: 'count', width: 90 },
];

const studentColumns = [
  { title: 'Admission', dataIndex: 'admissionNo' },
  { title: 'Name', key: 'name' },
  { title: 'Class', dataIndex: 'className' },
  { title: 'Section', dataIndex: 'sectionName' },
  { title: 'Roll', dataIndex: 'rollNo' },
  { title: 'Phone', dataIndex: 'phone' },
  { title: 'Status', dataIndex: 'status' },
];

const feeColumns = [
  { title: 'Invoice', dataIndex: 'invoiceNo' },
  { title: 'Student', dataIndex: 'studentName' },
  { title: 'Admission', dataIndex: 'admissionNo' },
  { title: 'Class', dataIndex: 'className' },
  { title: 'Section', dataIndex: 'sectionName' },
  {
    title: 'Month',
    customRender: ({ record }: { record: { monthKey: string } }) => formatMonth(record.monthKey),
  },
  {
    title: 'Pending',
    customRender: ({ record }: { record: { pendingAmount: number } }) =>
      `₹${Number(record.pendingAmount).toLocaleString('en-IN')}`,
  },
  { title: 'Status', dataIndex: 'status' },
  { title: 'Actions', key: 'actions' },
];

const ledgerInvoiceColumns = [
  { title: 'Invoice', dataIndex: 'invoiceNo' },
  {
    title: 'Month',
    customRender: ({ record }: { record: { billingMonth: string } }) =>
      formatMonth(record.billingMonth),
  },
  {
    title: 'Total',
    customRender: ({ record }: { record: { totalAmount: number } }) =>
      `₹${record.totalAmount.toLocaleString('en-IN')}`,
  },
  {
    title: 'Paid',
    customRender: ({ record }: { record: { paidAmount: number } }) =>
      `₹${record.paidAmount.toLocaleString('en-IN')}`,
  },
  {
    title: 'Pending',
    customRender: ({ record }: { record: { pendingAmount: number } }) =>
      `₹${record.pendingAmount.toLocaleString('en-IN')}`,
  },
  { title: 'Status', dataIndex: 'status' },
];

async function loadMasters() {
  const [sessions, classes] = await Promise.all([api.get('/sessions'), api.get('/classes')]);
  sessionOptions.value = sessions.data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
  classOptions.value = classes.data.data.map((c: { _id: string; name: string }) => ({
    label: c.name,
    value: c._id,
  }));
  const active = sessions.data.data.find((s: { isActive: boolean }) => s.isActive);
  if (active) {
    studentFilters.sessionId = active._id;
    feeFilters.sessionId = active._id;
  }
}

async function loadSections(classId?: string) {
  sectionOptions.value = [];
  studentFilters.sectionId = undefined;
  if (!classId) return;
  const { data } = await api.get('/sections', { params: { classId } });
  sectionOptions.value = data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
}

async function onStudentSessionChange() {
  studentFilters.classId = undefined;
  studentFilters.sectionId = undefined;
  sectionOptions.value = [];
}

async function onStudentClassChange(classId?: string) {
  await loadSections(classId);
}

function filterByClass(classId: string) {
  studentFilters.classId = classId;
  loadSections(classId).then(() => {
    studentFilters.sectionId = undefined;
    studentPagination.current = 1;
    loadStudents();
  });
}

function classSummaryRowProps(record: { classId: string }) {
  return {
    onClick: () => filterByClass(record.classId),
    style: { cursor: 'pointer' },
  };
}

function filterBySection(classId: string, sectionId: string) {
  studentFilters.classId = classId;
  loadSections(classId).then(() => {
    studentFilters.sectionId = sectionId;
    studentPagination.current = 1;
    loadStudents();
  });
}

async function loadStudents() {
  studentLoading.value = true;
  try {
    const { data } = await api.get('/students/directory', {
      params: {
        sessionId: studentFilters.sessionId,
        classId: studentFilters.classId,
        sectionId: studentFilters.sectionId,
        q: studentFilters.q || undefined,
        page: studentPagination.current,
        limit: studentPagination.pageSize,
      },
    });
    studentRows.value = data.data.rows;
    studentSummary.value = data.data.summary;
    studentTotal.value = data.data.totalStudents;
    studentPagination.total = data.meta?.total ?? data.data.totalStudents ?? 0;
  } finally {
    studentLoading.value = false;
  }
}

function onStudentTableChange(pag: { current?: number; pageSize?: number }) {
  studentPagination.current = pag.current ?? 1;
  studentPagination.pageSize = pag.pageSize ?? 20;
  loadStudents();
}

async function loadFees() {
  feeLoading.value = true;
  try {
    const { data } = await api.get('/fees/pending-report', {
      params: {
        sessionId: feeFilters.sessionId,
        classId: feeFilters.classId,
        month: feeFilters.month ? feeFilters.month.format('YYYY-MM') : undefined,
        page: feePagination.current,
        limit: feePagination.pageSize,
      },
    });
    feeRows.value = data.data.rows;
    feeByClass.value = data.data.byClass;
    feeByMonth.value = data.data.byMonth;
    Object.assign(feeSummary, data.data.summary);
    feePagination.total = data.meta?.total ?? 0;
  } finally {
    feeLoading.value = false;
  }
}

function onFeeTableChange(pag: { current?: number; pageSize?: number }) {
  feePagination.current = pag.current ?? 1;
  feePagination.pageSize = pag.pageSize ?? 20;
  loadFees();
}

function clearFeeFilters() {
  feeFilters.classId = undefined;
  feeFilters.month = null;
  feePagination.current = 1;
  loadFees();
}

function setFeeMonth(month: string) {
  if (/^\d{4}-\d{2}$/.test(month)) {
    feeFilters.month = dayjs(`${month}-01`);
    feePagination.current = 1;
    loadFees();
  }
}

async function searchLedgerStudents(q: string) {
  const { data } = await api.get('/students', { params: { q, limit: 20 } });
  ledgerStudentOptions.value = data.data.map(
    (s: { _id: string; firstName: string; lastName?: string; admissionNo: string }) => ({
      label: `${s.admissionNo} — ${s.firstName} ${s.lastName || ''}`.trim(),
      value: s._id,
    })
  );
}

async function loadLedger() {
  if (!ledgerStudentId.value) return;
  ledgerLoading.value = true;
  try {
    const { data } = await api.get(`/fees/students/${ledgerStudentId.value}/pending-detail`);
    ledger.value = data.data;
  } finally {
    ledgerLoading.value = false;
  }
}

function openStudentLedger(studentId: string) {
  tab.value = 'student-ledger';
  ledgerStudentId.value = studentId;
  loadLedger();
}

onMounted(async () => {
  await loadMasters();
  await Promise.all([loadStudents(), loadFees()]);
});
</script>

<style scoped>
.bar-row {
  margin-bottom: 12px;
}
.bar-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}
.muted {
  color: #888;
  font-size: 12px;
}
</style>
