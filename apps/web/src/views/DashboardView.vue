<template>
  <div class="dashboard">
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>
          Live operations snapshot
          <span v-if="data?.activeSession" class="session-pill">{{ data.activeSession.name }}</span>
          <span v-if="!campus.isAll" class="session-pill">{{ campus.label }}</span>
        </p>
      </div>
      <a-space>
        <CampusSwitcher always />
        <a-button @click="load" :loading="loading">Refresh</a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-row :gutter="[16, 16]">
        <a-col v-for="card in kpiCards" :key="card.title" :xs="24" :sm="12" :lg="6">
          <a-card class="kpi-card" :bordered="false">
            <a-statistic
              :title="card.title"
              :value="card.value"
              :prefix="card.prefix"
              :suffix="card.suffix"
              :precision="card.precision"
              :value-style="{ color: card.color }"
            />
            <div class="kpi-hint">{{ card.hint }}</div>
          </a-card>
        </a-col>
      </a-row>

      <BranchComparisonTable
        style="margin-top: 16px"
        :rows="data?.byCampus || []"
        :danger-color="COLORS.danger"
      />

      <!-- Fees & Salary finance -->
      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :xs="24" :lg="12">
          <a-card title="Fees overview" :bordered="false" class="finance-card">
            <template #extra>
              <a-button type="link" @click="openFeeDive">Deep dive</a-button>
            </template>
            <div v-if="data?.fees?.sessionName" class="finance-session">
              Active year: {{ data.fees.sessionName }}
            </div>
            <a-row :gutter="[12, 12]">
              <a-col :span="12">
                <a-statistic
                  title="Pending"
                  :value="data?.fees?.pending ?? data?.totalDue ?? 0"
                  prefix="₹"
                  :value-style="{ color: COLORS.danger }"
                />
              </a-col>
              <a-col :span="12">
                <a-statistic
                  title="Received"
                  :value="data?.fees?.received ?? 0"
                  prefix="₹"
                  :value-style="{ color: COLORS.teal }"
                />
              </a-col>
              <a-col :span="12">
                <a-statistic title="Billed" :value="data?.fees?.billed ?? 0" prefix="₹" />
              </a-col>
              <a-col :span="12">
                <a-statistic
                  title="Open invoices"
                  :value="data?.fees?.openInvoiceCount ?? data?.counts.openInvoices ?? 0"
                />
              </a-col>
            </a-row>
            <div class="finance-hint">
              Figures are for the active academic year (same as student profile default).
              {{ data?.fees?.studentCount ?? 0 }} students with pending dues.
            </div>
            <DashboardChart
              v-if="feeClassOption"
              :option="feeClassOption"
              height="220px"
              style="margin-top: 8px"
            />
          </a-card>
        </a-col>

        <a-col :xs="24" :lg="12">
          <a-card title="Salary overview" :bordered="false" class="finance-card">
            <template #extra>
              <a-button type="link" @click="openSalaryDive">Deep dive</a-button>
            </template>
            <a-row :gutter="[12, 12]">
              <a-col :span="12">
                <a-statistic
                  title="Pending to pay"
                  :value="data?.salary?.pending ?? 0"
                  prefix="₹"
                  :value-style="{ color: COLORS.clay }"
                />
              </a-col>
              <a-col :span="12">
                <a-statistic
                  title="Paid"
                  :value="data?.salary?.paid ?? 0"
                  prefix="₹"
                  :value-style="{ color: COLORS.teal }"
                />
              </a-col>
              <a-col :span="12">
                <a-statistic title="Pending slips" :value="data?.salary?.pendingCount ?? 0" />
              </a-col>
              <a-col :span="12">
                <a-statistic title="Paid slips" :value="data?.salary?.paidCount ?? 0" />
              </a-col>
            </a-row>
            <div class="finance-hint">
              {{ data?.salary?.staffCount ?? 0 }} staff on payroll · Staff &amp; month breakdown in
              deep dive
            </div>
            <DashboardChart
              v-if="salaryMonthOption"
              :option="salaryMonthOption"
              height="220px"
              style="margin-top: 8px"
            />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :xs="24" :lg="14">
          <a-card title="Attendance trend (14 days)" :bordered="false" class="chart-card">
            <DashboardChart :option="attendanceLineOption" height="300px" />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="10">
          <a-card title="Attendance mix (14 days)" :bordered="false" class="chart-card">
            <DashboardChart :option="attendancePieOption" height="300px" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :xs="24" :lg="14">
          <a-card title="Fee collections (14 days)" :bordered="false" class="chart-card">
            <DashboardChart :option="collectionBarOption" height="300px" />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="10">
          <a-card title="Invoice status" :bordered="false" class="chart-card">
            <DashboardChart :option="feeStatusOption" height="300px" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :xs="24" :lg="10">
          <a-card title="Students by class" :bordered="false" class="chart-card">
            <DashboardChart :option="studentsByClassOption" height="300px" />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="14">
          <a-card title="Upcoming events" :bordered="false">
            <a-table
              :columns="eventColumns"
              :data-source="data?.upcomingEvents ?? []"
              :pagination="false"
              row-key="_id"
              size="middle"
            />
          </a-card>
        </a-col>
      </a-row>
    </a-spin>

    <!-- Fee deep dive -->
    <a-drawer
      v-model:open="feeDiveOpen"
      :title="`Fees deep dive${data?.fees?.sessionName ? ` · ${data.fees.sessionName}` : ''}`"
      placement="right"
      :width="drawerWidth"
      destroy-on-close
    >
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 12px"
        message="Pending / received match the active academic year — same total as each student’s Fee pending for that year."
      />
      <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
        <a-col :xs="12" :sm="8">
          <a-statistic title="Received" :value="data?.fees?.received ?? 0" prefix="₹" />
        </a-col>
        <a-col :xs="12" :sm="8">
          <a-statistic title="Billed" :value="data?.fees?.billed ?? 0" prefix="₹" />
        </a-col>
        <a-col :xs="12" :sm="8">
          <a-statistic
            title="Pending"
            :value="data?.fees?.pending ?? 0"
            prefix="₹"
            :value-style="{
              color: Number(data?.fees?.pending ?? 0) > 0 ? COLORS.danger : '#389e0d',
            }"
          />
        </a-col>
      </a-row>
      <a-tabs v-model:activeKey="feeDiveTab">
        <a-tab-pane key="class" tab="Class wise">
          <a-table
            size="small"
            row-key="classId"
            :data-source="data?.fees?.byClass ?? []"
            :columns="feeClassColumns"
            :pagination="{ pageSize: 10 }"
          />
        </a-tab-pane>
        <a-tab-pane key="student" tab="Student wise">
          <a-input-search
            v-model:value="feeStudentQ"
            placeholder="Search student / admission / class"
            allow-clear
            style="margin-bottom: 12px; max-width: 320px"
          />
          <a-table
            size="small"
            row-key="studentId"
            :data-source="filteredFeeStudents"
            :columns="feeStudentColumns"
            :pagination="{ pageSize: 12 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <RouterLink :to="`/students/${record.studentId}`">{{ record.name }}</RouterLink>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-drawer>

    <!-- Salary deep dive -->
    <a-drawer
      v-model:open="salaryDiveOpen"
      title="Salary deep dive"
      placement="right"
      :width="drawerWidth"
      destroy-on-close
    >
      <a-row :gutter="[12, 12]" style="margin-bottom: 16px">
        <a-col :xs="12" :sm="8">
          <a-statistic title="Pending" :value="data?.salary?.pending ?? 0" prefix="₹" />
        </a-col>
        <a-col :xs="12" :sm="8">
          <a-statistic title="Paid" :value="data?.salary?.paid ?? 0" prefix="₹" />
        </a-col>
        <a-col :xs="12" :sm="8">
          <a-statistic title="Payroll slips" :value="data?.salary?.payrollCount ?? 0" />
        </a-col>
      </a-row>
      <a-tabs v-model:activeKey="salaryDiveTab">
        <a-tab-pane key="staff" tab="Staff wise">
          <a-input-search
            v-model:value="salaryStaffQ"
            placeholder="Search staff / code / designation"
            allow-clear
            style="margin-bottom: 12px; max-width: 320px"
          />
          <a-table
            size="small"
            row-key="staffId"
            :data-source="filteredSalaryStaff"
            :columns="salaryStaffColumns"
            :pagination="{ pageSize: 12 }"
          />
        </a-tab-pane>
        <a-tab-pane key="month" tab="Month wise">
          <a-table
            size="small"
            row-key="month"
            :data-source="data?.salary?.byMonth ?? []"
            :columns="salaryMonthColumns"
            :pagination="{ pageSize: 12 }"
          />
        </a-tab-pane>
      </a-tabs>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import api from '@/lib/api';
import DashboardChart from '@/components/DashboardChart.vue';
import BranchComparisonTable from '@/features/campus/components/BranchComparisonTable.vue';
import CampusSwitcher from '@/features/campus/components/CampusSwitcher.vue';
import type { BranchDashboardRow } from '@/features/campus/types';
import { useCampusStore } from '@/stores/campus';

type FeeStudentRow = {
  studentId: string;
  admissionNo: string;
  name: string;
  classId?: string;
  className: string;
  sectionName?: string;
  pending: number;
  received: number;
  billed: number;
  invoiceCount: number;
};

type FeeClassRow = {
  classId: string;
  className: string;
  pending: number;
  received: number;
  billed: number;
  studentCount: number;
  invoiceCount: number;
};

type SalaryStaffRow = {
  staffId: string;
  employeeCode: string;
  name: string;
  designation: string;
  pending: number;
  paid: number;
  pendingCount: number;
  paidCount: number;
};

type Dashboard = {
  counts: { students: number; staff: number; openInvoices: number; upcomingEvents: number };
  totalDue: number;
  collected7d: number;
  collectedPeriod?: number;
  attendancePct: number;
  attendancePctPeriod?: number;
  campusCount: number;
  selectedCampusId?: string | null;
  byCampus?: BranchDashboardRow[];
  trendDays?: number;
  activeSession?: { name: string };
  upcomingEvents: { _id: string; title: string; startAt: string; audience: string }[];
  attendanceTrend: {
    date: string;
    percentage: number;
    total: number;
    present?: number;
    absent?: number;
    late?: number;
  }[];
  collectionTrend: { date: string; amount: number }[];
  feeStatusBreakdown?: { status: string; count: number; amount: number }[];
  attendanceStatusBreakdown?: { status: string; count: number }[];
  studentsByClass?: { classId: string; className: string; count: number }[];
  fees?: {
    sessionId?: string | null;
    sessionName?: string | null;
    pending: number;
    received: number;
    billed: number;
    openInvoiceCount: number;
    studentCount: number;
    byClass: FeeClassRow[];
    byStudent: FeeStudentRow[];
  };
  salary?: {
    pending: number;
    paid: number;
    payrollCount: number;
    pendingCount: number;
    paidCount: number;
    staffCount: number;
    byStaff: SalaryStaffRow[];
    byMonth: { month: string; pending: number; paid: number; total: number }[];
  };
};

const COLORS = {
  teal: '#0f5c4c',
  tealSoft: '#2a9d8f',
  clay: '#c45c26',
  claySoft: '#e09f3e',
  slate: '#264653',
  mist: '#8ab0a5',
  danger: '#c1121f',
  muted: '#6c757d',
};

const data = ref<Dashboard | null>(null);
const campus = useCampusStore();
const loading = ref(false);
const feeDiveOpen = ref(false);
const salaryDiveOpen = ref(false);
const feeDiveTab = ref('class');
const salaryDiveTab = ref('staff');
const feeStudentQ = ref('');
const salaryStaffQ = ref('');
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);

function onResize() {
  windowWidth.value = window.innerWidth;
}

const drawerWidth = computed(() => (windowWidth.value < 768 ? '100%' : 720));

const kpiCards = computed(() => [
  {
    title: 'Active students',
    value: data.value?.counts.students ?? 0,
    color: COLORS.teal,
    hint: campus.isAll ? `${data.value?.campusCount ?? 0} campuses` : campus.label,
  },
  {
    title: 'Active staff',
    value: data.value?.counts.staff ?? 0,
    color: COLORS.slate,
    hint: 'On payroll roster',
  },
  {
    title: 'Fee pending',
    value: data.value?.fees?.pending ?? data.value?.totalDue ?? 0,
    prefix: '₹',
    color: COLORS.danger,
    hint: `${data.value?.fees?.studentCount ?? 0} students owing`,
  },
  {
    title: 'Salary pending',
    value: data.value?.salary?.pending ?? 0,
    prefix: '₹',
    color: COLORS.clay,
    hint: `${data.value?.salary?.pendingCount ?? 0} slips unpaid`,
  },
]);

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function shortDate(d: string) {
  return dayjs(d).format('DD MMM');
}

function labelStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function openFeeDive() {
  feeDiveOpen.value = true;
}

function openSalaryDive() {
  salaryDiveOpen.value = true;
}

const filteredFeeStudents = computed(() => {
  const q = feeStudentQ.value.trim().toLowerCase();
  const rows = data.value?.fees?.byStudent ?? [];
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.admissionNo.toLowerCase().includes(q) ||
      (r.className || '').toLowerCase().includes(q)
  );
});

const filteredSalaryStaff = computed(() => {
  const q = salaryStaffQ.value.trim().toLowerCase();
  const rows = data.value?.salary?.byStaff ?? [];
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.employeeCode.toLowerCase().includes(q) ||
      (r.designation || '').toLowerCase().includes(q)
  );
});

const feeClassColumns = [
  { title: 'Class', dataIndex: 'className' },
  { title: 'Students', dataIndex: 'studentCount', width: 90 },
  {
    title: 'Received',
    customRender: ({ record }: { record: FeeClassRow }) => inr(record.received),
  },
  {
    title: 'Billed',
    customRender: ({ record }: { record: FeeClassRow }) => inr(record.billed),
  },
  {
    title: 'Pending',
    key: 'pending',
    customRender: ({ record }: { record: FeeClassRow }) =>
      h(
        'span',
        {
          style: {
            color: Number(record.pending) > 0 ? COLORS.danger : '#389e0d',
            fontWeight: 600,
          },
        },
        inr(record.pending),
      ),
  },
];

const feeStudentColumns = [
  { title: 'Student', key: 'name' },
  { title: 'Admission', dataIndex: 'admissionNo', width: 110 },
  { title: 'Class', dataIndex: 'className', width: 100 },
  {
    title: 'Received',
    customRender: ({ record }: { record: FeeStudentRow }) => inr(record.received),
  },
  {
    title: 'Pending',
    key: 'pending',
    customRender: ({ record }: { record: FeeStudentRow }) =>
      h(
        'span',
        {
          style: {
            color: Number(record.pending) > 0 ? COLORS.danger : '#389e0d',
            fontWeight: 600,
          },
        },
        inr(record.pending),
      ),
  },
];

const salaryStaffColumns = [
  { title: 'Staff', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'employeeCode', width: 100 },
  { title: 'Designation', dataIndex: 'designation' },
  {
    title: 'Pending',
    customRender: ({ record }: { record: SalaryStaffRow }) => inr(record.pending),
  },
  {
    title: 'Paid',
    customRender: ({ record }: { record: SalaryStaffRow }) => inr(record.paid),
  },
];

const salaryMonthColumns = [
  {
    title: 'Month',
    customRender: ({ record }: { record: { month: string } }) =>
      dayjs(`${record.month}-01`).format('MMM YYYY'),
  },
  {
    title: 'Pending',
    customRender: ({ record }: { record: { pending: number } }) => inr(record.pending),
  },
  {
    title: 'Paid',
    customRender: ({ record }: { record: { paid: number } }) => inr(record.paid),
  },
  {
    title: 'Total',
    customRender: ({ record }: { record: { total: number } }) => inr(record.total),
  },
];

const feeClassOption = computed<EChartsCoreOption | null>(() => {
  const rows = [...(data.value?.fees?.byClass ?? [])].slice(0, 8).reverse();
  if (!rows.length) return emptyOption('No class fee data');
  return {
    animationDuration: 800,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) =>
        typeof v === 'number' ? inr(v) : String(v ?? ''),
    },
    legend: { top: 0, data: ['Pending', 'Received'] },
    grid: { left: 80, right: 16, top: 36, bottom: 24 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.className),
      axisLabel: { color: '#444', fontSize: 11 },
    },
    series: [
      {
        name: 'Pending',
        type: 'bar',
        stack: 'fee',
        data: rows.map((r) => r.pending),
        itemStyle: { color: COLORS.danger, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 14,
      },
      {
        name: 'Received',
        type: 'bar',
        stack: 'fee',
        data: rows.map((r) => r.received),
        itemStyle: { color: COLORS.teal, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 14,
      },
    ],
  };
});

const salaryMonthOption = computed<EChartsCoreOption | null>(() => {
  const rows = [...(data.value?.salary?.byMonth ?? [])].slice(0, 8).reverse();
  if (!rows.length) return emptyOption('No payroll data yet');
  return {
    animationDuration: 800,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) =>
        typeof v === 'number' ? inr(v) : String(v ?? ''),
    },
    legend: { top: 0 },
    grid: { left: 48, right: 12, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => dayjs(`${r.month}-01`).format('MMM YY')),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
    },
    series: [
      {
        name: 'Pending',
        type: 'bar',
        data: rows.map((r) => r.pending),
        itemStyle: { color: COLORS.clay, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 18,
      },
      {
        name: 'Paid',
        type: 'bar',
        data: rows.map((r) => r.paid),
        itemStyle: { color: COLORS.teal, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  };
});

const attendanceLineOption = computed<EChartsCoreOption | null>(() => {
  const rows = data.value?.attendanceTrend ?? [];
  if (!rows.length) return emptyOption('No attendance marked in the last 14 days');
  return {
    animationDuration: 900,
    animationEasing: 'cubicOut',
    color: [COLORS.teal, COLORS.clay, COLORS.danger],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v}%` : String(v ?? '')),
    },
    legend: { top: 0, data: ['Attendance %', 'Present', 'Absent'] },
    grid: { left: 40, right: 18, top: 40, bottom: 28 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => shortDate(r.date)),
      axisLabel: { color: '#666', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '%',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      {
        type: 'value',
        name: 'Count',
        min: 0,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Attendance %',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        yAxisIndex: 0,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15,92,76,0.35)' },
              { offset: 1, color: 'rgba(15,92,76,0.02)' },
            ],
          },
        },
        data: rows.map((r) => r.percentage),
        animationDuration: 1100,
      },
      {
        name: 'Present',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 14,
        itemStyle: { color: COLORS.tealSoft, borderRadius: [3, 3, 0, 0] },
        data: rows.map((r) => r.present ?? 0),
        animationDelay: (idx: number) => idx * 40,
      },
      {
        name: 'Absent',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 14,
        itemStyle: { color: COLORS.danger, borderRadius: [3, 3, 0, 0] },
        data: rows.map((r) => r.absent ?? 0),
        animationDelay: (idx: number) => idx * 40 + 80,
      },
    ],
  };
});

const attendancePieOption = computed<EChartsCoreOption | null>(() => {
  const rows = data.value?.attendanceStatusBreakdown ?? [];
  if (!rows.length) return emptyOption('No attendance mix yet');
  const colorMap: Record<string, string> = {
    present: COLORS.teal,
    late: COLORS.claySoft,
    half_day: COLORS.mist,
    absent: COLORS.danger,
    excused: COLORS.muted,
  };
  return {
    animationDuration: 1000,
    animationEasing: 'elasticOut',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{d}%' },
        data: rows.map((r) => ({
          name: labelStatus(r.status),
          value: r.count,
          itemStyle: { color: colorMap[r.status] || COLORS.slate },
        })),
        animationType: 'scale',
        animationDelay: (idx: number) => idx * 80,
      },
    ],
  };
});

const collectionBarOption = computed<EChartsCoreOption | null>(() => {
  const rows = data.value?.collectionTrend ?? [];
  if (!rows.length) return emptyOption('No collections in the last 14 days');
  return {
    animationDuration: 900,
    color: [COLORS.clay],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) =>
        typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : String(v ?? ''),
    },
    grid: { left: 52, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => shortDate(r.date)),
      axisLabel: { color: '#666', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
    },
    series: [
      {
        type: 'bar',
        name: 'Collected',
        barMaxWidth: 22,
        data: rows.map((r) => r.amount),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: COLORS.clay },
              { offset: 1, color: COLORS.claySoft },
            ],
          },
        },
        animationDelay: (idx: number) => idx * 35,
      },
      {
        type: 'line',
        name: 'Trend',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: COLORS.slate },
        data: rows.map((r) => r.amount),
        animationDuration: 1200,
      },
    ],
  };
});

const feeStatusOption = computed<EChartsCoreOption | null>(() => {
  const rows = data.value?.feeStatusBreakdown ?? [];
  if (!rows.length) return emptyOption('No invoice data');
  const colorMap: Record<string, string> = {
    paid: COLORS.teal,
    partial: COLORS.claySoft,
    issued: COLORS.clay,
    draft: COLORS.muted,
    cancelled: COLORS.danger,
  };
  return {
    animationDuration: 1000,
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        `${p.name}<br/>Invoices: ${p.value}<br/>Pending ₹${Number(p.data?.amount || 0).toLocaleString('en-IN')}`,
    },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        roseType: 'area',
        radius: ['18%', '68%'],
        center: ['50%', '46%'],
        itemStyle: { borderRadius: 5 },
        data: rows.map((r) => ({
          name: labelStatus(r.status),
          value: r.count,
          amount: r.amount,
          itemStyle: { color: colorMap[r.status] || COLORS.slate },
        })),
        animationType: 'expansion',
        animationDelay: (idx: number) => idx * 90,
      },
    ],
  };
});

const studentsByClassOption = computed<EChartsCoreOption | null>(() => {
  const rows = data.value?.studentsByClass ?? [];
  if (!rows.length) return emptyOption('No class enrollments for active session');
  const sorted = [...rows].sort((a, b) => a.count - b.count);
  return {
    animationDuration: 900,
    color: [COLORS.teal],
    tooltip: { trigger: 'axis' },
    grid: { left: 90, right: 24, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((r) => r.className),
      axisLabel: { color: '#444' },
    },
    series: [
      {
        type: 'bar',
        name: 'Students',
        data: sorted.map((r) => r.count),
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: COLORS.teal },
              { offset: 1, color: COLORS.tealSoft },
            ],
          },
        },
        label: { show: true, position: 'right', color: '#333' },
        animationDelay: (idx: number) => idx * 70,
      },
    ],
  };
});

function emptyOption(message: string): EChartsCoreOption {
  return {
    title: {
      text: message,
      left: 'center',
      top: 'middle',
      textStyle: { color: '#999', fontSize: 13, fontWeight: 400 },
    },
  };
}

const eventColumns = [
  { title: 'Title', dataIndex: 'title' },
  {
    title: 'When',
    dataIndex: 'startAt',
    customRender: ({ text }: { text: string }) => dayjs(text).format('DD MMM YYYY HH:mm'),
  },
  { title: 'Audience', dataIndex: 'audience' },
];

async function load(opts?: { silent?: boolean }) {
  // Keep dashboard content mounted; only spin overlay (never blank the page)
  if (!opts?.silent || !data.value) loading.value = true;
  try {
    const { data: res } = await api.get('/dashboard', {
      params: { campusId: campus.queryCampusId },
    });
    data.value = res.data;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  load();
});

watch(
  () => campus.selectedId,
  () => {
    load({ silent: true });
  }
);

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.dashboard .page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.session-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #e8f3ef;
  color: #0f5c4c;
  font-size: 12px;
  font-weight: 600;
}
.kpi-card {
  background: linear-gradient(160deg, #ffffff 0%, #f6faf8 100%);
  border: 1px solid #eef2f0;
  border-radius: 12px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(15, 92, 76, 0.08);
}
.kpi-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
}
.chart-card,
.finance-card {
  border: 1px solid #eef2f0;
  border-radius: 12px;
}
.finance-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #888;
}
.finance-session {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #0f5c4c;
}
</style>
