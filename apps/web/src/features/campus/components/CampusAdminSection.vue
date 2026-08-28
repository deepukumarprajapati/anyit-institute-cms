<template>
  <div>
    <a-button
      v-if="canManage"
      type="dashed"
      block
      style="margin-bottom: 12px"
      @click="open()"
    >
      Add campus / branch
    </a-button>
    <a-list :data-source="campuses" item-layout="horizontal">
      <template #renderItem="{ item }">
        <a-list-item>
          <a-list-item-meta>
            <template v-if="item.imageUrl && !item.isPrimary" #avatar>
              <img :src="item.imageUrl" alt="" class="branch-thumb" />
            </template>
            <template #title>
              {{ item.name }}
              <a-tag v-if="item.isPrimary" color="green">Head office</a-tag>
              <a-tag v-else color="blue">Branch</a-tag>
            </template>
            <template #description>
              <div>
                {{ item.code }}
                <span v-if="item.schoolCode"> · School code {{ item.schoolCode }}</span>
              </div>
              <div v-if="item.address || item.pincode">
                {{ [item.address, item.pincode].filter(Boolean).join(', ') }}
              </div>
              <div v-if="item.phone">{{ item.phone }}</div>
            </template>
          </a-list-item-meta>
          <template #actions>
            <a v-if="canManage" @click="open(item)">Edit</a>
            <a
              v-if="campusMapHref(item)"
              :href="campusMapHref(item)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Map
            </a>
          </template>
        </a-list-item>
      </template>
    </a-list>

    <a-modal
      v-model:open="modalOpen"
      :title="editingId ? 'Edit campus / branch' : 'Add campus / branch'"
      :confirm-loading="saving"
      ok-text="Save"
      :width="760"
      destroy-on-close
      @ok="save"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12">
            <a-form-item label="Name" required>
              <a-input v-model:value="form.name" placeholder="Campus or branch name" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="Branch code" required>
              <a-input v-model:value="form.code" placeholder="e.g. EAST" />
            </a-form-item>
          </a-col>
          <a-col v-if="!form.isPrimary" :xs="24" :sm="12">
            <a-form-item label="School code">
              <a-input v-model:value="form.schoolCode" placeholder="UDISE / affiliation code" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="Phone">
              <a-input v-model:value="form.phone" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="Address">
              <a-input v-model:value="form.address" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="Pincode">
              <a-input v-model:value="form.pincode" maxlength="6" placeholder="6 digits" />
            </a-form-item>
          </a-col>
          <template v-if="!form.isPrimary">
            <a-col :span="24">
              <a-form-item label="Location map URL">
                <a-input v-model:value="form.mapUrl" placeholder="Google Maps link" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item label="Latitude">
                <a-input-number v-model:value="form.latitude" :step="0.0001" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item label="Longitude">
                <a-input-number v-model:value="form.longitude" :step="0.0001" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col v-if="embedSrc" :span="24">
              <iframe
                class="map-embed"
                :src="embedSrc"
                title="Branch map"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
              />
            </a-col>
            <a-col :span="24">
              <a-form-item label="Branch main image">
                <div v-if="form.imageUrl" style="margin-bottom: 8px">
                  <img :src="form.imageUrl" alt="Branch" class="branch-preview" />
                </div>
                <a-upload
                  v-if="auth.can('uploads.manage')"
                  :show-upload-list="false"
                  accept="image/*"
                  :before-upload="beforeImageUpload"
                  :custom-request="uploadBranchImage"
                >
                  <a-button>{{ form.imageUrl ? 'Replace image' : 'Upload image' }}</a-button>
                </a-upload>
              </a-form-item>
            </a-col>
          </template>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { UploadRequestOption } from 'ant-design-vue/es/vc-upload/interface';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useCampusStore } from '@/stores/campus';
import { campusMapEmbedSrc, campusMapHref } from '@/features/campus/campusMap';
import type { CampusRecord } from '@/features/campus/types';

defineProps<{
  campuses: CampusRecord[];
  canManage: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const auth = useAuthStore();
const campusStore = useCampusStore();
const saving = ref(false);
const modalOpen = ref(false);
const editingId = ref('');
const form = reactive({
  name: '',
  code: '',
  schoolCode: '',
  phone: '',
  address: '',
  pincode: '',
  mapUrl: '',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
  imageUrl: '',
  isPrimary: false,
});

const embedSrc = computed(() => campusMapEmbedSrc(form));

function open(item?: CampusRecord) {
  editingId.value = item?._id || '';
  form.name = item?.name || '';
  form.code = item?.code || '';
  form.schoolCode = item?.schoolCode || '';
  form.phone = item?.phone || '';
  form.address = item?.address || '';
  form.pincode = item?.pincode || '';
  form.mapUrl = item?.mapUrl || '';
  form.latitude = item?.latitude;
  form.longitude = item?.longitude;
  form.imageUrl = item?.imageUrl || '';
  form.isPrimary = Boolean(item?.isPrimary);
  modalOpen.value = true;
}

function beforeImageUpload(file: File) {
  if (!file.type.startsWith('image/')) {
    message.error('Please choose an image file');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    message.error('Image must be 5 MB or smaller');
    return false;
  }
  return true;
}

async function uploadBranchImage(options: UploadRequestOption) {
  try {
    const body = new FormData();
    body.append('file', options.file as File);
    const { data } = await api.post('/uploads', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    form.imageUrl = data.data.url;
    message.success('Branch image uploaded');
    options.onSuccess?.(data);
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Branch image upload failed');
  }
}

async function save() {
  if (!form.name.trim() || !form.code.trim()) {
    message.error('Name and branch code are required');
    return Promise.reject(new Error('Name and branch code are required'));
  }
  if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
    message.error('Pincode must be 6 digits');
    return Promise.reject(new Error('Pincode must be 6 digits'));
  }
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      phone: form.phone || undefined,
      address: form.address || undefined,
      pincode: form.pincode || undefined,
      ...(form.isPrimary
        ? {}
        : {
            schoolCode: form.schoolCode || undefined,
            mapUrl: form.mapUrl || undefined,
            latitude: form.latitude,
            longitude: form.longitude,
            imageUrl: form.imageUrl || undefined,
          }),
    };
    if (editingId.value) {
      await api.patch(`/campuses/${editingId.value}`, payload);
      message.success('Campus updated');
    } else {
      await api.post('/campuses', payload);
      message.success('Campus added');
    }
    modalOpen.value = false;
    await campusStore.load();
    emit('saved');
  } catch (e: unknown) {
    message.error(
      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message ?? 'Could not save campus'
    );
    return Promise.reject(e instanceof Error ? e : new Error('Could not save campus'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.branch-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}
.branch-preview {
  max-width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 8px;
}
.map-embed {
  width: 100%;
  height: 180px;
  border: 0;
  border-radius: 8px;
}
</style>
