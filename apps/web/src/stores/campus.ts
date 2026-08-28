import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/lib/api';

/** Global selected campus. UI for this feature lives under `src/features/campus/`. */

export type CampusOption = {
  _id: string;
  name: string;
  code: string;
  schoolCode?: string;
  isPrimary?: boolean;
};

const STORAGE_KEY = 'anyit.selectedCampusId';

export const useCampusStore = defineStore('campus', () => {
  const campuses = ref<CampusOption[]>([]);
  const selectedId = ref<string>(localStorage.getItem(STORAGE_KEY) || 'all');
  const loaded = ref(false);

  const selectedCampus = computed(() => campuses.value.find((c) => c._id === selectedId.value) || null);
  const isAll = computed(() => !selectedId.value || selectedId.value === 'all');
  const queryCampusId = computed(() => (isAll.value ? undefined : selectedId.value));
  const label = computed(() => {
    if (isAll.value) return 'All branches';
    return selectedCampus.value?.name || 'Branch';
  });

  function setSelected(id: string) {
    selectedId.value = id || 'all';
    localStorage.setItem(STORAGE_KEY, selectedId.value);
  }

  async function load() {
    try {
      const { data } = await api.get('/campuses');
      campuses.value = data.data || [];
      if (selectedId.value !== 'all' && !campuses.value.some((c) => c._id === selectedId.value)) {
        setSelected('all');
      }
    } catch {
      campuses.value = [];
    } finally {
      loaded.value = true;
    }
  }

  return {
    campuses,
    selectedId,
    selectedCampus,
    isAll,
    queryCampusId,
    label,
    loaded,
    setSelected,
    load,
  };
});
