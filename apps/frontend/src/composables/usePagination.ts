import { ref, onMounted, onUnmounted } from 'vue'

export interface PaginationState<T extends Record<string, unknown>> {
  items: T[]
  loading: boolean
  searchQuery: string
  currentPage: number
  pageSize: number
  totalPages: number
  totalCount: number
  formError: string
}

interface PaginatedResult<T> {
  data: T[]
  pagination: { totalPages?: number; totalCount?: number; totalItems?: number }
}

export function usePagination<T extends Record<string, unknown>>(fetchFn: (params: { page: number; limit: number; search?: string }) => Promise<PaginatedResult<T>>) {
  const items = ref<T[]>([]) as ReturnType<typeof ref<T[]>>
  const loading = ref(false)
  const searchQuery = ref('')
  const currentPage = ref(1)
  const pageSize = ref(25)
  const totalPages = ref(0)
  const totalCount = ref(0)
  const formError = ref('')

  let searchTimeout: ReturnType<typeof setTimeout> | null = null

  async function fetch() {
    loading.value = true
    try {
      const result = await fetchFn({
        page: currentPage.value,
        limit: pageSize.value,
        search: searchQuery.value || undefined
      })
      items.value = result.data
      totalPages.value = result.pagination.totalPages ?? Math.ceil((result.pagination.totalItems ?? 0) / pageSize.value)
      totalCount.value = result.pagination.totalCount ?? result.pagination.totalItems ?? 0
    } catch {
      formError.value = 'Failed to load data'
    } finally {
      loading.value = false
    }
  }

  function handleSearch() { currentPage.value = 1; fetch() }

  function onSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => handleSearch(), 300)
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) { currentPage.value = page; fetch() }
  }

  onMounted(fetch)
  onUnmounted(() => { if (searchTimeout) clearTimeout(searchTimeout) })

  return { items, loading, searchQuery, currentPage, pageSize, totalPages, totalCount, formError, fetch, handleSearch, onSearchInput, goToPage }
}
