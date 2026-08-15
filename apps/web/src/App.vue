<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#0f5c4c',
        borderRadius: 8,
        fontFamily: `'DM Sans', system-ui, sans-serif`,
      },
    }"
  >
    <RouterView />
  </a-config-provider>
</template>

<script setup lang="ts"></script>
