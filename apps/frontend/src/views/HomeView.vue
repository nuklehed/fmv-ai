<script setup lang="ts">
import { ref } from 'vue'

const searchQuery = ref('')
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-900">FMV AI Platform</h1>
        <nav class="flex space-x-4">
          <a href="/" class="text-sm font-medium text-blue-600">Dashboard</a>
          <!-- TODO: Show specialties link only for SAs (issue #5) -->
          <a href="/specialties" class="text-sm text-gray-600 hover:text-gray-900">Specialties</a>
          <a href="#" class="text-sm text-gray-600 hover:text-gray-900">Settings</a>
        </nav>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-2">HCP Directory</h2>
        <p class="text-sm text-gray-600">Search and manage healthcare professionals</p>
      </div>

      <!-- Search Bar -->
      <div class="mb-6">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, NPI, or state..."
          class="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Placeholder Table -->
      <div class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NPI</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr>
              <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
                No data loaded yet — API integration pending
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
