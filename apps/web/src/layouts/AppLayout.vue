<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider
      v-model:collapsed="collapsed"
      collapsible
      theme="dark"
      :width="240"
      breakpoint="lg"
      class="sider"
    >
      <div class="brand">
        <span class="mark">AI</span>
        <span v-if="!collapsed">AnyIT CMS</span>
      </div>
      <div class="menu-scroll">
        <a-menu
          theme="dark"
          mode="inline"
          :selected-keys="[selectedKey]"
          :items="menuItems"
          @click="onMenuClick"
        />
      </div>
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="header">
        <div>
          <strong>{{ auth.user?.name }}</strong>
          <a-tag color="green" style="margin-left: 8px">{{ auth.user?.role.name }}</a-tag>
        </div>
        <div class="header-actions">
          <CampusSwitcher />
          <a-button @click="onLogout">Logout</a-button>
        </div>
      </a-layout-header>
      <a-layout-content class="content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ItemType } from 'ant-design-vue';
import {
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  DollarOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useCampusStore } from '@/stores/campus';
import CampusSwitcher from '@/features/campus/components/CampusSwitcher.vue';
import type { Permission } from '@anyit/shared';

const auth = useAuthStore();
const campus = useCampusStore();
const router = useRouter();
const route = useRoute();
const collapsed = ref(false);

onMounted(() => {
  campus.load();
});

const nav: {
  to: string;
  label: string;
  icon: unknown;
  permission?: Permission | Permission[];
}[] = [
  { to: '/', label: 'Dashboard', icon: DashboardOutlined, permission: 'dashboard.view' },
  { to: '/students', label: 'Students', icon: UserOutlined, permission: 'students.view' },
  { to: '/staff', label: 'Staff', icon: TeamOutlined, permission: 'staff.view' },
  {
    to: '/attendance',
    label: 'Attendance',
    icon: ScheduleOutlined,
    permission: ['attendance.view', 'attendance.mark'],
  },
  { to: '/fees', label: 'Fees', icon: DollarOutlined, permission: 'fees.view' },
  {
    to: '/reports',
    label: 'Reports',
    icon: BarChartOutlined,
    permission: ['students.view', 'fees.view'],
  },
  { to: '/salary', label: 'Salary', icon: WalletOutlined, permission: 'salary.view' },
  { to: '/transport', label: 'Transport', icon: CarOutlined, permission: 'transport.view' },
  { to: '/events', label: 'Events', icon: CalendarOutlined, permission: 'events.view' },
  {
    to: '/academic',
    label: 'Academic',
    icon: ReadOutlined,
    permission: ['sessions.manage', 'classes.manage'],
  },
  { to: '/institute', label: 'Institute', icon: BankOutlined, permission: 'institute.view' },
  {
    to: '/roles',
    label: 'Roles',
    icon: SafetyCertificateOutlined,
    permission: 'roles.manage',
  },
  {
    to: '/users',
    label: 'Users',
    icon: UserAddOutlined,
    permission: 'users.manage',
  },
  { to: '/audit', label: 'Audit', icon: AuditOutlined, permission: 'audit.view' },
];

const visibleNav = computed(() =>
  nav.filter((item) => {
    if (!item.permission) return true;
    const list = Array.isArray(item.permission) ? item.permission : [item.permission];
    return auth.can(...list);
  })
);

const menuItems = computed<ItemType[]>(() =>
  visibleNav.value.map((item) => ({
    key: item.to,
    label: item.label,
    icon: () => h(item.icon as object),
    title: item.label,
  }))
);

const selectedKey = computed(() => {
  const path = route.path;
  const exact = visibleNav.value.find((item) => item.to === path);
  if (exact) return exact.to;
  // Keep Students highlighted on student sub-routes
  if (path.startsWith('/students')) return '/students';
  const prefix = visibleNav.value
    .filter((item) => item.to !== '/' && path.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return prefix?.to ?? '/';
});

async function onMenuClick(info: { key: string | number }) {
  const target = String(info.key);
  if (route.path === target) return;
  try {
    await router.push(target);
  } catch (err) {
    console.error('[nav] failed to navigate to', target, err);
  }
}

async function onLogout() {
  await auth.logout();
  await router.replace({ name: 'login' });
}
</script>

<style scoped>
.sider {
  overflow: hidden;
  height: 100vh;
  position: sticky;
  top: 0;
  left: 0;
}
.menu-scroll {
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
}
.brand {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #0f5c4c;
  display: grid;
  place-items: center;
}
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #f0f0f0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.content {
  margin: 16px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  min-height: 280px;
}
</style>
