<template>
  <div class="student-form-page">
    <div class="page-header">
      <a-space>
        <a-button @click="goBack">← Back</a-button>
        <div>
          <h1 style="margin: 0">{{ isEdit ? 'Edit student' : 'Add student' }}</h1>
          <p style="margin: 4px 0 0" class="muted">
            {{ isEdit ? 'Update profile and enrollment details' : 'Capture full admission details in one place' }}
          </p>
        </div>
      </a-space>
      <a-space>
        <a-button @click="goBack">Cancel</a-button>
        <a-button type="primary" :loading="saving" @click="submit">
          {{ isEdit ? 'Save changes' : 'Create student' }}
        </a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-form layout="vertical" :model="form">
        <a-row :gutter="[16, 16]">
          <a-col :xs="24" :lg="16">
            <a-card title="Basic details" :bordered="false" class="section-card">
              <a-row :gutter="12">
                <a-col :xs="24" :md="12">
                  <a-form-item label="Admission No" required>
                    <a-input v-model:value="form.admissionNo" placeholder="e.g. ADM26011" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Status">
                    <a-select v-model:value="form.status" :options="statusOptions" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="First name" required>
                    <a-input v-model:value="form.firstName" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Last name">
                    <a-input v-model:value="form.lastName" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Date of birth">
                    <a-date-picker v-model:value="form.dob" style="width: 100%" format="DD MMM YYYY" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Gender">
                    <a-select
                      v-model:value="form.gender"
                      allow-clear
                      :options="genderOptions"
                      placeholder="Select gender"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Phone">
                    <a-input v-model:value="form.phone" placeholder="+91-..." />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Email">
                    <a-input v-model:value="form.email" placeholder="parent@example.com" />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Campus">
                    <a-select
                      v-model:value="form.campusId"
                      allow-clear
                      :options="campusOptions"
                      placeholder="Select campus"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="24">
                  <a-form-item label="Address">
                    <a-textarea v-model:value="form.address" :rows="3" placeholder="Full residential address" />
                  </a-form-item>
                </a-col>
              </a-row>
            </a-card>

            <a-card title="Guardians" :bordered="false" class="section-card" style="margin-top: 16px">
              <div v-for="(g, idx) in form.guardians" :key="idx" class="guardian-block">
                <div class="guardian-head">
                  <strong>Guardian {{ idx + 1 }}</strong>
                  <a-button type="link" danger size="small" @click="removeGuardian(idx)">Remove</a-button>
                </div>
                <a-row :gutter="12">
                  <a-col :xs="24" :md="8">
                    <a-form-item label="Name" required>
                      <a-input v-model:value="g.name" />
                    </a-form-item>
                  </a-col>
                  <a-col :xs="24" :md="8">
                    <a-form-item label="Relation">
                      <a-select v-model:value="g.relation" :options="relationOptions" />
                    </a-form-item>
                  </a-col>
                  <a-col :xs="24" :md="8">
                    <a-form-item label="Phone">
                      <a-input v-model:value="g.phone" />
                    </a-form-item>
                  </a-col>
                  <a-col :xs="24" :md="12">
                    <a-form-item label="Email">
                      <a-input v-model:value="g.email" />
                    </a-form-item>
                  </a-col>
                  <a-col :xs="24" :md="12">
                    <a-form-item label="Primary contact">
                      <a-switch v-model:checked="g.isPrimary" @change="() => onPrimaryChange(idx)" />
                    </a-form-item>
                  </a-col>
                </a-row>
              </div>
              <a-button type="dashed" block @click="addGuardian">+ Add guardian</a-button>
            </a-card>

            <a-card
              :title="isEdit ? 'Enrollment for a selected year' : 'Initial enrollment (optional)'"
              :bordered="false"
              class="section-card"
              style="margin-top: 16px"
            >
              <a-alert
                type="info"
                show-icon
                style="margin-bottom: 12px"
                message="History is kept per academic year (session)"
                description="Pick the academic year first. Class, section, roll no, and classroom are saved only for that year. Other years already on the student stay unchanged in Enrollment history."
              />

              <a-table
                v-if="enrollmentHistory.length"
                size="small"
                style="margin-bottom: 16px"
                :pagination="false"
                row-key="_id"
                :data-source="enrollmentHistory"
                :columns="historyColumns"
              />

              <a-row :gutter="12">
                <a-col :xs="24" :md="12">
                  <a-form-item label="Session">
                    <a-select
                      v-model:value="enroll.sessionId"
                      allow-clear
                      :options="sessionOptions"
                      placeholder="Select session"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Class">
                    <a-select
                      v-model:value="enroll.classId"
                      allow-clear
                      :options="classOptions"
                      placeholder="Select class"
                      @change="onClassChange"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Section">
                    <a-select
                      v-model:value="enroll.sectionId"
                      allow-clear
                      :options="sectionOptions"
                      placeholder="Select section"
                      @change="onSectionChange"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Floor">
                    <a-select
                      v-model:value="enroll.floorId"
                      allow-clear
                      :options="floorOptions"
                      placeholder="Select floor"
                      @change="onFloorChange"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Classroom">
                    <a-select
                      v-model:value="enroll.classroomId"
                      allow-clear
                      :options="classroomOptions"
                      placeholder="Select classroom"
                    />
                  </a-form-item>
                </a-col>
                <a-col :xs="24" :md="12">
                  <a-form-item label="Roll No">
                    <a-input v-model:value="enroll.rollNo" />
                  </a-form-item>
                </a-col>
              </a-row>
              <p class="muted" style="font-size: 12px; margin: 0">
                Tip: create class / section / floor / classroom under
                <RouterLink to="/academic">Academic</RouterLink>
                first, then select them here.
              </p>
            </a-card>
          </a-col>

          <a-col :xs="24" :lg="8">
            <a-card title="Profile photo" :bordered="false" class="section-card">
              <div class="photo-wrap">
                <a-avatar :size="120" :src="form.photoUrl || undefined">
                  {{ initials }}
                </a-avatar>
                <a-upload :show-upload-list="false" :custom-request="uploadPhoto" accept="image/*">
                  <a-button style="margin-top: 12px">Upload photo</a-button>
                </a-upload>
                <a-button
                  v-if="form.photoUrl"
                  type="link"
                  danger
                  size="small"
                  style="margin-top: 4px"
                  @click="form.photoUrl = ''"
                >
                  Remove photo
                </a-button>
              </div>
            </a-card>

            <a-card title="Documents" :bordered="false" class="section-card" style="margin-top: 16px">
              <a-list
                size="small"
                :data-source="form.documents"
                :locale="{ emptyText: 'No documents yet' }"
              >
                <template #renderItem="{ item, index }">
                  <a-list-item>
                    <a :href="item.url" target="_blank" rel="noopener">{{ item.name }}</a>
                    <template #actions>
                      <a-button type="link" danger size="small" @click="removeDocument(index)">Remove</a-button>
                    </template>
                  </a-list-item>
                </template>
              </a-list>
              <a-upload :show-upload-list="false" :custom-request="uploadDocument">
                <a-button style="margin-top: 8px" block>Upload document</a-button>
              </a-upload>
              <p class="muted" style="margin-top: 8px; font-size: 12px">
                Documents are saved when you create/update the student.
              </p>
            </a-card>
          </a-col>
        </a-row>
      </a-form>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';

type Guardian = {
  name: string;
  relation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
};

type DocItem = { name: string; url: string; uploadedAt?: string };

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);

const isEdit = computed(() => route.name === 'student-edit');
const studentId = computed(() => (isEdit.value ? String(route.params.id) : ''));

const form = reactive({
  admissionNo: '',
  firstName: '',
  lastName: '',
  dob: null as Dayjs | null,
  gender: undefined as string | undefined,
  phone: '',
  email: '',
  address: '',
  campusId: undefined as string | undefined,
  status: 'active',
  photoUrl: '',
  guardians: [] as Guardian[],
  documents: [] as DocItem[],
});

const enroll = reactive({
  sessionId: undefined as string | undefined,
  classId: undefined as string | undefined,
  sectionId: undefined as string | undefined,
  floorId: undefined as string | undefined,
  classroomId: undefined as string | undefined,
  rollNo: '',
});

const campusOptions = ref<{ label: string; value: string }[]>([]);
const sessionOptions = ref<{ label: string; value: string }[]>([]);
const classOptions = ref<{ label: string; value: string }[]>([]);
const sectionOptions = ref<{ label: string; value: string }[]>([]);
const floorOptions = ref<{ label: string; value: string }[]>([]);
const classroomOptions = ref<{ label: string; value: string }[]>([]);
const allClassrooms = ref<
  { _id: string; name: string; code: string; floorId?: string | { _id: string } }[]
>([]);
const sectionsRaw = ref<any[]>([]);
const enrollmentHistory = ref<any[]>([]);

const historyColumns = [
  {
    title: 'Academic year',
    customRender: ({ record }: any) => {
      const name = record.sessionId?.name || '—';
      return record.sessionId?.isActive ? `${name} (current)` : name;
    },
  },
  {
    title: 'Class',
    customRender: ({ record }: any) => record.classId?.name || '—',
  },
  {
    title: 'Section',
    customRender: ({ record }: any) => record.sectionId?.name || '—',
  },
  { title: 'Roll', dataIndex: 'rollNo' },
  {
    title: 'Classroom',
    customRender: ({ record }: any) => record.classroomId?.name || '—',
  },
  { title: 'Status', dataIndex: 'status' },
];

const statusOptions = ['active', 'alumni', 'left', 'suspended'].map((v) => ({ label: v, value: v }));
const genderOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];
const relationOptions = ['Father', 'Mother', 'Guardian', 'Parent', 'Other'].map((v) => ({
  label: v,
  value: v,
}));

const initials = computed(() => {
  const a = (form.firstName || '?')[0];
  const b = (form.lastName || ' ')[0];
  return `${a}${b}`.toUpperCase();
});

function goBack() {
  if (isEdit.value && studentId.value) {
    router.push(`/students/${studentId.value}`);
  } else {
    router.push('/students');
  }
}

function addGuardian() {
  form.guardians.push({
    name: '',
    relation: 'Father',
    phone: '',
    email: '',
    isPrimary: form.guardians.length === 0,
  });
}

function removeGuardian(idx: number) {
  form.guardians.splice(idx, 1);
  if (form.guardians.length && !form.guardians.some((g) => g.isPrimary)) {
    form.guardians[0].isPrimary = true;
  }
}

function onPrimaryChange(idx: number) {
  if (!form.guardians[idx].isPrimary) return;
  form.guardians.forEach((g, i) => {
    if (i !== idx) g.isPrimary = false;
  });
}

function removeDocument(idx: number) {
  form.documents.splice(idx, 1);
}

async function loadMasters() {
  const [campuses, sessions, classes, floors, rooms] = await Promise.all([
    api.get('/campuses').catch(() => ({ data: { data: [] } })),
    api.get('/sessions'),
    api.get('/classes'),
    api.get('/floors').catch(() => ({ data: { data: [] } })),
    api.get('/classrooms').catch(() => ({ data: { data: [] } })),
  ]);
  campusOptions.value = (campuses.data.data || []).map((c: { _id: string; name: string; code?: string }) => ({
    label: c.code ? `${c.name} (${c.code})` : c.name,
    value: c._id,
  }));
  sessionOptions.value = sessions.data.data.map((s: { _id: string; name: string; isActive?: boolean }) => ({
    label: s.isActive ? `${s.name} (current)` : s.name,
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
  filterClassrooms();
}

async function onClassChange() {
  enroll.sectionId = undefined;
  enroll.classroomId = undefined;
  sectionOptions.value = [];
  sectionsRaw.value = [];
  if (!enroll.classId) return;
  const { data } = await api.get('/sections', { params: { classId: enroll.classId } });
  sectionsRaw.value = data.data;
  sectionOptions.value = data.data.map((s: { _id: string; name: string }) => ({
    label: s.name,
    value: s._id,
  }));
}

function onSectionChange() {
  const sec = sectionsRaw.value.find((s) => s._id === enroll.sectionId);
  const room = sec?.classroomId;
  if (room) {
    const roomId = typeof room === 'object' ? room._id : room;
    const floorId =
      typeof room === 'object' && room.floorId
        ? typeof room.floorId === 'object'
          ? room.floorId._id
          : room.floorId
        : allClassrooms.value.find((r) => r._id === roomId)?.floorId;
    enroll.classroomId = roomId;
    if (floorId) {
      enroll.floorId = typeof floorId === 'object' ? (floorId as any)._id : String(floorId);
      filterClassrooms();
    }
  }
}

function onFloorChange() {
  enroll.classroomId = undefined;
  filterClassrooms();
}

function filterClassrooms() {
  const list = allClassrooms.value.filter((r) => {
    if (!enroll.floorId) return true;
    const fid = typeof r.floorId === 'object' ? (r.floorId as any)?._id : r.floorId;
    return String(fid) === String(enroll.floorId);
  });
  classroomOptions.value = list.map((r) => ({
    label: `${r.name} (${r.code})`,
    value: r._id,
  }));
}

async function loadSections() {
  await onClassChange();
}

async function loadStudent() {
  if (!isEdit.value) {
    if (!form.guardians.length) addGuardian();
    enrollmentHistory.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get(`/students/${studentId.value}`);
    const s = data.data.student;
    const enrollments = data.data.enrollments || [];
    Object.assign(form, {
      admissionNo: s.admissionNo || '',
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      dob: s.dob ? dayjs(s.dob) : null,
      gender: s.gender || undefined,
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      campusId: s.campusId ? String(s.campusId) : undefined,
      status: s.status || 'active',
      photoUrl: s.photoUrl || '',
      guardians: (s.guardians || []).map((g: Guardian) => ({
        name: g.name || '',
        relation: g.relation || 'Guardian',
        phone: g.phone || '',
        email: g.email || '',
        isPrimary: Boolean(g.isPrimary),
      })),
      documents: (s.documents || []).map((d: DocItem) => ({
        name: d.name,
        url: d.url,
        uploadedAt: d.uploadedAt,
      })),
    });
    if (!form.guardians.length) addGuardian();

    const current = enrollments.find((e: any) => e.sessionId?.isActive) || enrollments[0];
    enrollmentHistory.value = enrollments || [];
    if (current) {
      enroll.sessionId = String(current.sessionId?._id || current.sessionId || '');
      enroll.classId = String(current.classId?._id || current.classId || '');
      enroll.sectionId = String(current.sectionId?._id || current.sectionId || '');
      enroll.rollNo = current.rollNo || '';
      const room = current.classroomId;
      if (room) {
        enroll.classroomId = String(room._id || room);
      }
      if (enroll.classId) {
        const { data: sec } = await api.get('/sections', { params: { classId: enroll.classId } });
        sectionsRaw.value = sec.data;
        sectionOptions.value = sec.data.map((s: { _id: string; name: string }) => ({
          label: s.name,
          value: s._id,
        }));
        onSectionChange();
      }
    }
  } catch {
    message.error('Unable to load student');
    router.replace('/students');
  } finally {
    loading.value = false;
  }
}

async function uploadPhoto(options: {
  file: File;
  onSuccess?: (b: unknown) => void;
  onError?: (e: Error) => void;
}) {
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const { data } = await api.post('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    form.photoUrl = data.data.url;
    message.success('Photo ready');
    options.onSuccess?.(data);
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Photo upload failed');
  }
}

async function uploadDocument(options: {
  file: File;
  onSuccess?: (b: unknown) => void;
  onError?: (e: Error) => void;
}) {
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const { data } = await api.post('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    form.documents.push({
      name: options.file.name,
      url: data.data.url,
      uploadedAt: new Date().toISOString(),
    });
    message.success('Document added');
    options.onSuccess?.(data);
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Document upload failed');
  }
}

function buildPayload() {
  const guardians = form.guardians
    .filter((g) => g.name.trim())
    .map((g) => ({
      name: g.name.trim(),
      relation: g.relation || 'Guardian',
      phone: g.phone || undefined,
      email: g.email || undefined,
      isPrimary: Boolean(g.isPrimary),
    }));

  return {
    admissionNo: form.admissionNo.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim() || undefined,
    dob: form.dob ? form.dob.format('YYYY-MM-DD') : undefined,
    gender: form.gender || undefined,
    phone: form.phone.trim() || undefined,
    email: form.email.trim() || '',
    address: form.address.trim() || undefined,
    campusId: form.campusId || undefined,
    status: form.status,
    photoUrl: form.photoUrl || undefined,
    guardians,
    documents: form.documents.map((d) => ({
      name: d.name,
      url: d.url,
      uploadedAt: d.uploadedAt,
    })),
  };
}

async function maybeEnroll(id: string) {
  if (!enroll.sessionId || !enroll.classId || !enroll.sectionId) return;
  await api.post(`/students/${id}/enrollments`, {
    sessionId: enroll.sessionId,
    classId: enroll.classId,
    sectionId: enroll.sectionId,
    classroomId: enroll.classroomId || undefined,
    rollNo: enroll.rollNo || undefined,
  });
}

async function submit() {
  if (!form.admissionNo.trim() || !form.firstName.trim()) {
    message.warning('Admission No and First name are required');
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    if (isEdit.value) {
      await api.patch(`/students/${studentId.value}`, payload);
      await maybeEnroll(studentId.value);
      message.success('Student updated');
      await router.replace(`/students/${studentId.value}`);
    } else {
      const { data } = await api.post('/students', payload);
      const id = String(data.data._id);
      await maybeEnroll(id);
      message.success('Student created');
      await router.replace(`/students/${id}`);
    }
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message || 'Save failed';
    message.error(msg);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadMasters();
  await loadStudent();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.section-card {
  border: 1px solid #eef2f0;
  border-radius: 12px;
}
.photo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.guardian-block {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafcfb;
}
.guardian-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.muted {
  color: #888;
}
</style>
