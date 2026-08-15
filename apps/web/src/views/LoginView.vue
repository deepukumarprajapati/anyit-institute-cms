<template>
  <div class="login-shell">
    <section class="login-hero">
      <a-typography-text style="color: rgba(255, 255, 255, 0.85)">ANYIT INSTITUTE</a-typography-text>
      <h1>Campus operations,<br />one control plane.</h1>
      <p>Manage students, staff, fees, attendance, and more from a single enterprise CMS.</p>
    </section>
    <div class="login-card-wrap">
      <a-card title="Sign in" style="width: min(420px, 100%)">
        <a-form layout="vertical" :model="form" @finish="onSubmit">
          <a-form-item label="Email" name="email" :rules="[{ required: true, type: 'email' }]">
            <a-input v-model:value="form.email" size="large" />
          </a-form-item>
          <a-form-item label="Password" name="password" :rules="[{ required: true, min: 6 }]">
            <a-input-password v-model:value="form.password" size="large" />
          </a-form-item>
          <a-alert v-if="error" type="error" :message="error" show-icon style="margin-bottom: 12px" />
          <a-button type="primary" html-type="submit" block size="large" :loading="auth.loading">
            Sign in
          </a-button>
        </a-form>
        <a-typography-text type="secondary" style="display: block; margin-top: 12px">
          admin@anyit.local / Admin@12345
          <br />
          Also: teacher@ · accountant@ · principal@ · receptionist@anyit.local
        </a-typography-text>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const error = ref('');
const form = reactive({
  email: 'admin@anyit.local',
  password: 'Admin@12345',
});

async function onSubmit() {
  error.value = '';
  try {
    await auth.login(form.email, form.password);
    message.success('Welcome back');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirect || '/');
  } catch (e: unknown) {
    error.value =
      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message ?? 'Login failed';
  }
}
</script>
