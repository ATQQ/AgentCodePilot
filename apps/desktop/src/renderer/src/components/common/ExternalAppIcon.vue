<script setup lang="ts">
import { computed } from 'vue'
import {
  getExternalAppIcon,
  isMonochromeExternalAppIcon,
  needsInsetExternalAppIcon
} from '@renderer/utils/externalAppIcons'

const props = withDefaults(
  defineProps<{
    appId: string
    size?: number
  }>(),
  {
    size: 18
  }
)

const src = computed(() => getExternalAppIcon(props.appId))
const isMono = computed(() => isMonochromeExternalAppIcon(props.appId))
const isInset = computed(() => needsInsetExternalAppIcon(props.appId))
const wrapStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))
</script>

<template>
  <span
    class="external-app-icon-wrap"
    :class="{ 'external-app-icon-wrap--inset': isInset }"
    :style="wrapStyle"
  >
    <img
      :src="src"
      class="external-app-icon"
      :class="{ 'external-app-icon--mono': isMono }"
      alt=""
    />
  </span>
</template>
