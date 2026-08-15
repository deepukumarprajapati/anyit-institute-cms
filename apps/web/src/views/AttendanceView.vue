<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Attendance</h1>
        <p>Bulk mark students and manage holidays</p>
      </div>
    </div>

    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="students" tab="Students">
        <a-space wrap style="margin-bottom: 12px">
          <a-select
            v-model:value="filters.sessionId"
            placeholder="Session"
            style="width: 160px"
            :options="sessionOptions"
          />
          <a-select
            v-model:value="filters.classId"
            placeholder="Class"
            style="width: 160px"
            :options="classOptions"
            @change="loadSections"
          />
          <a-select
            v-model:value="filters.sectionId"
            placeholder="Section"
            style="width: 140px"
            :options="sectionOptions"
          />
          <a-date-picker v-model:value="filters.date" />
          <a-button type="primary" @click="loadRoster" :loading="loading">Load roster</a-button>
          <a-button
            v-if="auth.can('attendance.mark')"
            type="primary"
            ghost
            @click="saveBulk"
            :loading="saving"
          >
            Save attendance
          </a-button>
        </a-space>

        <a-table :columns="studentColumns" :data-source="roster" :pagination="false" row-key="studentId">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-select
                v-model:value="record.status"
                style="width: 140px"
                :options="statusOptions"
                :disabled="!auth.can('attendance.mark')"
              />
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="staff" tab="Staff">
        <a-space wrap style="margin-bottom: 12px">
          <a-date-picker v-model:value="staffDate" />
          <a-button type="primary" @click="loadStaffRoster" :loading="loading">Load staff</a-button>
          <a-button
            v-if="auth.can('attendance.mark')"
            type="primary"
            ghost
            @click="saveStaffBulk"
            :loading="saving"
          >
            Save staff attendance
          </a-button>
        </a-space>
        <a-table :columns="staffColumns" :data-source="staffRoster" :pagination="false" row-key="staffId">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-select
                v-model:value="record.status"
                style="width: 140px"
                :options="statusOptions"
                :disabled="!auth.can('attendance.mark')"
              />
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="holidays" tab="Holidays">
        <a-space style="margin-bottom: 12px">
          <a-input v-model:value="holiday.name" placeholder="Holiday name" />
          <a-date-picker v-model:value="holiday.date" />
          <a-button v-if="auth.can('holidays.manage')" type="primary" @click="addHoliday">Add</a-button>
        </a-space>
        <a-table :columns="holidayColumns" :data-source="holidays" row-key="_id" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'actions'">
              <a-popconfirm
                v-if="auth.can('holidays.manage')"
                title="Delete holiday?"
                @confirm="removeHoliday(record._id)"
              >
                <a-button size="small" danger>Delete</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const tab = ref('students');
const loading = ref(false);
const saving = ref(false);
const roster = ref<{ studentId: string; name: string; admissionNo: string; status: string }[]>([]);
const staffRoster = ref<{ staffId: string; name: string; employeeCode: string; status: string }[]>([]);
const staffDate = ref<Dayjs>(dayjs());
const holidays = ref<Record<string, unknown>[]>([]);
const sessionOptions = ref<{ label: string; value: string }[]>([]);
const classOptions = ref<{ label: string; value: string }[]>([]);
const sectionOptions = ref<{ label: string; value: string }[]>([]);
const statusOptions = ['present', 'absent', 'late', 'half_day', 'excused'].map((v) => ({
  label: v,
  value: v,
}));

const filters = reactive<{
  sessionId: string;
  classId: string;
  sectionId: string;
  date: Dayjs;
}>({
  sessionId: '',
  classId: '',
  sectionId: '',
  date: dayjs(),
});

const holiday = reactive<{ name: string; date: Dayjs | null }>({ name: '', date: null });

const studentColumns = [
  { title: 'Admission No', dataIndex: 'admissionNo' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Status', key: 'status' },
];

const staffColumns = [
  { title: 'Code', dataIndex: 'employeeCode' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Status', key: 'status' },
];

const holidayColumns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Date', dataIndex: 'date' },
  { title: 'Type', dataIndex: 'type' },
  { title: 'Actions', key: 'actions' },
];

async function loadMasters() {
  const [sessions, classes, holidayRes] = await Promise.all([
    api.get('/sessions'),
    api.get('/classes'),
    api.get('/attendance/holidays'),
  ]);
  sessionOptions.value = sessions.data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
  classOptions.value = classes.data.data.map((c: { _id: string; name: string }) => ({
    label: c.name,
    value: c._id,
  }));
  holidays.value = holidayRes.data.data;
  const active = sessions.data.data.find((s: { isActive: boolean }) => s.isActive);
  if (active) filters.sessionId = active._id;
}

async function loadSections() {
  filters.sectionId = '';
  if (!filters.classId) return;
  const { data } = await api.get('/sections', { params: { classId: filters.classId } });
  sectionOptions.value = data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
}

async function loadRoster() {
  if (!filters.sessionId || !filters.sectionId) {
    message.warning('Select session and section');
    return;
  }
  loading.value = true;
  try {
    const date = filters.date.format('YYYY-MM-DD');
    const [rosterRes, existingRes] = await Promise.all([
      api.get('/attendance/students/roster', {
        params: { sessionId: filters.sessionId, sectionId: filters.sectionId },
      }),
      api.get('/attendance/students', { params: { sectionId: filters.sectionId, date } }),
    ]);
    const existing = new Map(
      existingRes.data.data.map((r: { studentId: { _id?: string } | string; status: string }) => [
        typeof r.studentId === 'object' ? r.studentId._id : r.studentId,
        r.status,
      ])
    );
    roster.value = rosterRes.data.data.map(
      (row: { student: { _id: string; firstName: string; lastName?: string; admissionNo: string } }) => ({
        studentId: row.student._id,
        name: `${row.student.firstName} ${row.student.lastName || ''}`.trim(),
        admissionNo: row.student.admissionNo,
        status: existing.get(row.student._id) || 'present',
      })
    );
  } finally {
    loading.value = false;
  }
}

async function saveBulk() {
  saving.value = true;
  try {
    await api.post('/attendance/students/bulk', {
      sessionId: filters.sessionId,
      classId: filters.classId,
      sectionId: filters.sectionId,
      date: filters.date.format('YYYY-MM-DD'),
      records: roster.value.map((r) => ({ studentId: r.studentId, status: r.status })),
    });
    message.success('Attendance saved');
  } finally {
    saving.value = false;
  }
}

async function loadStaffRoster() {
  loading.value = true;
  try {
    const date = staffDate.value.format('YYYY-MM-DD');
    const [staffRes, existingRes] = await Promise.all([
      api.get('/staff', { params: { limit: 100 } }),
      api.get('/attendance/staff', { params: { date } }),
    ]);
    const existing = new Map(
      existingRes.data.data.map((r: { staffId: { _id?: string } | string; status: string }) => [
        typeof r.staffId === 'object' ? r.staffId._id : r.staffId,
        r.status,
      ])
    );
    staffRoster.value = staffRes.data.data.map(
      (s: { _id: string; firstName: string; lastName?: string; employeeCode: string }) => ({
        staffId: s._id,
        name: `${s.firstName} ${s.lastName || ''}`.trim(),
        employeeCode: s.employeeCode,
        status: existing.get(s._id) || 'present',
      })
    );
  } finally {
    loading.value = false;
  }
}

async function saveStaffBulk() {
  saving.value = true;
  try {
    await api.post('/attendance/staff/bulk', {
      date: staffDate.value.format('YYYY-MM-DD'),
      records: staffRoster.value.map((r) => ({ staffId: r.staffId, status: r.status })),
    });
    message.success('Staff attendance saved');
  } finally {
    saving.value = false;
  }
}

async function addHoliday() {
  if (!holiday.name || !holiday.date) return;
  await api.post('/attendance/holidays', {
    name: holiday.name,
    date: holiday.date.format('YYYY-MM-DD'),
  });
  message.success('Holiday added');
  holiday.name = '';
  holiday.date = null;
  const { data } = await api.get('/attendance/holidays');
  holidays.value = data.data;
}

async function removeHoliday(id: string) {
  await api.delete(`/attendance/holidays/${id}`);
  message.success('Holiday removed');
  const { data } = await api.get('/attendance/holidays');
  holidays.value = data.data;
}

onMounted(loadMasters);
</script>
