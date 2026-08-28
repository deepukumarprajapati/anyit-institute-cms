<template>
  <div class="login-shell signup-shell" :style="shellStyle">
    <section class="login-hero">
      <a-typography-text style="color: rgba(255, 255, 255, 0.85)">{{ instituteName }}</a-typography-text>
      <h1>Open your institute<br />in minutes.</h1>
      <p>Create your campus account, then manage students, fees, attendance, and staff from one place.</p>
    </section>
    <div class="login-card-wrap signup-card-wrap">
      <a-card title="Create institute" class="signup-card">
        <a-form layout="vertical" class="signup-form" :model="form" @finish="onSubmit">
          <a-row :gutter="16">
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Institute name"
                name="instituteName"
                :rules="[{ required: true, min: 2, message: 'Enter your institute name' }]"
              >
                <a-input
                  v-model:value="form.instituteName"
                  size="large"
                  placeholder="e.g. Greenfield Public School"
                />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Institute code"
                name="instituteCode"
                extra="Internal ID for the organisation — not a school code."
                :rules="[{ required: true, min: 2, message: 'Enter a short code' }]"
              >
                <a-input
                  v-model:value="form.instituteCode"
                  size="large"
                  placeholder="Letters and digits, e.g. GREENFIELD"
                />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Admin name"
                name="adminName"
                :rules="[{ required: true, min: 2, message: 'Enter the admin name' }]"
              >
                <a-input v-model:value="form.adminName" size="large" placeholder="Your name" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Admin email"
                name="email"
                :rules="[{ required: true, type: 'email', message: 'Enter a valid email' }]"
              >
                <a-input v-model:value="form.email" size="large" placeholder="you@institute.com" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Password"
                name="password"
                :rules="[{ required: true, min: 8, message: 'Use at least 8 characters' }]"
              >
                <a-input-password v-model:value="form.password" size="large" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item
                label="Confirm password"
                name="confirmPassword"
                :rules="[{ required: true, validator: confirmPassword }]"
              >
                <a-input-password v-model:value="form.confirmPassword" size="large" />
              </a-form-item>
            </a-col>
          </a-row>

          <div class="signup-section">Head office</div>
          <a-row :gutter="16">
            <a-col :xs="24" :sm="12">
              <a-form-item label="Phone" name="phone">
                <a-input v-model:value="form.phone" size="large" placeholder="Optional" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item label="Pincode" name="pincode" :rules="[{ validator: pincodeRule }]">
                <a-input v-model:value="form.pincode" size="large" placeholder="6 digits" maxlength="6" />
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="Address" name="address">
                <a-input v-model:value="form.address" size="large" placeholder="Head office address" />
              </a-form-item>
            </a-col>
          </a-row>

          <div class="signup-branch-toggle">
            <a-switch v-model:checked="addBranch" />
            <span>Also add a campus / branch</span>
          </div>

          <template v-if="addBranch">
            <div class="signup-section">Campus / branch</div>
            <a-row :gutter="16">
              <a-col :xs="24" :sm="12">
                <a-form-item
                  label="Branch name"
                  name="branchName"
                  :rules="[{ required: true, min: 2, message: 'Enter the branch name' }]"
                >
                  <a-input v-model:value="form.branchName" size="large" placeholder="e.g. East Campus" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item
                  label="Branch code"
                  name="branchCode"
                  :rules="[{ required: true, min: 1, message: 'Enter a branch code' }]"
                >
                  <a-input v-model:value="form.branchCode" size="large" placeholder="e.g. EAST" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="School code" name="schoolCode">
                  <a-input v-model:value="form.schoolCode" size="large" placeholder="UDISE / affiliation code" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="Branch phone" name="branchPhone">
                  <a-input v-model:value="form.branchPhone" size="large" placeholder="Optional" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="Branch address" name="branchAddress">
                  <a-input v-model:value="form.branchAddress" size="large" placeholder="Optional" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="Pincode" name="branchPincode" :rules="[{ validator: branchPincodeRule }]">
                  <a-input v-model:value="form.branchPincode" size="large" placeholder="6 digits" maxlength="6" />
                </a-form-item>
              </a-col>
              <a-col :span="24">
                <a-form-item label="Location map URL" name="mapUrl">
                  <a-input v-model:value="form.mapUrl" size="large" placeholder="Google Maps link" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="Latitude" name="latitude">
                  <a-input-number v-model:value="form.latitude" :step="0.0001" style="width: 100%" placeholder="28.6139" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="Longitude" name="longitude">
                  <a-input-number v-model:value="form.longitude" :step="0.0001" style="width: 100%" placeholder="77.2090" />
                </a-form-item>
              </a-col>
              <a-col :span="24">
                <a-form-item label="Branch main image">
                  <a-upload
                    :show-upload-list="false"
                    accept="image/*"
                    :before-upload="beforeBranchImage"
                    :custom-request="pickBranchImage"
                  >
                    <a-button>{{ branchImageName || 'Choose image' }}</a-button>
                  </a-upload>
                </a-form-item>
              </a-col>
            </a-row>
          </template>

          <a-alert v-if="error" type="error" :message="error" show-icon style="margin-bottom: 12px" />
          <a-button type="primary" html-type="submit" block size="large" :loading="auth.loading">
            Create institute
          </a-button>
        </a-form>
        <a-typography-text type="secondary" style="display: block; margin-top: 12px; text-align: center">
          Already have an account?
          <router-link to="/login">Sign in</router-link>
        </a-typography-text>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { UploadRequestOption } from 'ant-design-vue/es/vc-upload/interface';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const DEFAULT_CAMPUS_BG =
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=80';

const auth = useAuthStore();
const router = useRouter();
const error = ref('');
const instituteName = ref('ANYIT INSTITUTE');
const loginBackgroundUrl = ref('');
const codeTouched = ref(false);
const addBranch = ref(false);
const branchCodeTouched = ref(false);
const branchImageFile = ref<File | null>(null);
const branchImageName = ref('');
const form = reactive({
  instituteName: '',
  instituteCode: '',
  phone: '',
  address: '',
  pincode: '',
  adminName: '',
  email: '',
  password: '',
  confirmPassword: '',
  branchName: '',
  branchCode: '',
  schoolCode: '',
  branchPhone: '',
  branchAddress: '',
  branchPincode: '',
  mapUrl: '',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
});

const shellStyle = computed(() => {
  const url = loginBackgroundUrl.value || DEFAULT_CAMPUS_BG;
  return {
    backgroundImage: `linear-gradient(135deg, rgba(15, 92, 76, 0.92), rgba(15, 92, 76, 0.55)), url("${url}")`,
  };
});

function codeFromName(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

watch(
  () => form.instituteName,
  (name) => {
    if (!codeTouched.value) form.instituteCode = codeFromName(name);
  }
);

watch(
  () => form.instituteCode,
  (code) => {
    if (code !== codeFromName(form.instituteName)) codeTouched.value = true;
  }
);

watch(
  () => form.branchName,
  (name) => {
    if (!branchCodeTouched.value) form.branchCode = codeFromName(name).slice(0, 8) || '';
  }
);

watch(
  () => form.branchCode,
  (code) => {
    if (code !== codeFromName(form.branchName).slice(0, 8)) branchCodeTouched.value = true;
  }
);

const confirmPassword: Rule['validator'] = async (_rule, value: string) => {
  if (!value) throw new Error('Confirm your password');
  if (value !== form.password) throw new Error('Passwords do not match');
};

const pincodeRule: Rule['validator'] = async (_rule, value: string) => {
  if (value && !/^\d{6}$/.test(value)) throw new Error('Pincode must be 6 digits');
};

const branchPincodeRule: Rule['validator'] = async (_rule, value: string) => {
  if (value && !/^\d{6}$/.test(value)) throw new Error('Pincode must be 6 digits');
};

function beforeBranchImage(file: File) {
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

function pickBranchImage(options: UploadRequestOption) {
  branchImageFile.value = options.file as File;
  branchImageName.value = (options.file as File).name;
  options.onSuccess?.({});
}

async function loadBranding() {
  try {
    const { data } = await api.get('/auth/branding');
    instituteName.value = data.data.name || 'ANYIT INSTITUTE';
    loginBackgroundUrl.value = data.data.loginBackgroundUrl || '';
  } catch {
    /* keep default campus image */
  }
}

onMounted(loadBranding);

async function onSubmit() {
  error.value = '';
  try {
    const result = await auth.signup({
      instituteName: form.instituteName,
      instituteCode: form.instituteCode,
      adminName: form.adminName,
      email: form.email,
      password: form.password,
      phone: form.phone || undefined,
      address: form.address || undefined,
      pincode: form.pincode || undefined,
      branch: addBranch.value
        ? {
            name: form.branchName,
            code: form.branchCode,
            schoolCode: form.schoolCode || undefined,
            phone: form.branchPhone || undefined,
            address: form.branchAddress || undefined,
            pincode: form.branchPincode || undefined,
            mapUrl: form.mapUrl || undefined,
            latitude: form.latitude ?? undefined,
            longitude: form.longitude ?? undefined,
          }
        : undefined,
    });
    if (branchImageFile.value && result.campuses?.branchId) {
      const body = new FormData();
      body.append('file', branchImageFile.value);
      const { data } = await api.post('/uploads', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.patch(`/campuses/${result.campuses.branchId}`, { imageUrl: data.data.url });
    }
    message.success('Institute created. Welcome aboard.');
    await router.replace('/');
  } catch (e: unknown) {
    error.value =
      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message ?? 'Could not create institute';
  }
}
</script>

<style scoped>
.signup-card {
  width: min(960px, 100%);
}

.signup-form :deep(.ant-form-item) {
  margin-bottom: 12px;
}

.signup-section {
  font-weight: 600;
  margin: 4px 0 8px;
}

.signup-branch-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 12px;
}
</style>
