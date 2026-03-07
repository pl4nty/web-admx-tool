import { useAdmx } from './useAdmx'

const query = ref('')
const { allPolicies, policies, scope } = useAdmx()

const searchResults = computed(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return []
    return allPolicies.value.filter(
        p =>
            p.scope === scope.value &&
            (p.display?.toLowerCase().includes(q) ||
                p.explain?.toLowerCase().includes(q) ||
                p.name?.toLowerCase().includes(q) ||
                p.file?.toLowerCase().includes(q))
    )
})

export function useSearch() {
    return {
        query,
        searchResults
    }
}
