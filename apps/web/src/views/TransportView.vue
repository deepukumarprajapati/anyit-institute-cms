<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Transport</h1>
        <p>Vehicles, crew, duty history, routes, and student assignments</p>
      </div>
    </div>

    <a-tabs>
      <a-tab-pane key="vehicles" tab="Vehicles">
        <div class="tab-toolbar">
          <p class="muted">Bus number, route number, trip timings, and capacity.</p>
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="openVehicleCreate">
            Add vehicle
          </a-button>
        </div>
        <a-table :columns="vehicleColumns" :data-source="vehicles" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'timings'">
              <div v-if="(record.timings || []).length" class="timing-list">
                <div v-for="(slot, idx) in sortedTimings(record.timings)" :key="slot._id || idx">
                  {{ slot.time }} → {{ slot.route || slot.routeId?.name || 'Route' }}
                </div>
              </div>
              <span v-else class="muted">—</span>
            </template>
            <template v-else-if="column.key === 'driver'">
              {{ crewName(record.driverId) || record.driverName || '-' }}
            </template>
            <template v-else-if="column.key === 'conductor'">
              {{ crewName(record.conductorId) || '-' }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openHistory('vehicle', record)">History</a-button>
                <template v-if="auth.can('transport.manage')">
                  <a-button size="small" @click="openVehicleEdit(record)">Edit</a-button>
                  <a-popconfirm
                    title="Delete this vehicle? Assigned drivers, conductors, and routes will be unlinked."
                    @confirm="removeVehicle(record._id)"
                  >
                    <a-button size="small" danger>Delete</a-button>
                  </a-popconfirm>
                </template>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="drivers" tab="Drivers">
        <div class="tab-toolbar">
          <p class="muted">Drivers and conductors — name, phone, photo, and assigned bus.</p>
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="openCrewCreate('driver')">
            Add driver / conductor
          </a-button>
        </div>
        <a-table :columns="crewColumns" :data-source="crew" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'photo'">
              <a-avatar :size="40" :src="record.photoUrl || undefined">
                {{ initials(record.name) }}
              </a-avatar>
            </template>
            <template v-else-if="column.key === 'role'">
              <a-tag :color="record.role === 'driver' ? 'blue' : 'purple'">
                {{ record.role === 'driver' ? 'Driver' : 'Conductor' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'vehicle'">
              {{ record.vehicleId?.number || '-' }}
              <span v-if="record.vehicleId?.routeNumber" class="muted">
                · Route {{ record.vehicleId.routeNumber }}
              </span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openHistory(record.role === 'conductor' ? 'conductor' : 'driver', record)">
                  History
                </a-button>
                <a-button size="small" @click="openCrewEdit(record)">Edit</a-button>
                <a-popconfirm
                  v-if="auth.can('transport.manage')"
                  title="Remove this person from transport?"
                  @confirm="removeCrew(record._id)"
                >
                  <a-button size="small" danger>Delete</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
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

      <a-tab-pane key="duties" tab="Duty roster">
        <div class="tab-toolbar">
          <p class="muted">Dated record of which bus ran which route. Use Relief when a driver or conductor takes leave and someone else covers.</p>
          <a-button v-if="auth.can('transport.manage')" type="primary" @click="openDutyCreate">
            Add duty
          </a-button>
        </div>
        <a-table :columns="dutyColumns" :data-source="duties" row-key="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'dates'">{{ formatDutyDates(record) }}</template>
            <template v-else-if="column.key === 'vehicle'">{{ record.vehicleId?.number || '-' }}</template>
            <template v-else-if="column.key === 'route'">
              {{ record.route }}
              <span v-if="record.time" class="muted"> · {{ record.time }}</span>
            </template>
            <template v-else-if="column.key === 'driver'">
              <div>{{ crewName(record.driverId) || '-' }}</div>
              <div v-for="rel in driverReliefs(record)" :key="rel._id" class="relief-note">
                {{ formatReliefNote(rel) }}
              </div>
            </template>
            <template v-else-if="column.key === 'conductor'">
              <div>{{ crewName(record.conductorId) || '-' }}</div>
              <div v-for="rel in conductorReliefs(record)" :key="rel._id" class="relief-note">
                {{ formatReliefNote(rel) }}
              </div>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space v-if="auth.can('transport.manage')">
                <a-button size="small" @click="openRelief(record)">Relief</a-button>
                <a-button size="small" @click="openDutyEdit(record)">Edit</a-button>
                <a-popconfirm title="Delete this duty record?" @confirm="removeDuty(record._id)">
                  <a-button size="small" danger>Delete</a-button>
                </a-popconfirm>
              </a-space>
              <span v-else class="muted">—</span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="assignments" tab="Students">
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

    <a-modal
      v-model:open="vehicleModalOpen"
      :title="editingVehicle ? 'Edit vehicle' : 'Add vehicle'"
      :confirm-loading="vehicleSaving"
      :width="680"
      @ok="saveVehicle"
    >
      <a-form layout="vertical">
        <a-form-item label="Vehicle number" required>
          <a-input v-model:value="vehicleForm.number" placeholder="e.g. UP16AB1234" />
        </a-form-item>
        <a-form-item label="Type">
          <a-select v-model:value="vehicleForm.type" :options="vehicleTypeOptions" />
        </a-form-item>
        <a-form-item label="Bus route number">
          <a-input v-model:value="vehicleForm.routeNumber" placeholder="e.g. 12 or R-01" />
        </a-form-item>
        <a-form-item label="Capacity">
          <a-input-number v-model:value="vehicleForm.capacity" :min="1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Trip timings">
          <p class="muted timing-hint">Add one or more slots, e.g. 07:30 → Route 1, 14:00 → Route 2.</p>
          <div v-for="row in vehicleForm.timings" :key="row.key" class="timing-row">
            <a-time-picker
              v-model:value="row.time"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="Time"
              style="width: 130px"
            />
            <a-auto-complete
              v-model:value="row.route"
              :options="timingRouteOptions"
              placeholder="Route 1"
              allow-clear
              style="flex: 1"
            />
            <a-button danger type="text" @click="removeTiming(row.key)">Remove</a-button>
          </div>
          <a-button type="dashed" block @click="addTiming">Add timing</a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="crewModalOpen"
      :title="editingCrew ? 'Edit driver / conductor' : 'Add driver / conductor'"
      :confirm-loading="crewSaving"
      @ok="saveCrew"
    >
      <a-form layout="vertical">
        <div class="crew-photo">
          <a-avatar :size="88" :src="crewForm.photoUrl || undefined">
            {{ initials(crewForm.name) }}
          </a-avatar>
          <a-upload
            v-if="auth.can('uploads.manage')"
            :show-upload-list="false"
            accept="image/*"
            :custom-request="uploadCrewPhoto"
          >
            <a-button size="small" style="margin-top: 8px">Upload photo</a-button>
          </a-upload>
          <a-button
            v-if="crewForm.photoUrl"
            type="link"
            danger
            size="small"
            @click="crewForm.photoUrl = ''"
          >
            Remove photo
          </a-button>
        </div>
        <a-form-item label="Role" required>
          <a-select v-model:value="crewForm.role" :options="roleOptions" />
        </a-form-item>
        <a-form-item label="Name" required>
          <a-input v-model:value="crewForm.name" placeholder="Full name" />
        </a-form-item>
        <a-form-item label="Phone number">
          <a-input v-model:value="crewForm.phone" placeholder="Mobile number" />
        </a-form-item>
        <a-form-item label="Assigned vehicle">
          <a-select
            v-model:value="crewForm.vehicleId"
            placeholder="Select bus / vehicle"
            allow-clear
            :options="vehicleOptions"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="dutyModalOpen"
      :title="editingDuty ? 'Edit duty' : 'Add duty'"
      :confirm-loading="dutySaving"
      :width="560"
      @ok="saveDuty"
    >
      <a-form layout="vertical">
        <a-form-item label="From date" required>
          <a-date-picker v-model:value="dutyForm.dateFrom" value-format="YYYY-MM-DD" style="width: 100%" />
        </a-form-item>
        <a-form-item label="To date">
          <a-date-picker
            v-model:value="dutyForm.dateTo"
            value-format="YYYY-MM-DD"
            placeholder="Leave empty if still current"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="Vehicle" required>
          <a-select v-model:value="dutyForm.vehicleId" :options="vehicleOptions" placeholder="Bus / van" />
        </a-form-item>
        <a-form-item label="Route" required>
          <a-auto-complete
            v-model:value="dutyForm.route"
            :options="timingRouteOptions"
            placeholder="Route 1"
          />
        </a-form-item>
        <a-form-item label="Time">
          <a-time-picker
            v-model:value="dutyForm.time"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="Trip time"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="Driver">
          <a-select v-model:value="dutyForm.driverId" :options="driverOptions" allow-clear placeholder="Driver" />
        </a-form-item>
        <a-form-item label="Conductor">
          <a-select
            v-model:value="dutyForm.conductorId"
            :options="conductorOptions"
            allow-clear
            placeholder="Conductor"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="reliefModalOpen"
      title="Record relief cover"
      :confirm-loading="reliefSaving"
      :width="520"
      @ok="saveRelief"
    >
      <p class="muted" style="margin-top: 0">
        Record who is covering the same bus and route. Use a leave reason when it is leave, or write a
        custom message for anything else (breakdown, late, extra trip, and so on).
      </p>
      <a-form layout="vertical">
        <a-form-item label="Who is being replaced" required>
          <a-select v-model:value="reliefForm.role" :options="roleOptions" @change="onReliefRoleChange" />
        </a-form-item>
        <a-form-item label="Rostered person">
          <a-input :value="reliefOriginalName" disabled />
        </a-form-item>
        <a-form-item label="Covering person" required>
          <a-select
            v-model:value="reliefForm.reliefId"
            :options="reliefCoverOptions"
            placeholder="Who will drive / conduct instead"
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
        <a-form-item label="From date" required>
          <a-date-picker v-model:value="reliefForm.dateFrom" value-format="YYYY-MM-DD" style="width: 100%" />
        </a-form-item>
        <a-form-item label="To date">
          <a-date-picker
            v-model:value="reliefForm.dateTo"
            value-format="YYYY-MM-DD"
            placeholder="Same day if empty"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="Reason">
          <a-select v-model:value="reliefForm.reason" :options="reliefReasonOptions" />
        </a-form-item>
        <a-form-item :label="reliefForm.reason === 'custom' ? 'Custom message' : 'Message'" :required="reliefForm.reason === 'custom'">
          <a-textarea
            v-model:value="reliefForm.notes"
            :rows="3"
            :placeholder="
              reliefForm.reason === 'custom'
                ? 'Required — e.g. bus breakdown, extra trip, covering for training'
                : 'Optional extra detail'
            "
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer v-model:open="historyOpen" :title="historyTitle" placement="right" :width="720" destroy-on-close>
      <p class="muted" style="margin-top: 0">{{ historyHint }}</p>
      <a-table
        size="small"
        :columns="historyColumns"
        :data-source="historyRows"
        :loading="historyLoading"
        row-key="_id"
        :pagination="{ pageSize: 6 }"
        :custom-row="historyRowProps"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'dates'">{{ formatDutyDates(record) }}</template>
          <template v-else-if="column.key === 'vehicle'">{{ record.vehicleId?.number || '-' }}</template>
          <template v-else-if="column.key === 'route'">
            {{ record.route }}
            <span v-if="record.time" class="muted"> · {{ record.time }}</span>
          </template>
          <template v-else-if="column.key === 'driver'">
            <div>{{ crewName(record.driverId) || '-' }}</div>
            <div v-for="rel in driverReliefs(record)" :key="rel._id" class="relief-note">
              {{ formatReliefNote(rel) }}
            </div>
          </template>
          <template v-else-if="column.key === 'conductor'">
            <div>{{ crewName(record.conductorId) || '-' }}</div>
            <div v-for="rel in conductorReliefs(record)" :key="rel._id" class="relief-note">
              {{ formatReliefNote(rel) }}
            </div>
          </template>
        </template>
      </a-table>

      <div v-if="historyKind === 'vehicle'" class="boarding-block">
        <div class="tab-toolbar">
          <div>
            <h3 class="boarding-title">Students on this bus</h3>
            <p class="muted">Who was on the route that day — onboard, absent, route change, or left school.</p>
          </div>
          <a-date-picker
            v-model:value="boardingDate"
            value-format="YYYY-MM-DD"
            @change="loadBoarding"
          />
        </div>
        <a-space wrap style="margin-bottom: 12px">
          <a-tag>Total {{ boardingSummary.total }}</a-tag>
          <a-tag color="green">Onboard {{ boardingSummary.onboard }}</a-tag>
          <a-tag color="orange">Not available {{ boardingSummary.notAvailable }}</a-tag>
          <a-tag color="blue">Route change {{ boardingSummary.routeChanged + boardingSummary.joined }}</a-tag>
          <a-tag color="red">Left school {{ boardingSummary.leftSchool }}</a-tag>
        </a-space>
        <a-table
          size="small"
          :columns="boardingColumns"
          :data-source="boardingStudents"
          :loading="boardingLoading"
          row-key="studentId"
          :pagination="{ pageSize: 8 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'student'">
              <div>{{ record.name }}</div>
              <div class="muted" style="font-size: 12px">{{ record.admissionNo }}</div>
            </template>
            <template v-else-if="column.key === 'boarding'">
              <a-tag :color="boardingColor(record.boarding)">{{ boardingLabel(record.boarding) }}</a-tag>
              <span v-if="record.attendance && record.boarding === 'not_available'" class="muted">
                · {{ record.attendance }}
              </span>
            </template>
          </template>
        </a-table>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const vehicles = ref<Record<string, any>[]>([]);
const crew = ref<Record<string, any>[]>([]);
const routes = ref<Record<string, any>[]>([]);
const duties = ref<Record<string, any>[]>([]);
const assignments = ref<Record<string, any>[]>([]);
const studentOptions = ref<{ label: string; value: string }[]>([]);
const route = reactive({ name: '', vehicleId: undefined as string | undefined });
const assignment = reactive({ studentId: '', routeId: '', stopName: '' });

const vehicleModalOpen = ref(false);
const vehicleSaving = ref(false);
const editingVehicle = ref<Record<string, any> | null>(null);
const vehicleForm = reactive({
  number: '',
  type: 'bus',
  routeNumber: '',
  capacity: 40,
  timings: [] as { key: string; time: string; route: string }[],
});

const crewModalOpen = ref(false);
const crewSaving = ref(false);
const editingCrew = ref<Record<string, any> | null>(null);
const crewForm = reactive({
  role: 'driver' as 'driver' | 'conductor',
  name: '',
  phone: '',
  photoUrl: '',
  vehicleId: undefined as string | undefined,
});

const dutyModalOpen = ref(false);
const dutySaving = ref(false);
const editingDuty = ref<Record<string, any> | null>(null);
const dutyForm = reactive({
  dateFrom: undefined as string | undefined,
  dateTo: undefined as string | undefined,
  vehicleId: undefined as string | undefined,
  route: '',
  time: undefined as string | undefined,
  driverId: undefined as string | undefined,
  conductorId: undefined as string | undefined,
});

const historyOpen = ref(false);
const historyLoading = ref(false);
const historyTitle = ref('History');
const historyHint = ref('');
const historyKind = ref<'vehicle' | 'driver' | 'conductor'>('vehicle');
const historyRows = ref<Record<string, any>[]>([]);
const historyVehicleId = ref('');
const boardingDate = ref(dayjs().format('YYYY-MM-DD'));
const boardingLoading = ref(false);
const boardingStudents = ref<Record<string, any>[]>([]);
const boardingSummary = reactive({
  total: 0,
  onboard: 0,
  notAvailable: 0,
  routeChanged: 0,
  leftSchool: 0,
  joined: 0,
});
const boardingColumns = [
  { title: 'Student', key: 'student' },
  { title: 'Stop', dataIndex: 'stopName' },
  { title: 'Route', dataIndex: 'routeName' },
  { title: 'That day', key: 'boarding' },
];

const reliefModalOpen = ref(false);
const reliefSaving = ref(false);
const reliefDuty = ref<Record<string, any> | null>(null);
const reliefForm = reactive({
  role: 'driver' as 'driver' | 'conductor',
  originalId: '' as string,
  reliefId: undefined as string | undefined,
  dateFrom: undefined as string | undefined,
  dateTo: undefined as string | undefined,
  reason: 'custom' as string,
  notes: '',
});

const vehicleTypeOptions = [
  { label: 'Bus', value: 'bus' },
  { label: 'Van', value: 'van' },
  { label: 'Other', value: 'other' },
];
const roleOptions = [
  { label: 'Driver', value: 'driver' },
  { label: 'Conductor', value: 'conductor' },
];
const reliefReasonOptions = [
  { label: 'Custom message', value: 'custom' },
  { label: 'Emergency leave', value: 'emergency_leave' },
  { label: 'Sick leave', value: 'sick' },
  { label: 'Personal leave', value: 'personal' },
  { label: 'Shift swap', value: 'shift_swap' },
  { label: 'Other', value: 'other' },
];

const vehicleColumns = [
  { title: 'Number', dataIndex: 'number' },
  { title: 'Type', dataIndex: 'type' },
  { title: 'Route no.', dataIndex: 'routeNumber' },
  { title: 'Timings', key: 'timings' },
  { title: 'Capacity', dataIndex: 'capacity' },
  { title: 'Driver', key: 'driver' },
  { title: 'Conductor', key: 'conductor' },
  { title: 'Actions', key: 'actions' },
];
const crewColumns = [
  { title: 'Photo', key: 'photo', width: 80 },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Role', key: 'role' },
  { title: 'Phone', dataIndex: 'phone' },
  { title: 'Vehicle', key: 'vehicle' },
  { title: 'Actions', key: 'actions' },
];
const dutyColumns = [
  { title: 'Dates', key: 'dates' },
  { title: 'Vehicle', key: 'vehicle' },
  { title: 'Route', key: 'route' },
  { title: 'Driver', key: 'driver' },
  { title: 'Conductor', key: 'conductor' },
  { title: 'Actions', key: 'actions' },
];

const vehicleOptions = computed(() =>
  vehicles.value.map((v) => ({
    label: v.routeNumber ? `${v.number} (Route ${v.routeNumber})` : v.number,
    value: v._id,
  }))
);
const routeOptions = computed(() => routes.value.map((r) => ({ label: r.name, value: r._id })));
const driverOptions = computed(() =>
  crew.value.filter((c) => c.role === 'driver').map((c) => ({ label: c.name, value: c._id }))
);
const conductorOptions = computed(() =>
  crew.value.filter((c) => c.role === 'conductor').map((c) => ({ label: c.name, value: c._id }))
);
const reliefOriginalName = computed(() => crewNameById(reliefForm.originalId) || '—');
const reliefCoverOptions = computed(() => {
  const list = reliefForm.role === 'conductor' ? conductorOptions.value : driverOptions.value;
  return list.filter((o) => o.value !== reliefForm.originalId);
});
const historyColumns = computed(() => {
  const dates = { title: 'Dates', key: 'dates' };
  const vehicle = { title: 'Bus / van', key: 'vehicle' };
  const route = { title: 'Route', key: 'route' };
  const driver = { title: 'Driver', key: 'driver' };
  const conductor = { title: 'Conductor', key: 'conductor' };
  if (historyKind.value === 'vehicle') return [dates, route, driver, conductor];
  if (historyKind.value === 'driver') return [dates, vehicle, route, conductor];
  return [dates, vehicle, route, driver];
});
const timingRouteOptions = computed(() => {
  const seen = new Set<string>();
  const opts: { label: string; value: string }[] = [];
  for (const v of vehicles.value) {
    const n = String(v.routeNumber || '').trim();
    if (!n) continue;
    const value = n.toLowerCase().startsWith('route') ? n : `Route ${n}`;
    if (seen.has(value)) continue;
    seen.add(value);
    opts.push({ label: value, value });
  }
  for (const r of routes.value) {
    if (!r.name || seen.has(r.name)) continue;
    seen.add(r.name);
    opts.push({ label: r.name, value: r.name });
  }
  return opts;
});

let timingSeq = 0;
function emptyTiming(time = '', route = '') {
  timingSeq += 1;
  return { key: `t-${timingSeq}`, time, route };
}

function sortedTimings(list: { time?: string; route?: string; routeId?: { name?: string }; _id?: string }[]) {
  return [...(list || [])].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

function formatDutyDates(record: { dateFrom?: string; dateTo?: string }) {
  const from = record.dateFrom ? dayjs(record.dateFrom).format('DD MMM YYYY') : '-';
  if (!record.dateTo) return `${from} → present`;
  return `${from} → ${dayjs(record.dateTo).format('DD MMM YYYY')}`;
}

function resolveRouteId(label: string) {
  const name = label.trim();
  const exact = routes.value.find((r) => r.name === name);
  return exact?._id as string | undefined;
}

function crewName(value: unknown) {
  if (value && typeof value === 'object' && 'name' in value) return String((value as { name?: string }).name || '');
  return '';
}

function crewNameById(id?: string) {
  if (!id) return '';
  const hit = crew.value.find((c) => c._id === id);
  return hit?.name || '';
}

function driverReliefs(record: Record<string, any>) {
  return (record.reliefs || []).filter((r: { role?: string }) => r.role === 'driver');
}

function conductorReliefs(record: Record<string, any>) {
  return (record.reliefs || []).filter((r: { role?: string }) => r.role === 'conductor');
}

function boardingLabel(key: string) {
  if (key === 'onboard') return 'Onboard';
  if (key === 'joined') return 'Joined this route';
  if (key === 'not_available') return 'Not available';
  if (key === 'route_changed') return 'Changed route';
  if (key === 'left_school') return 'Left school';
  return key;
}

function boardingColor(key: string) {
  if (key === 'onboard') return 'green';
  if (key === 'joined') return 'cyan';
  if (key === 'not_available') return 'orange';
  if (key === 'route_changed') return 'blue';
  if (key === 'left_school') return 'red';
  return 'default';
}

function historyRowProps(record: Record<string, any>) {
  if (historyKind.value !== 'vehicle') return {};
  return {
    style: { cursor: 'pointer' },
    onClick: () => {
      const today = dayjs().format('YYYY-MM-DD');
      const from = record.dateFrom || today;
      const to = record.dateTo || today;
      boardingDate.value = today >= from && today <= to ? today : from;
      loadBoarding();
    },
  };
}

async function loadBoarding() {
  if (!historyVehicleId.value || !boardingDate.value) return;
  boardingLoading.value = true;
  try {
    const { data } = await api.get(`/transport/vehicles/${historyVehicleId.value}/boarding`, {
      params: { date: boardingDate.value },
    });
    boardingStudents.value = data.data.students || [];
    Object.assign(boardingSummary, {
      total: 0,
      onboard: 0,
      notAvailable: 0,
      routeChanged: 0,
      leftSchool: 0,
      joined: 0,
      ...(data.data.summary || {}),
    });
  } finally {
    boardingLoading.value = false;
  }
}

function formatReliefNote(rel: Record<string, any>) {
  const cover = crewName(rel.reliefId) || 'Relief';
  const from = rel.dateFrom ? dayjs(rel.dateFrom).format('DD MMM') : '';
  const to = rel.dateTo ? dayjs(rel.dateTo).format('DD MMM') : from;
  const when = from && to && from !== to ? `${from}–${to}` : from || to;
  const msg = String(rel.notes || '').trim();
  if (msg) return `${when}: ${cover} — ${msg}`;
  const reason = reliefReasonOptions.find((o) => o.value === rel.reason)?.label || 'Cover';
  return `${when}: ${cover} (${reason})`;
}

function initials(name?: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

async function load(_opts?: { silent?: boolean }) {
  const [v, c, r, d, a] = await Promise.all([
    api.get('/transport/vehicles'),
    api.get('/transport/crew'),
    api.get('/transport/routes'),
    api.get('/transport/duties'),
    api.get('/transport/assignments'),
  ]);
  vehicles.value = v.data.data;
  crew.value = c.data.data;
  routes.value = r.data.data;
  duties.value = d.data.data;
  assignments.value = a.data.data;
}

async function searchStudents(q: string) {
  const { data } = await api.get('/students', { params: { q, limit: 20 } });
  studentOptions.value = data.data.map((s: any) => ({
    label: `${s.admissionNo} — ${s.firstName}`,
    value: s._id,
  }));
}

function resetVehicleForm() {
  Object.assign(vehicleForm, { number: '', type: 'bus', routeNumber: '', capacity: 40 });
  vehicleForm.timings = [emptyTiming()];
}

function openVehicleCreate() {
  editingVehicle.value = null;
  resetVehicleForm();
  vehicleModalOpen.value = true;
}

function openVehicleEdit(record: Record<string, any>) {
  editingVehicle.value = record;
  Object.assign(vehicleForm, {
    number: record.number || '',
    type: record.type || 'bus',
    routeNumber: record.routeNumber || '',
    capacity: Number(record.capacity) || 40,
  });
  const slots = Array.isArray(record.timings) ? record.timings : [];
  vehicleForm.timings = slots.length
    ? slots.map((t: { time?: string; route?: string; routeId?: { name?: string } }) =>
        emptyTiming(t.time || '', t.route || t.routeId?.name || '')
      )
    : [emptyTiming()];
  vehicleModalOpen.value = true;
}

function addTiming() {
  vehicleForm.timings.push(emptyTiming());
}

function removeTiming(key: string) {
  vehicleForm.timings = vehicleForm.timings.filter((row) => row.key !== key);
  if (!vehicleForm.timings.length) vehicleForm.timings.push(emptyTiming());
}

async function saveVehicle() {
  if (!vehicleForm.number.trim()) {
    message.warning('Enter a vehicle number');
    return Promise.reject();
  }
  const timings = vehicleForm.timings
    .map((row) => ({
      time: (row.time || '').trim(),
      route: (row.route || '').trim(),
      routeId: resolveRouteId(row.route || '') || undefined,
    }))
    .filter((row) => row.time && row.route)
    .sort((a, b) => a.time.localeCompare(b.time));
  const incomplete = vehicleForm.timings.some((row) => Boolean((row.time || '').trim()) !== Boolean((row.route || '').trim()));
  if (incomplete) {
    message.warning('Each timing needs both a time and a route');
    return Promise.reject();
  }
  vehicleSaving.value = true;
  try {
    const payload = {
      number: vehicleForm.number.trim(),
      type: vehicleForm.type,
      routeNumber: vehicleForm.routeNumber.trim(),
      capacity: vehicleForm.capacity || 40,
      timings,
    };
    if (editingVehicle.value) {
      await api.patch(`/transport/vehicles/${editingVehicle.value._id}`, payload);
      message.success('Vehicle updated');
    } else {
      await api.post('/transport/vehicles', payload);
      message.success('Vehicle added');
    }
    vehicleModalOpen.value = false;
    await load({ silent: true });
  } catch (err) {
    return Promise.reject(err);
  } finally {
    vehicleSaving.value = false;
  }
}

async function removeVehicle(id: string) {
  await api.delete(`/transport/vehicles/${id}`);
  message.success('Vehicle deleted');
  await load({ silent: true });
}

function resetCrewForm(role: 'driver' | 'conductor' = 'driver') {
  Object.assign(crewForm, {
    role,
    name: '',
    phone: '',
    photoUrl: '',
    vehicleId: undefined,
  });
}

function openCrewCreate(role: 'driver' | 'conductor') {
  editingCrew.value = null;
  resetCrewForm(role);
  crewModalOpen.value = true;
}

function openCrewEdit(record: Record<string, any>) {
  editingCrew.value = record;
  Object.assign(crewForm, {
    role: record.role === 'conductor' ? 'conductor' : 'driver',
    name: record.name || '',
    phone: record.phone || '',
    photoUrl: record.photoUrl || '',
    vehicleId: record.vehicleId?._id || record.vehicleId || undefined,
  });
  crewModalOpen.value = true;
}

async function uploadCrewPhoto(options: {
  file: File;
  onSuccess?: (b: unknown) => void;
  onError?: (e: Error) => void;
}) {
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const { data } = await api.post('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    crewForm.photoUrl = data.data.url;
    message.success('Photo ready');
    options.onSuccess?.(data);
  } catch (e) {
    options.onError?.(e as Error);
    message.error('Photo upload failed');
  }
}

async function saveCrew() {
  if (!crewForm.name.trim()) {
    message.warning('Enter a name');
    return;
  }
  crewSaving.value = true;
  try {
    const payload = {
      role: crewForm.role,
      name: crewForm.name.trim(),
      phone: crewForm.phone.trim() || undefined,
      photoUrl: crewForm.photoUrl || undefined,
      vehicleId: crewForm.vehicleId || null,
    };
    if (editingCrew.value) {
      await api.patch(`/transport/crew/${editingCrew.value._id}`, payload);
      message.success(crewForm.role === 'conductor' ? 'Conductor updated' : 'Driver updated');
    } else {
      await api.post('/transport/crew', payload);
      message.success(crewForm.role === 'conductor' ? 'Conductor added' : 'Driver added');
    }
    crewModalOpen.value = false;
    await load({ silent: true });
  } finally {
    crewSaving.value = false;
  }
}

async function removeCrew(id: string) {
  await api.delete(`/transport/crew/${id}`);
  message.success('Removed');
  await load({ silent: true });
}

function resetDutyForm() {
  Object.assign(dutyForm, {
    dateFrom: dayjs().format('YYYY-MM-DD'),
    dateTo: undefined,
    vehicleId: undefined,
    route: '',
    time: undefined,
    driverId: undefined,
    conductorId: undefined,
  });
}

function openDutyCreate() {
  editingDuty.value = null;
  resetDutyForm();
  dutyModalOpen.value = true;
}

function openDutyEdit(record: Record<string, any>) {
  editingDuty.value = record;
  Object.assign(dutyForm, {
    dateFrom: record.dateFrom || undefined,
    dateTo: record.dateTo || undefined,
    vehicleId: record.vehicleId?._id || record.vehicleId || undefined,
    route: record.route || record.routeId?.name || '',
    time: record.time || undefined,
    driverId: record.driverId?._id || record.driverId || undefined,
    conductorId: record.conductorId?._id || record.conductorId || undefined,
  });
  dutyModalOpen.value = true;
}

async function saveDuty() {
  if (!dutyForm.dateFrom || !dutyForm.vehicleId || !dutyForm.route.trim()) {
    message.warning('Date, vehicle, and route are required');
    return Promise.reject();
  }
  dutySaving.value = true;
  try {
    const payload = {
      dateFrom: dutyForm.dateFrom,
      dateTo: dutyForm.dateTo || '',
      vehicleId: dutyForm.vehicleId,
      route: dutyForm.route.trim(),
      routeId: resolveRouteId(dutyForm.route) || null,
      time: dutyForm.time || undefined,
      driverId: dutyForm.driverId || null,
      conductorId: dutyForm.conductorId || null,
    };
    if (editingDuty.value) {
      await api.patch(`/transport/duties/${editingDuty.value._id}`, payload);
      message.success('Duty updated');
    } else {
      await api.post('/transport/duties', payload);
      message.success('Duty added');
    }
    dutyModalOpen.value = false;
    await load({ silent: true });
  } catch (err) {
    return Promise.reject(err);
  } finally {
    dutySaving.value = false;
  }
}

async function removeDuty(id: string) {
  await api.delete(`/transport/duties/${id}`);
  message.success('Duty deleted');
  await load({ silent: true });
}

function onReliefRoleChange() {
  if (!reliefDuty.value) return;
  reliefForm.originalId =
    reliefForm.role === 'conductor'
      ? reliefDuty.value.conductorId?._id || reliefDuty.value.conductorId || ''
      : reliefDuty.value.driverId?._id || reliefDuty.value.driverId || '';
  reliefForm.reliefId = undefined;
}

function openRelief(record: Record<string, any>) {
  reliefDuty.value = record;
  const hasDriver = Boolean(record.driverId);
  reliefForm.role = hasDriver ? 'driver' : 'conductor';
  reliefForm.originalId =
    reliefForm.role === 'conductor'
      ? record.conductorId?._id || record.conductorId || ''
      : record.driverId?._id || record.driverId || '';
  reliefForm.reliefId = undefined;
  reliefForm.dateFrom = dayjs().format('YYYY-MM-DD');
  reliefForm.dateTo = dayjs().format('YYYY-MM-DD');
  reliefForm.reason = 'custom';
  reliefForm.notes = '';
  if (!reliefForm.originalId) {
    message.warning('This duty has no rostered driver or conductor to replace');
    return;
  }
  reliefModalOpen.value = true;
}

async function saveRelief() {
  if (!reliefDuty.value || !reliefForm.originalId || !reliefForm.reliefId || !reliefForm.dateFrom) {
    message.warning('Pick the covering person and dates');
    return Promise.reject();
  }
  if ((reliefForm.reason === 'custom' || reliefForm.reason === 'other') && !reliefForm.notes.trim()) {
    message.warning('Enter a custom message');
    return Promise.reject();
  }
  reliefSaving.value = true;
  try {
    await api.post('/transport/reliefs', {
      dutyId: reliefDuty.value._id,
      role: reliefForm.role,
      originalId: reliefForm.originalId,
      reliefId: reliefForm.reliefId,
      dateFrom: reliefForm.dateFrom,
      dateTo: reliefForm.dateTo || reliefForm.dateFrom,
      reason: reliefForm.reason,
      notes: reliefForm.notes.trim() || undefined,
    });
    message.success('Relief cover recorded');
    reliefModalOpen.value = false;
    await load({ silent: true });
  } catch (err) {
    return Promise.reject(err);
  } finally {
    reliefSaving.value = false;
  }
}

async function openHistory(kind: 'vehicle' | 'driver' | 'conductor', record: Record<string, any>) {
  historyKind.value = kind;
  historyOpen.value = true;
  historyLoading.value = true;
  historyRows.value = [];
  if (kind === 'vehicle') {
    historyTitle.value = `Bus history · ${record.number}`;
    historyHint.value = 'Click a duty row or pick a date to see who boarded that day.';
    historyVehicleId.value = record._id;
    boardingDate.value = dayjs().format('YYYY-MM-DD');
  } else if (kind === 'driver') {
    historyTitle.value = `Driver history · ${record.name}`;
    historyHint.value = 'Regular duties, emergency cover, and leave days when someone else drove.';
    historyVehicleId.value = '';
  } else {
    historyTitle.value = `Conductor history · ${record.name}`;
    historyHint.value = 'Regular duties, cover days, and leave days when someone else conducted.';
    historyVehicleId.value = '';
  }
  try {
    const params =
      kind === 'vehicle'
        ? { vehicleId: record._id }
        : kind === 'driver'
          ? { driverId: record._id }
          : { conductorId: record._id };
    const { data } = await api.get('/transport/duties', { params });
    historyRows.value = data.data;
    if (kind === 'vehicle') await loadBoarding();
  } finally {
    historyLoading.value = false;
  }
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
  await load({ silent: true });
}

async function assign() {
  await api.post('/transport/assignments', assignment);
  message.success('Student assigned');
  Object.assign(assignment, { studentId: '', routeId: '', stopName: '' });
  await load({ silent: true });
}

onMounted(load);
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.tab-toolbar p {
  margin: 0;
}
.muted {
  color: #888;
}
.crew-photo {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 12px;
}
.timing-hint {
  margin: 0 0 8px;
  font-size: 12px;
}
.timing-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.timing-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.relief-note {
  font-size: 12px;
  color: #d46b08;
  line-height: 1.3;
}
.boarding-block {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
.boarding-title {
  margin: 0 0 4px;
  font-size: 15px;
}
</style>
