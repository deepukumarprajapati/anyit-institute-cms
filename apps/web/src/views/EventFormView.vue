<template>
  <div class="event-form-page">
    <div class="page-header">
      <a-space>
        <a-button @click="goBack">← Back</a-button>
        <div>
          <h1 style="margin: 0">{{ isEdit ? 'Edit event' : 'Create event' }}</h1>
          <p style="margin: 4px 0 0" class="muted">
            {{ isEdit ? 'Update event details' : 'Add a new institute event' }}
          </p>
        </div>
      </a-space>
      <a-space>
        <a-button @click="goBack">Cancel</a-button>
        <a-button type="primary" :loading="saving" @click="submit">
          {{ isEdit ? 'Save changes' : 'Create event' }}
        </a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-card :bordered="false" class="form-card">
        <a-form layout="vertical" :model="form" style="max-width: 720px">
          <a-form-item label="Title" required>
            <a-input v-model:value="form.title" placeholder="e.g. Annual Day 2026" />
          </a-form-item>
          <a-form-item label="Location">
            <a-input v-model:value="form.location" placeholder="Hall / campus / venue" />
          </a-form-item>
          <a-form-item label="Audience">
            <a-select
              v-model:value="form.audience"
              :options="audienceOptions"
              style="width: 100%"
            />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :xs="24" :md="12">
              <a-form-item label="Start" required>
                <a-date-picker v-model:value="form.startAt" show-time style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :md="12">
              <a-form-item label="End" required>
                <a-date-picker v-model:value="form.endAt" show-time style="width: 100%" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="Description">
            <a-textarea
              v-model:value="form.description"
              :rows="5"
              placeholder="Agenda, notes, or instructions"
            />
          </a-form-item>
        </a-form>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs, { Dayjs } from 'dayjs';
import { message } from 'ant-design-vue';
import api from '@/lib/api';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => route.name === 'event-edit');
const eventId = computed(() => (isEdit.value ? String(route.params.id) : ''));

const loading = ref(false);
const saving = ref(false);

const audienceOptions = ['all', 'students', 'staff', 'parents'].map((v) => ({
  label: v,
  value: v,
}));

const form = reactive<{
  title: string;
  location: string;
  audience: string;
  description: string;
  startAt: Dayjs | null;
  endAt: Dayjs | null;
}>({
  title: '',
  location: '',
  audience: 'all',
  description: '',
  startAt: dayjs().add(1, 'day').hour(10).minute(0),
  endAt: dayjs().add(1, 'day').hour(12).minute(0),
});

function resetCreateForm() {
  form.title = '';
  form.location = '';
  form.audience = 'all';
  form.description = '';
  form.startAt = dayjs().add(1, 'day').hour(10).minute(0);
  form.endAt = dayjs().add(1, 'day').hour(12).minute(0);
}

function goBack() {
  if (isEdit.value && eventId.value) {
    router.push(`/events/${eventId.value}`);
  } else {
    router.push('/events');
  }
}

async function loadEvent() {
  if (!isEdit.value) {
    resetCreateForm();
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get(`/events/${eventId.value}`);
    const item = data.data;
    form.title = item.title || '';
    form.location = item.location || '';
    form.audience = item.audience || 'all';
    form.description = item.description || '';
    form.startAt = item.startAt ? dayjs(item.startAt) : null;
    form.endAt = item.endAt ? dayjs(item.endAt) : null;
  } catch {
    message.error('Event not found');
    router.replace('/events');
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!form.title.trim() || !form.startAt || !form.endAt) {
    message.warning('Title, start and end are required');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      location: form.location || undefined,
      audience: form.audience,
      description: form.description || undefined,
      startAt: form.startAt.toISOString(),
      endAt: form.endAt.toISOString(),
    };
    if (isEdit.value) {
      await api.patch(`/events/${eventId.value}`, payload);
      message.success('Event updated');
      await router.push(`/events/${eventId.value}`);
    } else {
      const { data } = await api.post('/events', payload);
      message.success('Event created — add participants next');
      await router.push(`/events/${data.data._id}`);
    }
  } finally {
    saving.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    void loadEvent();
  }
);

onMounted(loadEvent);
</script>

<style scoped>
.muted {
  color: rgba(0, 0, 0, 0.45);
}
.form-card {
  background: #fff;
}
</style>
