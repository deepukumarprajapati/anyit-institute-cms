<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Academic</h1>
        <p>Sessions, classes, sections, floors, and classrooms</p>
      </div>
    </div>

    <a-tabs v-model:activeKey="tab">
      <a-tab-pane key="sessions" tab="Sessions">
        <a-space style="margin-bottom: 12px" wrap>
          <a-input v-model:value="session.name" placeholder="Session name" style="width: 160px" />
          <a-range-picker v-model:value="session.range" />
          <a-checkbox v-model:checked="session.isActive">Active</a-checkbox>
          <a-button v-if="auth.can('classes.manage') || auth.can('sessions.manage')" type="primary" @click="addSession">
            Add session
          </a-button>
        </a-space>
        <a-table :columns="sessionColumns" :data-source="sessions" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'active'">
              <a-tag :color="record.isActive ? 'green' : 'default'">
                {{ record.isActive ? 'Active' : 'Inactive' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button
                v-if="auth.can('sessions.manage') && !record.isActive"
                size="small"
                @click="activateSession(record._id)"
              >
                Set active
              </a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="classes" tab="Classes & sections">
        <a-alert
          type="info"
          show-icon
          style="margin-bottom: 12px"
          message="Create classes first, then add sections. Optionally assign each section to a classroom."
        />
        <a-space style="margin-bottom: 12px" wrap>
          <a-button v-if="auth.can('classes.manage')" type="primary" @click="openClassModal()">
            Add class
          </a-button>
          <a-button v-if="auth.can('classes.manage')" @click="openSectionModal()">
            Add section
          </a-button>
        </a-space>
        <a-table :columns="classColumns" :data-source="classes" row-key="_id" :loading="loading">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'sections'">
              <a-space wrap>
                <a-tag v-for="s in sectionsFor(record._id)" :key="s._id" color="blue">
                  {{ s.name }}
                  <span v-if="s.classroomId" class="muted">
                    · {{ typeof s.classroomId === 'object' ? s.classroomId.name : 'Room' }}
                  </span>
                </a-tag>
                <a-button
                  v-if="auth.can('classes.manage')"
                  size="small"
                  type="dashed"
                  @click="openSectionModal(record._id)"
                >
                  + Section
                </a-button>
              </a-space>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button
                v-if="auth.can('classes.manage')"
                size="small"
                @click="openClassModal(record)"
              >
                Edit
              </a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="floors" tab="Floors & classrooms">
        <a-alert
          type="info"
          show-icon
          style="margin-bottom: 12px"
          message="Create floors, then classrooms on each floor. Assign rooms to sections under Classes & sections."
        />
        <a-row :gutter="16">
          <a-col :xs="24" :lg="10">
            <a-card title="Floors" size="small">
              <a-space style="margin-bottom: 12px" wrap>
                <a-button v-if="auth.can('classes.manage')" type="primary" @click="openFloorModal()">
                  Add floor
                </a-button>
              </a-space>
              <a-table
                size="small"
                :columns="floorColumns"
                :data-source="floors"
                row-key="_id"
                :pagination="false"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'actions'">
                    <a-button
                      v-if="auth.can('classes.manage')"
                      size="small"
                      @click="openFloorModal(record)"
                    >
                      Edit
                    </a-button>
                  </template>
                </template>
              </a-table>
            </a-card>
          </a-col>
          <a-col :xs="24" :lg="14">
            <a-card title="Classrooms" size="small">
              <a-space style="margin-bottom: 12px" wrap>
                <a-button
                  v-if="auth.can('classes.manage')"
                  type="primary"
                  @click="openClassroomModal()"
                >
                  Add classroom
                </a-button>
              </a-space>
              <a-table
                size="small"
                :columns="classroomColumns"
                :data-source="classrooms"
                row-key="_id"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'floor'">
                    {{ record.floorId?.name || '—' }}
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-button
                      v-if="auth.can('classes.manage')"
                      size="small"
                      @click="openClassroomModal(record)"
                    >
                      Edit
                    </a-button>
                  </template>
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>
      </a-tab-pane>

      <a-tab-pane key="subjects" tab="Subjects">
        <a-space style="margin-bottom: 12px">
          <a-input v-model:value="subject.name" placeholder="Subject" />
          <a-input v-model:value="subject.code" placeholder="Code" style="width: 120px" />
          <a-button v-if="auth.can('subjects.manage')" type="primary" @click="addSubject">Add</a-button>
        </a-space>
        <a-table
          :columns="[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Code', dataIndex: 'code' },
          ]"
          :data-source="subjects"
          row-key="_id"
        />
      </a-tab-pane>
    </a-tabs>

    <!-- Class modal -->
    <a-modal
      v-model:open="classModalOpen"
      :title="editingClass ? 'Edit class' : 'Add class'"
      :confirm-loading="saving"
      @ok="saveClass"
    >
      <a-form layout="vertical">
        <a-form-item label="Class name" required>
          <a-input v-model:value="classForm.name" placeholder="e.g. Class 5" />
        </a-form-item>
        <a-form-item label="Code" required>
          <a-input v-model:value="classForm.code" placeholder="e.g. C5" />
        </a-form-item>
        <a-form-item label="Display order">
          <a-input-number v-model:value="classForm.order" style="width: 100%" :min="0" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Section modal -->
    <a-modal
      v-model:open="sectionModalOpen"
      title="Add section"
      :confirm-loading="saving"
      @ok="saveSection"
    >
      <a-form layout="vertical">
        <a-form-item label="Class" required>
          <a-select
            v-model:value="sectionForm.classId"
            :options="classOptions"
            placeholder="Select class"
          />
        </a-form-item>
        <a-form-item label="Section name" required>
          <a-input v-model:value="sectionForm.name" placeholder="e.g. A" />
        </a-form-item>
        <a-form-item label="Capacity">
          <a-input-number v-model:value="sectionForm.capacity" style="width: 100%" :min="1" />
        </a-form-item>
        <a-form-item label="Classroom (optional)">
          <a-select
            v-model:value="sectionForm.classroomId"
            allow-clear
            :options="classroomOptions"
            placeholder="Assign a room"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Floor modal -->
    <a-modal
      v-model:open="floorModalOpen"
      :title="editingFloor ? 'Edit floor' : 'Add floor'"
      :confirm-loading="saving"
      @ok="saveFloor"
    >
      <a-form layout="vertical">
        <a-form-item label="Floor name" required>
          <a-input v-model:value="floorForm.name" placeholder="e.g. Ground Floor" />
        </a-form-item>
        <a-form-item label="Code" required>
          <a-input v-model:value="floorForm.code" placeholder="e.g. GF" />
        </a-form-item>
        <a-form-item label="Level (0 = ground)">
          <a-input-number v-model:value="floorForm.level" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Building">
          <a-input v-model:value="floorForm.building" placeholder="e.g. Block A" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Classroom modal -->
    <a-modal
      v-model:open="classroomModalOpen"
      :title="editingClassroom ? 'Edit classroom' : 'Add classroom'"
      :confirm-loading="saving"
      @ok="saveClassroom"
    >
      <a-form layout="vertical">
        <a-form-item label="Floor" required>
          <a-select
            v-model:value="classroomForm.floorId"
            :options="floorOptions"
            placeholder="Select floor"
          />
        </a-form-item>
        <a-form-item label="Room name" required>
          <a-input v-model:value="classroomForm.name" placeholder="e.g. Room 101" />
        </a-form-item>
        <a-form-item label="Code" required>
          <a-input v-model:value="classroomForm.code" placeholder="e.g. R101" />
        </a-form-item>
        <a-form-item label="Capacity">
          <a-input-number v-model:value="classroomForm.capacity" style="width: 100%" :min="1" />
        </a-form-item>
        <a-form-item label="Type">
          <a-select v-model:value="classroomForm.roomType" :options="roomTypeOptions" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const tab = ref('classes');
const loading = ref(false);
const saving = ref(false);

const sessions = ref<Record<string, any>[]>([]);
const classes = ref<Record<string, any>[]>([]);
const sections = ref<Record<string, any>[]>([]);
const subjects = ref<Record<string, any>[]>([]);
const floors = ref<Record<string, any>[]>([]);
const classrooms = ref<Record<string, any>[]>([]);

const session = reactive<{ name: string; range: [Dayjs, Dayjs] | null; isActive: boolean }>({
  name: '',
  range: null,
  isActive: false,
});
const subject = reactive({ name: '', code: '' });

const classModalOpen = ref(false);
const editingClass = ref<Record<string, any> | null>(null);
const classForm = reactive({ name: '', code: '', order: 0 });

const sectionModalOpen = ref(false);
const sectionForm = reactive({
  classId: undefined as string | undefined,
  name: '',
  capacity: 40 as number | null,
  classroomId: undefined as string | undefined,
});

const floorModalOpen = ref(false);
const editingFloor = ref<Record<string, any> | null>(null);
const floorForm = reactive({ name: '', code: '', level: 0, building: '' });

const classroomModalOpen = ref(false);
const editingClassroom = ref<Record<string, any> | null>(null);
const classroomForm = reactive({
  floorId: undefined as string | undefined,
  name: '',
  code: '',
  capacity: 40 as number | null,
  roomType: 'classroom',
});

const roomTypeOptions = [
  { label: 'Classroom', value: 'classroom' },
  { label: 'Lab', value: 'lab' },
  { label: 'Library', value: 'library' },
  { label: 'Office', value: 'office' },
  { label: 'Other', value: 'other' },
];

const classOptions = computed(() =>
  classes.value.map((c) => ({ label: `${c.name} (${c.code})`, value: c._id }))
);
const floorOptions = computed(() =>
  floors.value.map((f) => ({ label: `${f.name} (${f.code})`, value: f._id }))
);
const classroomOptions = computed(() =>
  classrooms.value.map((r) => ({
    label: `${r.name} · ${r.floorId?.name || r.code}`,
    value: r._id,
  }))
);

const sessionColumns = [
  { title: 'Name', dataIndex: 'name' },
  {
    title: 'Start',
    dataIndex: 'startDate',
    customRender: ({ text }: { text: string }) => dayjs(text).format('DD MMM YYYY'),
  },
  {
    title: 'End',
    dataIndex: 'endDate',
    customRender: ({ text }: { text: string }) => dayjs(text).format('DD MMM YYYY'),
  },
  { title: 'Status', key: 'active' },
  { title: 'Actions', key: 'actions' },
];
const classColumns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'code' },
  { title: 'Order', dataIndex: 'order' },
  { title: 'Sections', key: 'sections' },
  { title: 'Actions', key: 'actions', width: 90 },
];
const floorColumns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'code' },
  { title: 'Level', dataIndex: 'level' },
  { title: 'Building', dataIndex: 'building' },
  { title: 'Actions', key: 'actions', width: 90 },
];
const classroomColumns = [
  { title: 'Name', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'code' },
  { title: 'Floor', key: 'floor' },
  { title: 'Capacity', dataIndex: 'capacity' },
  { title: 'Type', dataIndex: 'roomType' },
  { title: 'Actions', key: 'actions', width: 90 },
];

function sectionsFor(classId: string) {
  return sections.value.filter((s) => s.classId === classId || s.classId?._id === classId);
}

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const [s, c, sec, sub, fl, rooms] = await Promise.all([
      api.get('/sessions'),
      api.get('/classes'),
      api.get('/sections'),
      api.get('/subjects'),
      api.get('/floors'),
      api.get('/classrooms'),
    ]);
    sessions.value = s.data.data;
    classes.value = c.data.data;
    sections.value = sec.data.data;
    subjects.value = sub.data.data;
    floors.value = fl.data.data;
    classrooms.value = rooms.data.data;
  } finally {
    loading.value = false;
  }
}

async function addSession() {
  if (!session.range || !session.name) {
    message.warning('Session name and dates are required');
    return;
  }
  await api.post('/sessions', {
    name: session.name,
    startDate: session.range[0].toISOString(),
    endDate: session.range[1].toISOString(),
    isActive: session.isActive,
  });
  message.success('Session created');
  session.name = '';
  session.range = null;
  session.isActive = false;
  await load({ silent: true });
}

async function activateSession(id: string) {
  await api.patch(`/sessions/${id}`, { isActive: true });
  message.success('Session activated');
  await load({ silent: true });
}

function openClassModal(record?: Record<string, any>) {
  editingClass.value = record || null;
  Object.assign(classForm, {
    name: record?.name || '',
    code: record?.code || '',
    order: record?.order ?? classes.value.length + 1,
  });
  classModalOpen.value = true;
}

async function saveClass() {
  if (!classForm.name.trim() || !classForm.code.trim()) {
    message.warning('Name and code are required');
    return;
  }
  saving.value = true;
  try {
    if (editingClass.value) {
      await api.patch(`/classes/${editingClass.value._id}`, { ...classForm });
      message.success('Class updated');
    } else {
      await api.post('/classes', { ...classForm });
      message.success('Class created');
    }
    classModalOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

function openSectionModal(classId?: string) {
  Object.assign(sectionForm, {
    classId: classId || undefined,
    name: '',
    capacity: 40,
    classroomId: undefined,
  });
  sectionModalOpen.value = true;
}

async function saveSection() {
  if (!sectionForm.classId || !sectionForm.name.trim()) {
    message.warning('Class and section name are required');
    return;
  }
  saving.value = true;
  try {
    await api.post('/sections', {
      classId: sectionForm.classId,
      name: sectionForm.name.trim(),
      capacity: sectionForm.capacity || undefined,
      classroomId: sectionForm.classroomId || undefined,
    });
    message.success('Section created');
    sectionModalOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

function openFloorModal(record?: Record<string, any>) {
  editingFloor.value = record || null;
  Object.assign(floorForm, {
    name: record?.name || '',
    code: record?.code || '',
    level: record?.level ?? 0,
    building: record?.building || '',
  });
  floorModalOpen.value = true;
}

async function saveFloor() {
  if (!floorForm.name.trim() || !floorForm.code.trim()) {
    message.warning('Name and code are required');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: floorForm.name.trim(),
      code: floorForm.code.trim(),
      level: floorForm.level,
      building: floorForm.building || undefined,
    };
    if (editingFloor.value) {
      await api.patch(`/floors/${editingFloor.value._id}`, payload);
      message.success('Floor updated');
    } else {
      await api.post('/floors', payload);
      message.success('Floor created');
    }
    floorModalOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

function openClassroomModal(record?: Record<string, any>) {
  editingClassroom.value = record || null;
  Object.assign(classroomForm, {
    floorId: record?.floorId?._id || record?.floorId || undefined,
    name: record?.name || '',
    code: record?.code || '',
    capacity: record?.capacity ?? 40,
    roomType: record?.roomType || 'classroom',
  });
  classroomModalOpen.value = true;
}

async function saveClassroom() {
  if (!classroomForm.floorId || !classroomForm.name.trim() || !classroomForm.code.trim()) {
    message.warning('Floor, name and code are required');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      floorId: classroomForm.floorId,
      name: classroomForm.name.trim(),
      code: classroomForm.code.trim(),
      capacity: classroomForm.capacity || undefined,
      roomType: classroomForm.roomType,
    };
    if (editingClassroom.value) {
      await api.patch(`/classrooms/${editingClassroom.value._id}`, payload);
      message.success('Classroom updated');
    } else {
      await api.post('/classrooms', payload);
      message.success('Classroom created');
    }
    classroomModalOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

async function addSubject() {
  await api.post('/subjects', subject);
  message.success('Subject created');
  subject.name = '';
  subject.code = '';
  await load({ silent: true });
}

onMounted(load);
</script>

<style scoped>
.muted {
  color: #888;
  font-size: 11px;
}
.page-header {
  margin-bottom: 12px;
}
</style>
