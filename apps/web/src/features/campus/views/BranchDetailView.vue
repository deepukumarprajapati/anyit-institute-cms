<template>
  <div>
    <div class="page-header">
      <a-space>
        <a-button @click="router.push('/')">← Dashboard</a-button>
        <div>
          <h1 style="margin: 0">{{ campus?.name || 'Branch' }}</h1>
          <p style="margin: 4px 0 0">
            {{ campus?.code }}
            <a-tag v-if="campus?.isPrimary" color="green" style="margin-left: 8px">Head office</a-tag>
            <a-tag v-else color="blue" style="margin-left: 8px">Branch</a-tag>
            <span v-if="campus?.schoolCode" class="muted"> · School code {{ campus.schoolCode }}</span>
          </p>
        </div>
      </a-space>
      <a-space>
        <a-button @click="useOnDashboard">Use on dashboard</a-button>
        <a-button type="primary" @click="router.push('/students')">Students</a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-row :gutter="[16, 16]">
        <a-col :xs="12" :md="6">
          <a-card><a-statistic title="Students" :value="dash?.counts.students ?? 0" /></a-card>
        </a-col>
        <a-col :xs="12" :md="6">
          <a-card><a-statistic title="Staff" :value="dash?.counts.staff ?? 0" /></a-card>
        </a-col>
        <a-col :xs="12" :md="6">
          <a-card>
            <a-statistic
              title="Fee pending"
              :value="dash?.fees?.pending ?? 0"
              prefix="₹"
              :value-style="{ color: (dash?.fees?.pending || 0) > 0 ? '#c1121f' : '#389e0d' }"
            />
          </a-card>
        </a-col>
        <a-col :xs="12" :md="6">
          <a-card>
            <a-statistic title="Received" :value="dash?.fees?.received ?? 0" prefix="₹" />
          </a-card>
        </a-col>
      </a-row>

      <a-card title="Branch profile" style="margin-top: 16px">
        <a-descriptions bordered :column="2" size="small">
          <a-descriptions-item label="Name">{{ detail?.name || '—' }}</a-descriptions-item>
          <a-descriptions-item label="Code">{{ detail?.code || '—' }}</a-descriptions-item>
          <a-descriptions-item v-if="!detail?.isPrimary" label="School code">
            {{ detail?.schoolCode || '—' }}
          </a-descriptions-item>
          <a-descriptions-item label="Phone">{{ detail?.phone || '—' }}</a-descriptions-item>
          <a-descriptions-item label="Pincode">{{ detail?.pincode || '—' }}</a-descriptions-item>
          <a-descriptions-item label="Address" :span="2">{{ detail?.address || '—' }}</a-descriptions-item>
        </a-descriptions>
        <div v-if="detail?.imageUrl" style="margin-top: 12px">
          <img :src="detail.imageUrl" alt="" style="max-height: 180px; border-radius: 8px; object-fit: cover" />
        </div>
        <a
          v-if="mapHref"
          :href="mapHref"
          target="_blank"
          rel="noopener noreferrer"
          style="display: inline-block; margin-top: 12px"
        >
          Open location map
        </a>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/lib/api';
import { campusMapHref } from '@/features/campus/campusMap';
import { useCampusStore } from '@/stores/campus';

const route = useRoute();
const router = useRouter();
const campusStore = useCampusStore();
const loading = ref(false);
const dash = ref<Record<string, any> | null>(null);
const campuses = ref<Record<string, any>[]>([]);

const id = computed(() => String(route.params.id || ''));
const campus = computed(
  () =>
    campuses.value.find((c) => c._id === id.value) ||
    campusStore.campuses.find((c) => c._id === id.value)
);
const detail = computed(() => campuses.value.find((c) => c._id === id.value));
const mapHref = computed(() => campusMapHref(detail.value));

async function load() {
  loading.value = true;
  try {
    const [d, c] = await Promise.all([
      api.get('/dashboard', { params: { campusId: id.value } }),
      api.get('/campuses'),
    ]);
    dash.value = d.data.data;
    campuses.value = c.data.data || [];
  } finally {
    loading.value = false;
  }
}

function useOnDashboard() {
  campusStore.setSelected(id.value);
  router.push('/');
}

onMounted(load);
watch(id, load);
</script>
