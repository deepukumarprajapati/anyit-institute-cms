import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { Permission } from '@anyit/shared';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    permission?: Permission | Permission[];
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/views/SignupView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { permission: 'dashboard.view' } },
      { path: 'students', name: 'students', component: () => import('@/views/StudentsView.vue'), meta: { permission: 'students.view' } },
      { path: 'students/new', name: 'student-create', component: () => import('@/views/StudentFormView.vue'), meta: { permission: 'students.create' } },
      { path: 'students/:id/edit', name: 'student-edit', component: () => import('@/views/StudentFormView.vue'), meta: { permission: 'students.update' } },
      { path: 'students/:id', name: 'student-detail', component: () => import('@/views/StudentDetailView.vue'), meta: { permission: 'students.view' } },
      { path: 'staff', name: 'staff', component: () => import('@/views/StaffView.vue'), meta: { permission: 'staff.view' } },
      { path: 'attendance', name: 'attendance', component: () => import('@/views/AttendanceView.vue'), meta: { permission: ['attendance.view', 'attendance.mark'] } },
      { path: 'fees', name: 'fees', component: () => import('@/views/FeesView.vue'), meta: { permission: 'fees.view' } },
      { path: 'reports', name: 'reports', component: () => import('@/views/ReportsView.vue'), meta: { permission: ['students.view', 'fees.view'] } },
      { path: 'salary', name: 'salary', component: () => import('@/views/SalaryView.vue'), meta: { permission: 'salary.view' } },
      { path: 'transport', name: 'transport', component: () => import('@/views/TransportView.vue'), meta: { permission: 'transport.view' } },
      { path: 'events', name: 'events', component: () => import('@/views/EventsView.vue'), meta: { permission: 'events.view' } },
      { path: 'events/new', name: 'event-create', component: () => import('@/views/EventFormView.vue'), meta: { permission: 'events.manage' } },
      { path: 'events/:id/edit', name: 'event-edit', component: () => import('@/views/EventFormView.vue'), meta: { permission: 'events.manage' } },
      { path: 'events/:id', name: 'event-detail', component: () => import('@/views/EventDetailView.vue'), meta: { permission: 'events.view' } },
      { path: 'academic', name: 'academic', component: () => import('@/views/AcademicView.vue'), meta: { permission: ['sessions.manage', 'classes.manage'] } },
      { path: 'institute', name: 'institute', component: () => import('@/views/InstituteView.vue'), meta: { permission: 'institute.view' } },
      { path: 'branches/:id', name: 'branch-detail', component: () => import('@/features/campus/views/BranchDetailView.vue'), meta: { permission: 'dashboard.view' } },
      { path: 'roles', name: 'roles', component: () => import('@/views/RolesView.vue'), meta: { permission: 'roles.manage' } },
      { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { permission: 'users.manage' } },
      { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue'), meta: { permission: 'audit.view' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (auth.isAuthenticated && (to.name === 'login' || to.name === 'signup')) {
      return { name: 'dashboard' };
    }
    return true;
  }
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      await auth.logout();
      return { name: 'login' };
    }
  }
  const needed = to.meta.permission;
  if (needed) {
    const list = Array.isArray(needed) ? needed : [needed];
    // Any of the listed permissions is enough (OR).
    if (!auth.can(...list)) {
      console.warn('[router] blocked', to.path, 'needs one of', list);
      return { name: 'dashboard' };
    }
  }
  return true;
});
