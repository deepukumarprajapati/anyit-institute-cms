<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Fees</h1>
        <p>Structures, invoices, collections, and dues</p>
      </div>
      <a-space>
        <CampusSwitcher always width="180px" />
        <a-button
          v-if="auth.can('fees.manage') || auth.can('fees.collect')"
          type="primary"
          @click="invoiceOpen = true"
        >
          Create invoice
        </a-button>
        <!-- Collect payment disabled for now — pay only via Create invoice (Save as Paid)
        <a-button v-if="auth.can('fees.collect')" type="primary" @click="paymentOpen = true">Collect payment</a-button>
        -->
      </a-space>
    </div>

    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :span="8">
        <a-card><a-statistic title="Total dues" :value="dues.totalDue" prefix="₹" /></a-card>
      </a-col>
      <a-col :span="16">
        <a-card title="Open invoices" size="small">
          <a-table size="small" :columns="dueColumns" :data-source="dues.items" :pagination="false" row-key="_id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'student'">
                <RouterLink v-if="record.studentId?._id" :to="`/students/${record.studentId._id}`">
                  {{ record.studentId.firstName || '-' }}
                </RouterLink>
                <span v-else>-</span>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <a-tabs>
      <a-tab-pane key="invoices" tab="Invoices">
        <a-table :columns="invoiceColumns" :data-source="invoices" :loading="loading" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'student'">
              <RouterLink v-if="record.studentId?._id" :to="`/students/${record.studentId._id}`">
                {{ `${record.studentId.firstName || ''} ${record.studentId.lastName || ''}`.trim() || '-' }}
              </RouterLink>
              <span v-else>-</span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="payments" tab="Payments">
        <a-table :columns="paymentColumns" :data-source="payments" :loading="loading" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'student'">
              <RouterLink v-if="record.studentId?._id" :to="`/students/${record.studentId._id}`">
                {{ `${record.studentId.admissionNo || ''} ${record.studentId.firstName || ''}`.trim() }}
              </RouterLink>
              <span v-else>-</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" type="link" @click="previewReceipt(record)">Preview</a-button>
                <a-button size="small" type="link" @click="downloadReceipt(String(record._id))">Download</a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="structures" tab="Structures">
        <a-space style="margin-bottom: 12px">
          <a-button v-if="auth.can('fees.manage')" type="primary" @click="structureOpen = true">Add structure</a-button>
        </a-space>
        <a-table :columns="structureColumns" :data-source="structures" row-key="_id" />
      </a-tab-pane>
      <a-tab-pane key="heads" tab="Fee categories">
        <a-alert
          type="info"
          show-icon
          style="margin-bottom: 12px"
          message="Class fees apply only to selected classes. Transport uses distance slabs per student. Ad-hoc is for one-off charges (fines) on a student profile."
        />
        <a-card size="small" title="Create fee category" style="margin-bottom: 16px">
          <a-form layout="vertical">
            <a-row :gutter="12">
              <a-col :xs="24" :md="8">
                <a-form-item label="Title" required>
                  <a-input v-model:value="head.name" placeholder="e.g. Annual fee / Uniform" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="4">
                <a-form-item label="Code" required>
                  <a-input v-model:value="head.code" placeholder="ANNUAL" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="6">
                <a-form-item label="Type">
                  <a-select v-model:value="head.category" :options="categoryOptions" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="6">
                <a-form-item label="Applies to" required>
                  <a-select
                    v-model:value="head.applicability"
                    :options="applicabilityOptions"
                    @change="onApplicabilityChange"
                  />
                </a-form-item>
              </a-col>
              <a-col v-if="head.applicability === 'class'" :xs="24" :md="12">
                <a-form-item label="Classes" required>
                  <a-select
                    v-model:value="head.classIds"
                    mode="multiple"
                    placeholder="Select classes"
                    :options="classOptions"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col v-if="head.applicability === 'class'" :xs="24" :md="6">
                <a-form-item label="Amount (₹)">
                  <a-input-number v-model:value="head.defaultAmount" :min="0" style="width: 100%" />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :md="6">
                <a-form-item label=" ">
                  <a-button v-if="auth.can('fees.manage')" type="primary" block @click="addHead">
                    Save category
                  </a-button>
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>
        </a-card>
        <a-table
          :columns="headColumns"
          :data-source="heads"
          row-key="_id"
          :pagination="false"
        />
      </a-tab-pane>

      <a-tab-pane key="transport-tiers" tab="Transport distance fees">
        <a-alert
          type="info"
          show-icon
          style="margin-bottom: 12px"
          message="Transport fees are not class-wide. Create distance slabs here, then assign a slab on each student’s profile when enabling transport."
        />
        <a-space style="margin-bottom: 12px" wrap>
          <a-input v-model:value="tierForm.name" placeholder="e.g. Up to 5 km" style="width: 180px" />
          <a-input-number v-model:value="tierForm.maxKm" :min="0.5" :step="0.5" placeholder="Max km" />
          <a-input-number
            v-model:value="tierForm.monthlyAmount"
            :min="0"
            placeholder="Monthly ₹"
            style="width: 140px"
          />
          <a-button
            v-if="auth.can('fees.manage') || auth.can('transport.manage')"
            type="primary"
            @click="addTier"
          >
            Add distance slab
          </a-button>
        </a-space>
        <a-table :columns="tierColumns" :data-source="feeTiers" row-key="_id" :pagination="false" />
      </a-tab-pane>
    </a-tabs>

    <DraggableDialog
      v-model:open="invoiceOpen"
      title="Create invoice"
      storage-key="create-invoice"
    >
      <p class="muted" style="margin-top: 0">
        Drag empty space to move the dialog. <strong>Save as Paid</strong> clears pending dues
        (oldest first). If nothing is due, the amount is recorded as <strong>advance paid</strong>.
        <strong>Save as Pending</strong> adds a new charge.
      </p>
      <a-form layout="vertical">
        <a-form-item label="Student" required>
          <a-select
            v-model:value="invoice.studentId"
            show-search
            allow-clear
            placeholder="Search student"
            :filter-option="false"
            :options="studentOptions"
            style="width: 100%"
            @search="searchStudents"
          />
        </a-form-item>
        <a-form-item label="Total amount (₹)" required>
          <a-input-number v-model:value="invoice.amount" :min="1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Description" required>
          <a-textarea
            v-model:value="invoice.description"
            :rows="3"
            placeholder="What is this invoice for?"
            :maxlength="500"
            show-count
          />
        </a-form-item>
        <a-form-item label="Payment method">
          <a-select
            v-model:value="invoice.method"
            style="width: 100%"
            :options="['cash', 'upi', 'card', 'bank', 'other'].map((v) => ({ label: v.toUpperCase(), value: v }))"
          />
        </a-form-item>
        <a-space style="width: 100%; justify-content: flex-end" wrap>
          <a-button @click="invoiceOpen = false">Cancel</a-button>
          <a-button :loading="saving" @click="createInvoice('pending')">Save as Pending</a-button>
          <a-button type="primary" :loading="saving" @click="createInvoice('paid')">
            Save as Paid
          </a-button>
        </a-space>
      </a-form>
    </DraggableDialog>

    <!-- Collect payment modal kept for later; pay flow is Create invoice → Save as Paid
    <a-modal v-model:open="paymentOpen" title="Collect payment" @ok="collectPayment" :confirm-loading="saving">
      ...
    </a-modal>
    -->

    <a-modal v-model:open="structureOpen" title="Fee structure" @ok="createStructure" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="Name" required><a-input v-model:value="structure.name" /></a-form-item>
        <a-form-item label="Session" required>
          <a-select v-model:value="structure.sessionId" :options="sessionOptions" />
        </a-form-item>
        <a-form-item label="Class" required>
          <a-select v-model:value="structure.classId" :options="classOptions" />
        </a-form-item>
        <a-form-item label="Fee head" required>
          <a-select v-model:value="structure.feeHeadId" :options="headOptions" />
        </a-form-item>
        <a-form-item label="Amount" required>
          <a-input-number v-model:value="structure.amount" :min="0" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
    <a-modal
      v-model:open="previewOpen"
      :title="previewTitle"
      width="920px"
      :footer="null"
      destroy-on-close
      @cancel="closePreview"
    >
      <a-spin :spinning="previewLoading">
        <div class="preview-toolbar">
          <a-space>
            <a-button type="primary" :disabled="!previewUrl" @click="downloadFromPreview">
              Download PDF
            </a-button>
            <a-button :disabled="!previewUrl" @click="openPreviewInTab">Open in new tab</a-button>
            <a-button @click="closePreview">Close</a-button>
          </a-space>
        </div>
        <iframe
          v-if="previewUrl"
          class="receipt-frame"
          :src="previewUrl"
          title="Fee invoice preview"
        />
        <a-empty v-else-if="!previewLoading" description="Unable to load preview" />
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { FEE_APPLICABILITIES, FEE_APPLICABILITY_LABELS, FEE_CATEGORIES, FEE_CATEGORY_LABELS, type FeeApplicability, type FeeCategory } from '@anyit/shared';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useCampusStore } from '@/stores/campus';
import DraggableDialog from '@/components/DraggableDialog.vue';
import CampusSwitcher from '@/features/campus/components/CampusSwitcher.vue';

const auth = useAuthStore();
const campus = useCampusStore();
const loading = ref(false);
const saving = ref(false);
const invoices = ref<Record<string, unknown>[]>([]);
const payments = ref<Record<string, unknown>[]>([]);
const structures = ref<Record<string, unknown>[]>([]);
const heads = ref<Record<string, any>[]>([]);
const feeTiers = ref<Record<string, any>[]>([]);
const dues = reactive<{ totalDue: number; items: Record<string, unknown>[] }>({ totalDue: 0, items: [] });
const sessionOptions = ref<{ label: string; value: string }[]>([]);
const classOptions = ref<{ label: string; value: string }[]>([]);
const studentOptions = ref<{ label: string; value: string }[]>([]);
const categoryOptions = FEE_CATEGORIES.map((c) => ({
  label: FEE_CATEGORY_LABELS[c],
  value: c,
}));
const applicabilityOptions = FEE_APPLICABILITIES.map((a) => ({
  label: FEE_APPLICABILITY_LABELS[a],
  value: a,
}));
const invoiceOpen = ref(false);
const paymentOpen = ref(false);
const structureOpen = ref(false);
const lastReceiptId = ref<string | null>(null);
const previewOpen = ref(false);
const previewLoading = ref(false);
const previewUrl = ref<string | null>(null);
const previewPaymentId = ref<string | null>(null);
const previewTitle = ref('Invoice preview');

const head = reactive({
  name: '',
  code: '',
  category: 'tuition' as FeeCategory,
  applicability: 'class' as FeeApplicability,
  classIds: [] as string[],
  defaultAmount: 0,
});
const tierForm = reactive({ name: '', maxKm: 5, monthlyAmount: 0 });
const invoice = reactive({
  studentId: '',
  amount: 0,
  description: '',
  method: 'cash',
});
const payment = reactive({ invoiceId: '', amount: 0, method: 'cash' });
const structure = reactive({ name: '', sessionId: '', classId: '', feeHeadId: '', amount: 0 });

const headOptions = computed(() =>
  heads.value.map((h) => ({ label: String(h.name), value: String(h._id) }))
);
const invoiceOptions = computed(() =>
  invoices.value
    .filter((i) => ['issued', 'partial'].includes(String(i.status)))
    .map((i) => ({
      label: `${i.invoiceNo} — ₹${Number(i.totalAmount) - Number(i.paidAmount)} due`,
      value: String(i._id),
    }))
);

const headColumns = [
  { title: 'Title', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'code' },
  {
    title: 'Type',
    customRender: ({ record }: { record: { category: FeeCategory } }) =>
      FEE_CATEGORY_LABELS[record.category] || record.category,
  },
  {
    title: 'Applies to',
    customRender: ({ record }: { record: { applicability?: FeeApplicability } }) =>
      FEE_APPLICABILITY_LABELS[record.applicability || 'class'] || record.applicability,
  },
  {
    title: 'Classes',
    customRender: ({ record }: { record: { applicability?: string; classIds?: { name?: string }[] } }) => {
      if (record.applicability === 'transport') return 'Per student (distance)';
      if (record.applicability === 'adhoc') return 'One-off on student';
      return (record.classIds || []).map((c) => c.name).filter(Boolean).join(', ') || '—';
    },
  },
  {
    title: 'Amount',
    customRender: ({ record }: { record: { applicability?: string; defaultAmount?: number } }) =>
      record.applicability === 'class' && record.defaultAmount
        ? `₹${Number(record.defaultAmount).toLocaleString('en-IN')}`
        : '—',
  },
];

const tierColumns = [
  { title: 'Slab', dataIndex: 'name' },
  {
    title: 'Up to (km)',
    dataIndex: 'maxKm',
  },
  {
    title: 'Monthly fee',
    customRender: ({ record }: { record: { monthlyAmount: number } }) =>
      `₹${Number(record.monthlyAmount).toLocaleString('en-IN')}`,
  },
];

const invoiceColumns = [
  { title: 'Invoice', dataIndex: 'invoiceNo' },
  { title: 'Student', key: 'student' },
  { title: 'Total', dataIndex: 'totalAmount' },
  { title: 'Paid', dataIndex: 'paidAmount' },
  { title: 'Status', dataIndex: 'status' },
];
const paymentColumns = [
  { title: 'Receipt', dataIndex: 'receiptNo' },
  { title: 'Student', key: 'student' },
  { title: 'Amount', dataIndex: 'amount' },
  { title: 'Method', dataIndex: 'method' },
  { title: 'Actions', key: 'actions' },
];
const dueColumns = [
  { title: 'Invoice', dataIndex: 'invoiceNo' },
  { title: 'Student', key: 'student' },
  {
    title: 'Due',
    customRender: ({ record }: { record: { totalAmount: number; paidAmount: number } }) =>
      record.totalAmount - record.paidAmount,
  },
];
const structureColumns = [
  { title: 'Name', dataIndex: 'name' },
  {
    title: 'Class',
    customRender: ({ record }: { record: { classId?: { name?: string } } }) => record.classId?.name || '-',
  },
  {
    title: 'Session',
    customRender: ({ record }: { record: { sessionId?: { name?: string } } }) => record.sessionId?.name || '-',
  },
];

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) loading.value = true;
  try {
    const [inv, pay, str, hd, due, sessions, classes, tiers] = await Promise.all([
      api.get('/fees/invoices', { params: { campusId: campus.queryCampusId } }),
      api.get('/fees/payments'),
      api.get('/fees/structures'),
      api.get('/fees/heads'),
      api.get('/fees/dues', { params: { campusId: campus.queryCampusId } }),
      api.get('/sessions'),
      api.get('/classes'),
      api.get('/transport/fee-tiers').catch(() => ({ data: { data: [] } })),
    ]);
    invoices.value = inv.data.data;
    payments.value = pay.data.data;
    structures.value = str.data.data;
    heads.value = hd.data.data;
    feeTiers.value = tiers.data.data || [];
    dues.totalDue = due.data.data.totalDue;
    dues.items = due.data.data.items;
    sessionOptions.value = sessions.data.data.map((s: { _id: string; name: string }) => ({
      label: s.name,
      value: s._id,
    }));
    classOptions.value = classes.data.data.map((c: { _id: string; name: string }) => ({
      label: c.name,
      value: c._id,
    }));
  } finally {
    loading.value = false;
  }
}

function onApplicabilityChange(v: FeeApplicability) {
  if (v === 'transport') head.category = 'transport';
  if (v === 'adhoc' && head.category === 'tuition') head.category = 'fine';
  if (v !== 'class') {
    head.classIds = [];
    head.defaultAmount = 0;
  }
}

async function addHead() {
  if (!head.name.trim() || !head.code.trim()) {
    message.warning('Title and code are required');
    return;
  }
  if (head.applicability === 'class' && !head.classIds.length) {
    message.warning('Select at least one class');
    return;
  }
  await api.post('/fees/heads', {
    name: head.name.trim(),
    code: head.code.trim(),
    category: head.category,
    applicability: head.applicability,
    classIds: head.applicability === 'class' ? head.classIds : [],
    defaultAmount: head.applicability === 'class' ? head.defaultAmount : 0,
    isOptional: head.applicability !== 'class',
  });
  message.success('Fee category saved');
  head.name = '';
  head.code = '';
  head.category = 'tuition';
  head.applicability = 'class';
  head.classIds = [];
  head.defaultAmount = 0;
  await load({ silent: true });
}

async function addTier() {
  if (!tierForm.name.trim() || !tierForm.maxKm || tierForm.monthlyAmount < 0) {
    message.warning('Enter slab name, max km and amount');
    return;
  }
  await api.post('/transport/fee-tiers', {
    name: tierForm.name.trim(),
    maxKm: tierForm.maxKm,
    monthlyAmount: tierForm.monthlyAmount,
  });
  message.success('Distance slab added');
  tierForm.name = '';
  tierForm.maxKm = 5;
  tierForm.monthlyAmount = 0;
  await load({ silent: true });
}

async function searchStudents(q: string) {
  const { data } = await api.get('/students', { params: { q, limit: 20 } });
  studentOptions.value = data.data.map((s: { _id: string; firstName: string; admissionNo: string }) => ({
    label: `${s.admissionNo} — ${s.firstName}`,
    value: s._id,
  }));
}

async function fetchReceiptBlob(id: string, inline = false) {
  const res = await api.get(`/fees/payments/${id}/receipt.pdf`, {
    responseType: 'blob',
    params: inline ? { inline: 1 } : undefined,
  });
  return res.data as Blob;
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
}

async function previewReceipt(record: Record<string, unknown>) {
  const id = String(record._id);
  previewPaymentId.value = id;
  previewTitle.value = `Invoice / Receipt — ${record.receiptNo || id}`;
  previewOpen.value = true;
  previewLoading.value = true;
  revokePreview();
  try {
    const blob = await fetchReceiptBlob(id, true);
    previewUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  } catch {
    message.error('Failed to load invoice preview');
    previewOpen.value = false;
  } finally {
    previewLoading.value = false;
  }
}

function closePreview() {
  previewOpen.value = false;
  revokePreview();
  previewPaymentId.value = null;
}

async function downloadReceipt(id: string) {
  const blob = await fetchReceiptBlob(id, false);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fee-invoice-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadFromPreview() {
  if (!previewPaymentId.value) return;
  await downloadReceipt(previewPaymentId.value);
}

function openPreviewInTab() {
  if (!previewUrl.value) return;
  window.open(previewUrl.value, '_blank');
}

async function createInvoice(paymentStatus: 'pending' | 'paid' = 'pending') {
  if (!invoice.studentId) {
    message.warning('Select a student');
    return;
  }
  if (!invoice.amount || invoice.amount <= 0) {
    message.warning('Enter amount');
    return;
  }
  if (!invoice.description.trim()) {
    message.warning('Enter description');
    return;
  }
  saving.value = true;
  try {
    const { data } = await api.post('/fees/invoices', {
      studentId: invoice.studentId,
      amount: invoice.amount,
      description: invoice.description.trim(),
      paymentStatus,
      paymentMethod: invoice.method,
    });
    const created = data.data;
    if (paymentStatus === 'paid') {
      const adv = Number(created?.advanceAmount || 0);
      const settled = Number(created?.settledAmount || 0);
      if (adv > 0 && settled <= 0) {
        message.success(`No dues — recorded as advance paid ₹${adv.toLocaleString('en-IN')}`);
      } else if (adv > 0) {
        message.success(
          `Cleared ₹${settled.toLocaleString('en-IN')} dues; ₹${adv.toLocaleString('en-IN')} kept as advance`,
        );
      } else {
        message.success('Payment applied to pending dues');
      }
    } else {
      message.success('Invoice created as pending');
    }
    invoiceOpen.value = false;
    invoice.studentId = '';
    invoice.amount = 0;
    invoice.description = '';
    invoice.method = 'cash';
    await load({ silent: true });
    if (paymentStatus === 'paid') {
      const payId = created?.payment?._id;
      if (payId) {
        lastReceiptId.value = String(payId);
        const pay = payments.value.find((p) => String(p._id) === lastReceiptId.value);
        await previewReceipt(pay || { _id: payId, receiptNo: created?.payment?.receiptNo });
      }
    }
  } finally {
    saving.value = false;
  }
}

async function collectPayment() {
  saving.value = true;
  try {
    const { data } = await api.post('/fees/payments', payment);
    message.success('Payment collected');
    paymentOpen.value = false;
    lastReceiptId.value = data.data.payment._id;
    await load({ silent: true });
    if (lastReceiptId.value) {
      const pay = payments.value.find((p) => String(p._id) === lastReceiptId.value);
      await previewReceipt(pay || { _id: lastReceiptId.value, receiptNo: data.data.payment.receiptNo });
    }  } finally {
    saving.value = false;
  }
}

async function createStructure() {
  saving.value = true;
  try {
    await api.post('/fees/structures', {
      name: structure.name,
      sessionId: structure.sessionId,
      classId: structure.classId,
      items: [{ feeHeadId: structure.feeHeadId, amount: structure.amount }],
    });
    message.success('Structure created');
    structureOpen.value = false;
    await load({ silent: true });
  } finally {
    saving.value = false;
  }
}

onMounted(load);

watch(
  () => campus.selectedId,
  () => load({ silent: true })
);
</script>

<style scoped>
.muted {
  color: rgba(0, 0, 0, 0.45);
}
.preview-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.receipt-frame {
  width: 100%;
  height: min(72vh, 780px);
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #525659;
}
</style>
