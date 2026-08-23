<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Institute</h1>
        <p>Profile, campuses, and branding</p>
      </div>
      <a-upload
        v-if="auth.can('uploads.manage')"
        :show-upload-list="false"
        :custom-request="uploadLogo"
      >
        <a-button>Upload logo</a-button>
      </a-upload>
    </div>

    <a-row :gutter="16">
      <a-col :xs="24" :lg="14">
        <a-card title="Institute profile">
          <a-form layout="vertical">
            <a-form-item label="Name">
              <a-input v-model:value="form.name" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-form-item label="Email">
              <a-input v-model:value="form.email" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-form-item label="Phone">
              <a-input v-model:value="form.phone" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-form-item label="Address">
              <a-textarea v-model:value="form.address" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-form-item label="Currency">
              <a-input v-model:value="form.settings.currency" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-form-item label="Timezone">
              <a-input v-model:value="form.settings.timezone" :disabled="!auth.can('institute.update')" />
            </a-form-item>
            <a-button
              v-if="auth.can('institute.update')"
              type="primary"
              :loading="saving"
              @click="save"
            >
              Save changes
            </a-button>
          </a-form>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="10">
        <a-card title="Campuses">
          <a-space direction="vertical" style="width: 100%" v-if="auth.can('campuses.manage')">
            <a-input v-model:value="campus.name" placeholder="Campus name" />
            <a-input v-model:value="campus.code" placeholder="Code" />
            <a-button type="dashed" block @click="addCampus">Add campus</a-button>
          </a-space>
          <a-divider />
          <a-list :data-source="campuses" item-layout="horizontal">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta :title="item.name" :description="item.code" />
                <template #actions>
                  <a-tag v-if="item.isPrimary" color="green">Primary</a-tag>
                </template>
              </a-list-item>
            </template>
          </a-list>
          <div v-if="form.logoUrl" style="margin-top: 16px">
            <a-typography-text type="secondary">Logo</a-typography-text>
            <div><img :src="form.logoUrl" alt="logo" style="max-height: 80px" /></div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card title="Login page background" style="margin-top: 16px">
      <p style="color: rgba(0, 0, 0, 0.45); margin-top: 0">
        Campus picture shown behind the sign-in screen. The green overlay stays in place. JPG, PNG, or
        WebP up to 5 MB.
      </p>
      <div v-if="form.loginBackgroundUrl" style="margin-bottom: 12px">
        <img
          :src="form.loginBackgroundUrl"
          alt="Login background"
          style="width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px"
        />
      </div>
      <a-typography-text v-else type="secondary" style="display: block; margin-bottom: 12px">
        Using the default campus image.
      </a-typography-text>
      <a-space>
        <a-upload
          v-if="auth.can('uploads.manage')"
          :show-upload-list="false"
          accept="image/*"
          :before-upload="beforeCampusUpload"
          :custom-request="uploadLoginBackground"
        >
          <a-button type="primary">
            {{ form.loginBackgroundUrl ? 'Replace campus picture' : 'Upload campus picture' }}
          </a-button>
        </a-upload>
        <a-button
          v-if="form.loginBackgroundUrl && auth.can('institute.update')"
          @click="clearLoginBackground"
        >
          Use default
        </a-button>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { UploadRequestOption } from 'ant-design-vue/es/vc-upload/interface';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const saving = ref(false);
const campuses = ref<Record<string, any>[]>([]);
const form = reactive({
  name: '',
  email: '',
  phone: '',
  address: '',
  logoUrl: '',
  loginBackgroundUrl: '',
  settings: { currency: 'INR', timezone: 'Asia/Kolkata' },
});
const campus = reactive({ name: '', code: '' });

async function load() {
  const [inst, camp] = await Promise.all([api.get('/institute'), api.get('/campuses')]);
  Object.assign(form, {
    name: inst.data.data.name,
    email: inst.data.data.email || '',
    phone: inst.data.data.phone || '',
    address: inst.data.data.address || '',
    logoUrl: inst.data.data.logoUrl || '',
    loginBackgroundUrl: inst.data.data.loginBackgroundUrl || '',
    settings: {
      currency: inst.data.data.settings?.currency || 'INR',
      timezone: inst.data.data.settings?.timezone || 'Asia/Kolkata',
    },
  });
  campuses.value = camp.data.data;
}

async function save() {
  saving.value = true;
  try {
    await api.patch('/institute', form);
    message.success('Institute updated');
  } finally {
    saving.value = false;
  }
}

async function addCampus() {
  await api.post('/campuses', campus);
  message.success('Campus added');
  campus.name = '';
  campus.code = '';
  await load();
}

async function uploadLogo(options: UploadRequestOption) {
  const body = new FormData();
  body.append('file', options.file as File);
  const { data } = await api.post('/uploads', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  form.logoUrl = data.data.url;
  await api.patch('/institute', { logoUrl: form.logoUrl });
  message.success('Logo uploaded');
  options.onSuccess?.(data);
}

function beforeCampusUpload(file: File) {
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

async function uploadLoginBackground(options: UploadRequestOption) {
  try {
    const body = new FormData();
    body.append('file', options.file as File);
    const { data } = await api.post('/uploads', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    form.loginBackgroundUrl = data.data.url;
    await api.patch('/institute', { loginBackgroundUrl: form.loginBackgroundUrl });
    message.success('Campus picture uploaded');
    options.onSuccess?.(data);
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Campus picture upload failed');
  }
}

async function clearLoginBackground() {
  try {
    await api.patch('/institute', { loginBackgroundUrl: '' });
    form.loginBackgroundUrl = '';
    message.success('Login page will use the default campus image');
  } catch {
    message.error('Could not reset login background');
  }
}

onMounted(load);
</script>
