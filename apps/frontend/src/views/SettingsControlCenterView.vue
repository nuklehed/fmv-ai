<script setup lang="ts">
import SettingsView from './SettingsView.vue'
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <!-- GitHub-style narrow sidebar -->
    <aside class="w-64 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
      <div class="p-4">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Settings</h3>
        <nav class="space-y-0.5">
          <button class="w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md bg-blue-50 text-blue-700 font-medium transition-colors">
            <i class="pi pi-bell w-4 h-4" />
            <span>Notification Settings</span>
          </button>
        </nav>
      </div>
    </aside>

    <!-- Main content area -->
    <main class="flex-1 p-8 bg-gray-50">
      <SettingsView />
    </main>
  </div>
</template>
