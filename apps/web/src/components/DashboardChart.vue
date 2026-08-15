<template>
  <div ref="el" class="chart-host" :style="{ height }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DatasetComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DatasetComponent,
  CanvasRenderer,
]);

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption | null;
    height?: string;
  }>(),
  { height: '280px' }
);

const el = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function render() {
  if (!el.value || !props.option) return;
  if (!chart) {
    chart = echarts.init(el.value, undefined, { renderer: 'canvas' });
  }
  chart.setOption(props.option, { notMerge: true, lazyUpdate: false });
}

onMounted(() => {
  render();
  if (el.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(el.value);
  }
});

watch(
  () => props.option,
  () => render(),
  { deep: true }
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.chart-host {
  width: 100%;
  min-height: 200px;
}
</style>
