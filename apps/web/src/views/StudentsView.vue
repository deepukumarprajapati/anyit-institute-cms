<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Students</h1>
        <p>Admissions, directory, and enrollments</p>
      </div>
      <a-space>
        <a-input-search v-model:value="q" placeholder="Search" allow-clear @search="load" style="width: 220px" />
        <CampusSwitcher always width="180px" />
        <a-button @click="exportCsv">Export CSV</a-button>
        <RouterLink v-if="auth.can('students.create')" to="/students/new">
          <a-button type="primary">Add student</a-button>
        </RouterLink>
      </a-space>
    </div>

    <a-tabs v-model:activeKey="listTab" @change="onTabChange">
      <a-tab-pane key="active" tab="Active" />
      <a-tab-pane key="deleted" tab="Deleted" />
    </a-tabs>

    <a-table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="pagination"
      row-key="_id"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <RouterLink :to="`/students/${record._id}`">{{ record.firstName }} {{ record.lastName || '' }}</RouterLink>
        </template>
        <template v-else-if="column.key === 'campus'">
          {{ campusLabel(record) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === 'active' ? 'green' : 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space>
            <template v-if="listTab === 'active'">
              <RouterLink :to="`/students/${record._id}`">
                <a-button size="small">View profile</a-button>
              </RouterLink>
              <RouterLink v-if="auth.can('students.update')" :to="`/students/${record._id}/edit`">
                <a-button size="small">Edit</a-button>
              </RouterLink>
              <a-button size="small" @click="openEnroll(record)">Enroll</a-button>
              <a-popconfirm
                v-if="auth.can('students.delete')"
                title="Soft-delete this student?"
                @confirm="remove(record._id)"
              >
                <a-button size="small" danger>Delete</a-button>
              </a-popconfirm>
            </template>
            <a-button
              v-else
              size="small"
              type="primary"
              @click="restore(record._id)"
            >
              Restore
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="enrollOpen" title="Enroll student" @ok="saveEnroll" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="Session" required>
          <a-select v-model:value="enroll.sessionId" :options="sessionOptions" />
        </a-form-item>
        <a-form-item label="Class" required>
          <a-select v-model:value="enroll.classId" :options="classOptions" @change="loadSections" />
        </a-form-item>
        <a-form-item label="Section" required>
          <a-select v-model:value="enroll.sectionId" :options="sectionOptions" @change="onSectionPick" />
        </a-form-item>
        <a-form-item label="Floor">
          <a-select
            v-model:value="enroll.floorId"
            allow-clear
            :options="floorOptions"
            @change="filterRooms"
          />
        </a-form-item>
        <a-form-item label="Classroom">
          <a-select v-model:value="enroll.classroomId" allow-clear :options="classroomOptions" />
        </a-form-item>
        <a-form-item label="Roll No"><a-input v-model:value="enroll.rollNo" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useCampusStore } from '@/stores/campus';
import CampusSwitcher from '@/features/campus/components/CampusSwitcher.vue';
import { campusDisplayName } from '@/features/campus/types';

const auth = useAuthStore();
const campus = useCampusStore();

function campusLabel(record: Record<string, any>) {
  return campusDisplayName(record.campusId);
}
const items = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const saving = ref(false);
const enrollOpen = ref(false);
const enrollStudentId = ref('');
const listTab = ref('active');
const q = ref('');
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true });

const enroll = reactive({
  sessionId: '',
  classId: '',
  sectionId: '',
  floorId: undefined as string | undefined,
  classroomId: undefined as string | undefined,
  rollNo: '',
});
const sessionOptions = ref<{ label: string; value: string }[]>([]);
const classOptions = ref<{ label: string; value: string }[]>([]);
const sectionOptions = ref<{ label: string; value: string }[]>([]);
const floorOptions = ref<{ label: string; value: string }[]>([]);
const classroomOptions = ref<{ label: string; value: string }[]>([]);
const allClassrooms = ref<any[]>([]);
const sectionsRaw = ref<any[]>([]);

const columns = [
  { title: 'Admission No', dataIndex: 'admissionNo' },
  { title: 'Name', key: 'name' },
  { title: 'Campus', key: 'campus' },
  { title: 'Phone', dataIndex: 'phone' },
  { title: 'Status', key: 'status' },
  { title: 'Actions', key: 'actions' },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const { data } = await api.get('/students', {
      params: {
        page: pagination.current,
        limit: pagination.pageSize,
        q: q.value || undefined,
        campusId: campus.queryCampusId,
        deleted: listTab.value === 'deleted' ? '1' : undefined,
      },
    });
    items.value = data.data;
    pagination.total = data.meta?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function onTabChange() {
  pagination.current = 1;
  load();
}

function onTableChange(pag: { current?: number; pageSize?: number }) {
  pagination.current = pag.current ?? 1;
  pagination.pageSize = pag.pageSize ?? 20;
  load();
}

async function remove(id: string) {
  await api.delete(`/students/${id}`);
  message.success('Student deleted');
  await load({ silent: true });
}

async function restore(id: string) {
  await api.post(`/students/${id}/restore`);
  message.success('Student restored');
  await load({ silent: true });
}

async function exportCsv() {
  const res = await api.get('/students/export/csv', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function loadMasters() {
  const [sessions, classes, floors, rooms] = await Promise.all([
    api.get('/sessions'),
    api.get('/classes'),
    api.get('/floors').catch(() => ({ data: { data: [] } })),
    api.get('/classrooms').catch(() => ({ data: { data: [] } })),
  ]);
  sessionOptions.value = sessions.data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
  classOptions.value = classes.data.data.map((c: { _id: string; name: string }) => ({
    label: c.name,
    value: c._id,
  }));
  floorOptions.value = (floors.data.data || []).map((f: { _id: string; name: string; code: string }) => ({
    label: `${f.name} (${f.code})`,
    value: f._id,
  }));
  allClassrooms.value = rooms.data.data || [];
  filterRooms();
}

async function loadSections() {
  enroll.sectionId = '';
  enroll.classroomId = undefined;
  if (!enroll.classId) return;
  const { data } = await api.get('/sections', { params: { classId: enroll.classId } });
  sectionsRaw.value = data.data;
  sectionOptions.value = data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
}

function onSectionPick() {
  const sec = sectionsRaw.value.find((s) => s._id === enroll.sectionId);
  const room = sec?.classroomId;
  if (!room) return;
  const roomId = typeof room === 'object' ? room._id : room;
  enroll.classroomId = roomId;
  const found = allClassrooms.value.find((r) => r._id === roomId);
  const floorId = found?.floorId?._id || found?.floorId || room?.floorId;
  if (floorId) {
    enroll.floorId = String(typeof floorId === 'object' ? floorId._id : floorId);
    filterRooms();
  }
}

function filterRooms() {
  classroomOptions.value = allClassrooms.value
    .filter((r) => {
      if (!enroll.floorId) return true;
      const fid = r.floorId?._id || r.floorId;
      return String(fid) === String(enroll.floorId);
    })
    .map((r) => ({ label: `${r.name} (${r.code})`, value: r._id }));
}

function openEnroll(record: Record<string, unknown>) {
  enrollStudentId.value = String(record._id);
  Object.assign(enroll, {
    sessionId: '',
    classId: '',
    sectionId: '',
    floorId: undefined,
    classroomId: undefined,
    rollNo: '',
  });
  enrollOpen.value = true;
}

async function saveEnroll() {
  saving.value = true;
  try {
    await api.post(`/students/${enrollStudentId.value}/enrollments`, {
      sessionId: enroll.sessionId,
      classId: enroll.classId,
      sectionId: enroll.sectionId,
      classroomId: enroll.classroomId || undefined,
      rollNo: enroll.rollNo || undefined,
    });
    message.success('Enrolled');
    enrollOpen.value = false;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadMasters()]);
});

watch(
  () => campus.selectedId,
  () => {
    pagination.current = 1;
    load({ silent: true });
  }
);
</script>
