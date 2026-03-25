<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { policyUrl } from '../policyUrl'

const props = defineProps({
  node: Object,
  lang: { type: String, default: 'en-us' },
  activeTarget: { type: String, default: '' }
})
const emit = defineEmits(['navigate'])
const router = useRouter()
const expanded = ref(false)

function toggleExpand() { expanded.value = !expanded.value }

function policyHref(policy) {
  return policyUrl(policy?.namespace, policy?.policyName, policy?.availableLangs, props.lang)
}

function onPolicyClick(e, policy) {
  e.preventDefault()
  const ns = policy?.namespace
  const name = policy?.policyName
  if (ns && name) sessionStorage.setItem('admx:expand-target', `${ns}::${name}`)
  emit('navigate')
  router.push(policyHref(policy))
}

function nodeContainsTarget(node, target) {
  if (!node || !target) return false
  const [targetNs, targetPolicy] = String(target).split('::')
  const policyMatch = (node.policies || []).some((pol) => pol.namespace === targetNs && pol.policyName === targetPolicy)
  if (policyMatch) return true
  return (node.children || []).some((child) => nodeContainsTarget(child, target))
}

function autoExpandFromTarget() {
  if (!props.activeTarget) return
  if (nodeContainsTarget(props.node, props.activeTarget)) {
    expanded.value = true
  }
}

onMounted(autoExpandFromTarget)
watch(() => props.activeTarget, autoExpandFromTarget)
</script>

<template>
  <li class="select-none">
    <!-- Category header -->
    <div @click="toggleExpand" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
      <svg :class="['w-3.5 h-3.5 text-gray-500 transition-transform shrink-0', expanded ? 'rotate-90' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
      <svg class="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>
      <span class="truncate font-medium text-gray-700 dark:text-gray-300">{{ node.displayName || node.name }}</span>
      <span class="ml-auto text-xs text-gray-400 shrink-0">{{ node.policyCount }}</span>
    </div>

    <!-- Expanded contents -->
    <ul v-if="expanded" class="ml-4 border-l border-gray-200 dark:border-gray-600">
      <!-- Policies in this category -->
      <li v-for="pol in node.policies" :key="pol.name">
        <a :href="policyHref(pol)" @click="onPolicyClick($event, pol)"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm cursor-pointer">
          <svg class="w-3.5 h-3.5 shrink-0" :class="pol.class === 'Machine' ? 'text-blue-500' : pol.class === 'User' ? 'text-green-600' : 'text-purple-500'" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
          </svg>
          <span class="truncate text-gray-600 dark:text-gray-400">{{ pol.displayName || pol.name }}</span>
        </a>
      </li>
      <!-- Child categories -->
      <TreeNode v-for="child in node.children" :key="child.id" :node="child" :lang="lang" :activeTarget="activeTarget" @navigate="emit('navigate')" />
    </ul>
  </li>
</template>
