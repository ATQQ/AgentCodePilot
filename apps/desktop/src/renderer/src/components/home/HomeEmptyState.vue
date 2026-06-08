<template>
  <div class="empty-state">
    <h1 class="empty-title">What should we work on?</h1>
    <p class="empty-subtitle">Start a conversation with an AI coding agent</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--content-text);
}

.empty-subtitle {
  font-size: var(--font-size-lg);
  color: var(--content-text-secondary);
}
</style>
