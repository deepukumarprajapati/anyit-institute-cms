<template>
  <div v-if="loading && !event" style="padding: 48px; text-align: center">
    <a-spin size="large" />
  </div>
  <div v-else-if="!event && !loading">
    <a-result status="404" title="Event not found">
      <template #extra>
        <a-button type="primary" @click="router.push('/events')">Back to events</a-button>
      </template>
    </a-result>
  </div>
  <div v-else-if="event">
    <a-spin :spinning="refreshing">
    <div class="page-header">
      <a-space>
        <a-button @click="router.push('/events')">← Back</a-button>
        <div>
          <h1 style="margin: 0">{{ event.title }}</h1>
          <p style="margin: 4px 0 0" class="muted">
            {{ format(event.startAt) }} → {{ format(event.endAt) }}
            <span v-if="event.location"> · {{ event.location }}</span>
            <a-tag style="margin-left: 8px">{{ event.audience }}</a-tag>
          </p>
        </div>
      </a-space>
      <RouterLink v-if="auth.can('events.manage')" :to="`/events/${event._id}/edit`">
        <a-button type="primary">Edit event</a-button>
      </RouterLink>
    </div>

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="8">
        <a-card title="Event details">
          <template v-if="auth.can('events.manage')" #extra>
            <RouterLink :to="`/events/${event._id}/edit`">Edit</RouterLink>
          </template>
          <p v-if="event.description" style="white-space: pre-wrap">{{ event.description }}</p>
          <p v-else class="muted">No description</p>
          <a-divider />
          <div class="meta-row"><span class="muted">Location</span><span>{{ event.location || '—' }}</span></div>
          <div class="meta-row"><span class="muted">Audience</span><span>{{ event.audience }}</span></div>
          <div class="meta-row"><span class="muted">Start</span><span>{{ format(event.startAt) }}</span></div>
          <div class="meta-row"><span class="muted">End</span><span>{{ format(event.endAt) }}</span></div>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="16">
        <a-card title="Event photos" style="margin-bottom: 16px">
          <p class="muted" style="margin-top: 0">
            Upload one or more photos. Click a thumbnail to open the carousel popup.
          </p>
          <a-upload
            v-if="auth.can('events.manage')"
            list-type="picture-card"
            accept="image/*"
            :multiple="true"
            :show-upload-list="false"
            :custom-request="uploadPhotos"
            :disabled="uploadingPhotos"
          >
            <div>
              <div v-if="uploadingPhotos"><a-spin size="small" /></div>
              <template v-else>
                <div style="font-size: 22px; line-height: 1">+</div>
                <div style="margin-top: 6px">Upload</div>
              </template>
            </div>
          </a-upload>

          <a-empty
            v-if="!(event.photos || []).length"
            description="No photos yet"
            style="margin-top: 12px"
          />
          <div v-else class="photo-grid">
            <button
              v-for="(photo, idx) in event.photos"
              :key="photo._id"
              type="button"
              class="photo-tile"
              @click="openLightbox(idx)"
            >
              <img :src="photo.url" :alt="photo.caption || event.title" />
            </button>
          </div>
        </a-card>

        <a-modal
          v-model:open="lightboxOpen"
          :title="event.title"
          :footer="null"
          width="920px"
          centered
          destroy-on-close
          class="photo-lightbox-modal"
          @after-open-change="onLightboxOpenChange"
        >
          <div class="lightbox-body">
            <a-carousel
              ref="carouselRef"
              arrows
              dots
              class="photo-slider"
              :key="carouselKey"
              @after-change="onSlideChange"
            >
              <div v-for="photo in event.photos" :key="photo._id" class="slide">
                <div class="slide-inner">
                  <img :src="photo.url" :alt="photo.caption || event.title" />
                  <a-popconfirm
                    v-if="auth.can('events.manage')"
                    title="Remove this photo?"
                    @confirm="removePhoto(photo._id)"
                  >
                    <a-button class="photo-remove" size="small" danger>Remove</a-button>
                  </a-popconfirm>
                </div>
              </div>
            </a-carousel>
            <div class="lightbox-meta">
              {{ activeSlide + 1 }} / {{ (event.photos || []).length }}
            </div>
            <div v-if="(event.photos || []).length > 1" class="photo-thumbs">
              <button
                v-for="(photo, idx) in event.photos"
                :key="photo._id"
                type="button"
                class="thumb"
                :class="{ active: idx === activeSlide }"
                @click="goToSlide(idx)"
              >
                <img :src="photo.url" :alt="`Photo ${idx + 1}`" />
              </button>
            </div>
          </div>
        </a-modal>

        <a-card title="Participants">
          <p class="muted" style="margin-top: 0">
            Search and tag students. Each tagged student gets an automatic entry under
            <strong>Events &amp; participation</strong> on their profile.
          </p>

          <a-form v-if="auth.can('events.manage')" layout="vertical" class="add-form">
            <a-form-item label="Add students (tag)">
              <a-select
                v-model:value="selectedStudentIds"
                mode="multiple"
                show-search
                allow-clear
                placeholder="Type a student name or admission no"
                :filter-option="false"
                :options="studentOptions"
                :not-found-content="searching ? undefined : null"
                style="width: 100%"
                @search="onStudentSearch"
              >
                <template v-if="searching" #notFoundContent>
                  <a-spin size="small" />
                </template>
              </a-select>
            </a-form-item>
            <a-space wrap>
              <a-select
                v-model:value="addRole"
                style="width: 160px"
                :options="roleOptions"
              />
              <a-button
                type="primary"
                :loading="adding"
                :disabled="!selectedStudentIds.length"
                @click="addParticipants"
              >
                Add participants
              </a-button>
            </a-space>
          </a-form>

          <a-table
            style="margin-top: 16px"
            :columns="columns"
            :data-source="participants"
            :loading="loadingParticipants"
            row-key="_id"
            :pagination="{ pageSize: 20 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'student'">
                <RouterLink v-if="studentOf(record)?._id" :to="`/students/${studentOf(record)._id}`">
                  {{ studentLabel(record) }}
                </RouterLink>
                <span v-else>{{ studentLabel(record) }}</span>
              </template>
              <template v-else-if="column.key === 'role'">
                <a-select
                  v-if="auth.can('events.manage')"
                  :value="record.role"
                  size="small"
                  style="width: 130px"
                  :options="roleOptions"
                  @change="(v: string) => updateParticipant(record._id, { role: v })"
                />
                <span v-else>{{ record.role }}</span>
              </template>
              <template v-else-if="column.key === 'attendance'">
                <a-select
                  v-if="auth.can('events.manage')"
                  :value="record.attendance"
                  size="small"
                  style="width: 110px"
                  :options="attendanceOptions"
                  @change="(v: string) => updateParticipant(record._id, { attendance: v })"
                />
                <span v-else>{{ record.attendance }}</span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-popconfirm
                  v-if="auth.can('events.manage')"
                  title="Remove this participant?"
                  @confirm="removeParticipant(record._id)"
                >
                  <a-button size="small" danger>Remove</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const eventId = computed(() => String(route.params.id));
const loading = ref(true);
const refreshing = ref(false);
const loadingParticipants = ref(false);
const event = ref<Record<string, any> | null>(null);
const participants = ref<Record<string, any>[]>([]);
const activeSlide = ref(0);
const lightboxOpen = ref(false);
const carouselRef = ref<{ goTo?: (slide: number, dontAnimate?: boolean) => void } | null>(null);
const carouselKey = computed(() => (event.value?.photos || []).map((p: any) => p._id).join('-') || 'empty');

function onSlideChange(current: number) {
  activeSlide.value = current;
}

function openLightbox(idx: number) {
  activeSlide.value = idx;
  lightboxOpen.value = true;
}

async function onLightboxOpenChange(open: boolean) {
  if (!open) return;
  await nextTick();
  carouselRef.value?.goTo?.(activeSlide.value, true);
}

function goToSlide(idx: number) {
  activeSlide.value = idx;
  carouselRef.value?.goTo?.(idx);
}

const selectedStudentIds = ref<string[]>([]);
const studentOptions = ref<{ label: string; value: string }[]>([]);
const searching = ref(false);
const adding = ref(false);
const addRole = ref('participant');
const uploadingPhotos = ref(false);
let photoUploadInFlight = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const roleOptions = [
  { label: 'Participant', value: 'participant' },
  { label: 'Volunteer', value: 'volunteer' },
  { label: 'Winner', value: 'winner' },
  { label: 'Audience', value: 'audience' },
  { label: 'Organizer', value: 'organizer' },
];

const attendanceOptions = [
  { label: 'Present', value: 'present' },
  { label: 'Absent', value: 'absent' },
  { label: 'Late', value: 'late' },
];

const columns = [
  { title: 'Student', key: 'student' },
  { title: 'Admission No', dataIndex: ['studentId', 'admissionNo'] },
  { title: 'Role', key: 'role' },
  { title: 'Attendance', key: 'attendance' },
  { title: 'Actions', key: 'actions', width: 100 },
];

function format(value: string) {
  return dayjs(value).format('DD MMM YYYY HH:mm');
}

function studentOf(record: Record<string, any>) {
  return record.studentId && typeof record.studentId === 'object' ? record.studentId : null;
}

function studentLabel(record: Record<string, any>) {
  const s = studentOf(record);
  if (!s) return '—';
  return `${s.firstName || ''} ${s.lastName || ''}`.trim();
}

async function loadEvent(opts?: { silent?: boolean }) {
  const silent = Boolean(opts?.silent && event.value);
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    const { data } = await api.get(`/events/${eventId.value}`);
    event.value = data.data;
  } catch {
    if (!silent) event.value = null;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function loadParticipants() {
  loadingParticipants.value = true;
  try {
    const { data } = await api.get(`/events/${eventId.value}/participants`);
    participants.value = data.data;
  } finally {
    loadingParticipants.value = false;
  }
}

async function onStudentSearch(q: string) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      const { data } = await api.get('/students', {
        params: { q: q || undefined, limit: 30, status: 'active' },
      });
      const already = new Set(participants.value.map((p) => String(studentOf(p)?._id || '')));
      studentOptions.value = (data.data as Record<string, any>[])
        .filter((s) => !already.has(String(s._id)))
        .map((s) => ({
          value: String(s._id),
          label: `${s.firstName} ${s.lastName || ''} (${s.admissionNo})`.trim(),
        }));
    } finally {
      searching.value = false;
    }
  }, 250);
}

async function addParticipants() {
  if (!selectedStudentIds.value.length) return;
  adding.value = true;
  try {
    await api.post(`/events/${eventId.value}/participants`, {
      studentIds: selectedStudentIds.value,
      role: addRole.value,
    });
    message.success('Participants added — they now appear on each student profile');
    selectedStudentIds.value = [];
    studentOptions.value = [];
    await loadParticipants();
  } finally {
    adding.value = false;
  }
}

async function updateParticipant(id: string, patch: Record<string, string>) {
  await api.patch(`/events/${eventId.value}/participants/${id}`, patch);
  message.success('Updated');
  await loadParticipants();
}

async function removeParticipant(id: string) {
  await api.delete(`/events/${eventId.value}/participants/${id}`);
  message.success('Removed');
  await loadParticipants();
}

async function uploadPhotos(options: {
  file: File;
  onSuccess?: (b: unknown) => void;
  onError?: (e: Error) => void;
}) {
  photoUploadInFlight += 1;
  uploadingPhotos.value = true;
  try {
    const fd = new FormData();
    fd.append('files', options.file);
    const { data } = await api.post(`/events/${eventId.value}/photos`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (event.value) event.value.photos = data.data;
    options.onSuccess?.(data);
    message.success('Photo added');
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Photo upload failed');
  } finally {
    photoUploadInFlight = Math.max(0, photoUploadInFlight - 1);
    uploadingPhotos.value = photoUploadInFlight > 0;
  }
}

async function removePhoto(photoId: string) {
  const { data } = await api.delete(`/events/${eventId.value}/photos/${photoId}`);
  if (event.value) event.value.photos = data.data;
  message.success('Photo removed');
  if (!(event.value?.photos || []).length) {
    lightboxOpen.value = false;
    activeSlide.value = 0;
  } else if (activeSlide.value >= (event.value?.photos || []).length) {
    activeSlide.value = Math.max(0, (event.value?.photos || []).length - 1);
  }
}

async function loadAll() {
  await loadEvent();
  if (event.value) {
    await loadParticipants();
    await onStudentSearch('');
  }
}

watch(eventId, loadAll);
onMounted(loadAll);
</script>

<style scoped>
.muted {
  color: rgba(0, 0, 0, 0.45);
}
.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.add-form {
  background: #fafafa;
  padding: 12px 16px;
  border-radius: 8px;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.photo-tile {
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #f0f0f0;
}
.photo-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
.photo-tile:hover img {
  transform: scale(1.04);
}
.lightbox-body {
  margin: -8px 0 0;
}
.photo-slider {
  background: #111;
  border-radius: 10px;
  overflow: hidden;
}
.photo-slider :deep(.slick-slide) {
  text-align: center;
}
.photo-slider :deep(.slick-dots) {
  bottom: 12px;
}
.photo-slider :deep(.slick-dots li button) {
  background: #fff;
  opacity: 0.45;
}
.photo-slider :deep(.slick-dots li.slick-active button) {
  opacity: 1;
}
.photo-slider :deep(.slick-prev),
.photo-slider :deep(.slick-next) {
  z-index: 2;
  width: 40px;
  height: 40px;
  color: #fff;
  font-size: 32px;
  line-height: 40px;
}
.photo-slider :deep(.slick-prev) {
  inset-inline-start: 12px;
}
.photo-slider :deep(.slick-next) {
  inset-inline-end: 12px;
}
.slide-inner {
  position: relative;
  height: min(70vh, 520px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.slide-inner img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.photo-remove {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 3;
}
.lightbox-meta {
  text-align: center;
  margin-top: 10px;
  color: rgba(0, 0, 0, 0.45);
}
.photo-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  justify-content: center;
}
.thumb {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #f0f0f0;
}
.thumb.active {
  border-color: #1677ff;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
