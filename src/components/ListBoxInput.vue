<template>
    <div>
        <table class="table table-sm table-bordered mb-2" v-if="modelValue?.length > 0">
            <thead class="table-light">
                <tr>
                    <th v-if="explicitValue">Value name</th>
                    <th>Value</th>
                    <th style="width: 80px">Action</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(item, idx) in modelValue" :key="idx">
                    <td v-if="explicitValue">
                        <template v-if="editIdx === idx">
                            <input v-model="editName" class="form-control form-control-sm" :disabled="disabled" />
                        </template>
                        <template v-else>{{ item.valueName }}</template>
                    </td>
                    <td>
                        <template v-if="editIdx === idx">
                            <input v-model="editVal" class="form-control form-control-sm" :disabled="disabled" />
                        </template>
                        <template v-else>{{ item.value }}</template>
                    </td>
                    <td>
                        <template v-if="editIdx === idx">
                            <button class="btn btn-sm btn-success py-0 px-1" @click="commitEdit(idx)" :disabled="disabled">
                                <i class="bi bi-check"></i>
                            </button>
                        </template>
                        <template v-else>
                            <button class="btn btn-sm btn-outline-primary py-0 px-1 me-1" @click="startEdit(idx)" :disabled="disabled">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-1" @click="remove(idx)" :disabled="disabled">
                                <i class="bi bi-trash"></i>
                            </button>
                        </template>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Add row -->
        <div class="d-flex gap-2 align-items-center">
            <input
                v-if="explicitValue"
                v-model="newName"
                class="form-control form-control-sm"
                placeholder="Value name"
                :disabled="disabled"
                style="max-width: 160px"
            />
            <input
                v-model="newVal"
                class="form-control form-control-sm"
                placeholder="Value"
                :disabled="disabled"
                style="max-width: 200px"
            />
            <button class="btn btn-sm btn-outline-success" @click="add" :disabled="disabled || !newVal">
                <i class="bi bi-plus-lg me-1"></i>Add
            </button>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    disabled: { type: Boolean, default: false },
    explicitValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const newVal = ref('')
const newName = ref('')
const editIdx = ref(null)
const editVal = ref('')
const editName = ref('')

function add() {
    if (!newVal.value) return
    const entry = props.explicitValue
        ? { valueName: newName.value, value: newVal.value }
        : { value: newVal.value }
    emit('update:modelValue', [...(props.modelValue ?? []), entry])
    newVal.value = ''
    newName.value = ''
}

function remove(idx) {
    const updated = (props.modelValue ?? []).filter((_, i) => i !== idx)
    emit('update:modelValue', updated)
}

function startEdit(idx) {
    editIdx.value = idx
    editVal.value = props.modelValue[idx].value
    editName.value = props.modelValue[idx].valueName ?? ''
}

function commitEdit(idx) {
    const updated = [...(props.modelValue ?? [])]
    updated[idx] = props.explicitValue
        ? { valueName: editName.value, value: editVal.value }
        : { value: editVal.value }
    emit('update:modelValue', updated)
    editIdx.value = null
}
</script>
