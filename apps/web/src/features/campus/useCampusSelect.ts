import { computed } from 'vue';
import { useCampusStore } from '@/stores/campus';

/** Shared All-branches / campus dropdown options. */
export function useCampusSelect() {
  const campus = useCampusStore();
  const options = computed(() => [
    { label: 'All branches', value: 'all' },
    ...campus.campuses.map((c) => ({
      label: c.isPrimary ? `${c.name} (Head office)` : c.name,
      value: c._id,
    })),
  ]);
  return { campus, options };
}
