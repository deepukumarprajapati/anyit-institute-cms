<template>
  <a-modal
    :open="open"
    title="Transfer to another branch"
    ok-text="Transfer"
    :confirm-loading="saving"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <p class="muted">
      From the effective month, unpaid invoices are cancelled so fees can be billed at the new campus.
      Paid months stay in history.
    </p>
    <a-form layout="vertical">
      <a-form-item label="New campus / branch" required>
        <a-select v-model:value="form.toCampusId" :options="campusOptions" style="width: 100%" />
      </a-form-item>
      <a-form-item label="Effective month" required>
        <a-input v-model:value="form.effectiveMonth" placeholder="YYYY-MM" />
      </a-form-item>
      <a-form-item label="Reason">
        <a-select v-model:value="form.reason" :options="TRANSFER_REASON_OPTIONS" style="width: 100%" />
      </a-form-item>
      <a-form-item label="Notes">
        <a-textarea v-model:value="form.notes" :rows="2" placeholder="e.g. Parent relocated" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { TRANSFER_REASON_OPTIONS } from '@/features/campus/types';
import { useCampusStore } from '@/stores/campus';

const props = defineProps<{
  open: boolean;
  studentId: string;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  transferred: [];
}>();

const campus = useCampusStore();
const saving = ref(false);
const campusOptions = ref<{ label: string; value: string }[]>([]);
const form = reactive({
  toCampusId: '',
  effectiveMonth: currentMonth(),
  reason: 'parent_relocation',
  notes: '',
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadOptions() {
  if (campus.campuses.length) {
    campusOptions.value = campus.campuses.map((c) => ({
      value: c._id,
      label: c.isPrimary ? `${c.name} (Head office)` : c.name,
    }));
    return;
  }
  try {
    const { data } = await api.get('/campuses');
    campusOptions.value = (data.data || []).map((c: { _id: string; name: string; isPrimary?: boolean }) => ({
      value: c._id,
      label: c.isPrimary ? `${c.name} (Head office)` : c.name,
    }));
  } catch {
    campusOptions.value = [];
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.effectiveMonth = currentMonth();
      form.notes = '';
      loadOptions();
    }
  }
);

onMounted(loadOptions);

async function submit() {
  if (!form.toCampusId) {
    message.error('Select the new campus');
    return Promise.reject(new Error('Select the new campus'));
  }
  saving.value = true;
  try {
    const { data } = await api.post(`/students/${props.studentId}/campus-transfers`, {
      toCampusId: form.toCampusId,
      effectiveMonth: form.effectiveMonth,
      reason: form.reason,
      notes: form.notes || undefined,
    });
    const n = data.data?.cancelledCount || 0;
    message.success(
      n
        ? `Transferred. ${n} unpaid invoice(s) from this month onward were cancelled.`
        : 'Student transferred to the new campus'
    );
    emit('update:open', false);
    emit('transferred');
  } catch (e: unknown) {
    message.error(
      (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message ?? 'Could not transfer student'
    );
    return Promise.reject(e instanceof Error ? e : new Error('transfer failed'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.muted {
  margin-top: 0;
  color: rgba(0, 0, 0, 0.45);
}
</style>
