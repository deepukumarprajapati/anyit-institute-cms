<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Transport</h1>
        <p>Vehicles, routes, and student assignments</p>
      </div>
    </div>

    <a-tabs>
      <a-tab-pane key="vehicles" tab="Vehicles">
        <a-space style="margin-bottom: 12px" wrap>
          <a-input v-model:value="vehicle.number" placeholder="Vehicle number" />
          <a-input v-model:value="vehicle.driverName" placeholder="Driver" />
          <a-input-number v-model:value="vehicle.capacity" :min="1" placeholder="Capacity" />
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="addVehicle">Add vehicle</a-button>
        </a-space>
        <a-table
          :columns="[
            { title: 'Number', dataIndex: 'number' },
            { title: 'Type', dataIndex: 'type' },
            { title: 'Capacity', dataIndex: 'capacity' },
            { title: 'Driver', dataIndex: 'driverName' },
          ]"
          :data-source="vehicles"
          row-key="_id"
        />
      </a-tab-pane>

      <a-tab-pane key="routes" tab="Routes">
        <a-space style="margin-bottom: 12px" wrap>
          <a-input v-model:value="route.name" placeholder="Route name" />
          <a-select
            v-model:value="route.vehicleId"
            placeholder="Vehicle"
            style="width: 180px"
            :options="vehicleOptions"
            allow-clear
          />
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="addRoute">Add route</a-button>
        </a-space>
        <a-table
          :columns="[
            { title: 'Name', dataIndex: 'name' },
            {
              title: 'Vehicle',
              customRender: ({ record }: any) => record.vehicleId?.number || '-',
            },
            {
              title: 'Stops',
              customRender: ({ record }: any) => (record.stops || []).map((s: any) => s.name).join(', ') || '-',
            },
          ]"
          :data-source="routes"
          row-key="_id"
        />
      </a-tab-pane>

      <a-tab-pane key="assignments" tab="Assignments">
        <a-space style="margin-bottom: 12px" wrap>
          <a-select
            v-model:value="assignment.studentId"
            show-search
            :filter-option="false"
            placeholder="Student"
            style="width: 220px"
            :options="studentOptions"
            @search="searchStudents"
          />
          <a-select
            v-model:value="assignment.routeId"
            placeholder="Route"
            style="width: 180px"
            :options="routeOptions"
          />
          <a-input v-model:value="assignment.stopName" placeholder="Stop name" />
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="assign">Assign</a-button>
        </a-space>
        <a-table
          :columns="[
            {
              title: 'Student',
              customRender: ({ record }: any) =>
                record.studentId
                  ? `${record.studentId.admissionNo} — ${record.studentId.firstName}`
                  : '-',
            },
            {
              title: 'Route',
              customRender: ({ record }: any) => record.routeId?.name || '-',
            },
            { title: 'Stop', dataIndex: 'stopName' },
          ]"
          :data-source="assignments"
          row-key="_id"
        />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const vehicles = ref<Record<string, any>[]>([]);
const routes = ref<Record<string, any>[]>([]);
const assignments = ref<Record<string, any>[]>([]);
const studentOptions = ref<{ label: string; value: string }[]>([]);
const vehicle = reactive({ number: '', driverName: '', capacity: 40 });
const route = reactive({ name: '', vehicleId: undefined as string | undefined });
const assignment = reactive({ studentId: '', routeId: '', stopName: '' });

const vehicleOptions = computed(() =>
  vehicles.value.map((v) => ({ label: v.number, value: v._id }))
);
const routeOptions = computed(() => routes.value.map((r) => ({ label: r.name, value: r._id })));

async function load() {
  const [v, r, a] = await Promise.all([
    api.get('/transport/vehicles'),
    api.get('/transport/routes'),
    api.get('/transport/assignments'),
  ]);
  vehicles.value = v.data.data;
  routes.value = r.data.data;
  assignments.value = a.data.data;
}

async function searchStudents(q: string) {
  const { data } = await api.get('/students', { params: { q, limit: 20 } });
  studentOptions.value = data.data.map((s: any) => ({
    label: `${s.admissionNo} — ${s.firstName}`,
    value: s._id,
  }));
}

async function addVehicle() {
  await api.post('/transport/vehicles', vehicle);
  message.success('Vehicle added');
  Object.assign(vehicle, { number: '', driverName: '', capacity: 40 });
  await load();
}

async function addRoute() {
  await api.post('/transport/routes', {
    name: route.name,
    vehicleId: route.vehicleId,
    stops: [{ name: 'Main Stop', order: 1 }],
  });
  message.success('Route added');
  route.name = '';
  route.vehicleId = undefined;
  await load();
}

async function assign() {
  await api.post('/transport/assignments', assignment);
  message.success('Student assigned');
  Object.assign(assignment, { studentId: '', routeId: '', stopName: '' });
  await load();
}

onMounted(load);
</script>
