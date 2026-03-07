<template>
    <div>
        <!-- Enabled / Disabled / Not configured -->
        <div class="mb-3">
            <label class="form-label fw-semibold">Status</label>
            <div class="d-flex gap-3">
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="radio"
                        id="status-nc"
                        :value="null"
                        v-model="curConfig.enabled"
                    />
                    <label class="form-check-label" for="status-nc">Not configured</label>
                </div>
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="radio"
                        id="status-enabled"
                        :value="true"
                        v-model="curConfig.enabled"
                    />
                    <label class="form-check-label" for="status-enabled">Enabled</label>
                </div>
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="radio"
                        id="status-disabled"
                        :value="false"
                        v-model="curConfig.enabled"
                    />
                    <label class="form-check-label" for="status-disabled">Disabled</label>
                </div>
            </div>
        </div>

        <!-- Comment -->
        <div class="mb-3">
            <label for="policy-comment" class="form-label fw-semibold">Comment</label>
            <textarea
                id="policy-comment"
                class="form-control form-control-sm"
                rows="2"
                v-model="curConfig.comment"
                :disabled="disabled"
            ></textarea>
        </div>

        <!-- Presentation components -->
        <template v-if="parsedPolicy && parsedPolicy.components.length > 0">
            <hr />
            <template v-for="comp in parsedPolicy.components" :key="comp.prop ?? comp.val">
                <!-- Static text -->
                <template v-if="comp.type === 'text'">
                    <p class="text-muted small mb-2">{{ comp.val }}</p>
                </template>

                <!-- Dropdown -->
                <template v-else-if="comp.type === 'dropdown'">
                    <div class="mb-3">
                        <label class="form-label">{{ comp.label }}</label>
                        <select
                            class="form-select form-select-sm"
                            v-model="curConfig.config[comp.prop]"
                            :disabled="disabled"
                        >
                            <option :value="null">— Select —</option>
                            <option v-for="opt in comp.options" :key="opt.val" :value="opt.val">
                                {{ opt.label }}
                            </option>
                        </select>
                    </div>
                </template>

                <!-- Checkbox -->
                <template v-else-if="comp.type === 'checkbox'">
                    <div class="mb-3 form-check">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            :id="`comp-${comp.prop}`"
                            v-model="curConfig.config[comp.prop]"
                            :disabled="disabled"
                        />
                        <label class="form-check-label" :for="`comp-${comp.prop}`">
                            {{ comp.label }}
                        </label>
                    </div>
                </template>

                <!-- Textbox -->
                <template v-else-if="comp.type === 'textbox'">
                    <div class="mb-3">
                        <label class="form-label">{{ comp.label }}</label>
                        <input
                            class="form-control form-control-sm"
                            type="text"
                            v-model="curConfig.config[comp.prop]"
                            :disabled="disabled"
                        />
                    </div>
                </template>

                <!-- Multi-line textbox -->
                <template v-else-if="comp.type === 'multitextbox'">
                    <div class="mb-3">
                        <label class="form-label">{{ comp.label }}</label>
                        <textarea
                            class="form-control form-control-sm"
                            rows="3"
                            v-model="curConfig.config[comp.prop]"
                            :disabled="disabled"
                            placeholder="One value per line"
                        ></textarea>
                    </div>
                </template>

                <!-- Decimal -->
                <template v-else-if="comp.type === 'decimal'">
                    <div class="mb-3">
                        <label class="form-label">{{ comp.label }}</label>
                        <div class="input-group input-group-sm" style="max-width: 200px">
                            <button
                                class="btn btn-outline-secondary"
                                type="button"
                                :disabled="disabled || curConfig.config[comp.prop] <= comp.attrs.minValue"
                                @click="decrementDecimal(comp)"
                            >
                                <i class="bi bi-dash"></i>
                            </button>
                            <input
                                class="form-control text-center"
                                type="number"
                                v-model.number="curConfig.config[comp.prop]"
                                :min="comp.attrs.minValue"
                                :max="comp.attrs.maxValue"
                                :step="comp.attrs.spinStep"
                                :disabled="disabled"
                            />
                            <button
                                class="btn btn-outline-secondary"
                                type="button"
                                :disabled="disabled || curConfig.config[comp.prop] >= comp.attrs.maxValue"
                                @click="incrementDecimal(comp)"
                            >
                                <i class="bi bi-plus"></i>
                            </button>
                        </div>
                        <div class="form-text">
                            Range: {{ comp.attrs.minValue }} – {{ comp.attrs.maxValue }}
                        </div>
                    </div>
                </template>

                <!-- List -->
                <template v-else-if="comp.type === 'list'">
                    <div class="mb-3">
                        <label class="form-label">{{ comp.label }}</label>
                        <ListBoxInput
                            v-model="curConfig.config[comp.prop]"
                            :disabled="disabled"
                            :explicit-value="comp.attrs.explicitValue"
                        />
                    </div>
                </template>
            </template>
        </template>

        <!-- Validation errors -->
        <template v-if="errorMsgs.length > 0">
            <div class="alert alert-warning alert-sm py-2 mt-2">
                <ul class="mb-0 ps-3 small">
                    <li v-for="msg in errorMsgs" :key="msg">{{ msg }}</li>
                </ul>
            </div>
        </template>

        <!-- Action buttons -->
        <div class="d-flex gap-2 mt-3">
            <button
                class="btn btn-primary btn-sm"
                :disabled="errorMsgs.length > 0"
                @click="save"
            >
                <i class="bi bi-check-lg me-1"></i>Apply
            </button>
            <button class="btn btn-outline-secondary btn-sm" @click="cancel">
                <i class="bi bi-x-lg me-1"></i>Cancel
            </button>
        </div>
    </div>
</template>

<script setup>
import { useConfig } from '../composables/useConfig'
import ListBoxInput from './ListBoxInput.vue'

const { curPolicy, curConfig, parsedPolicy, errorMsgs, loadConfig, saveConfig, resetConfig } = useConfig()

const disabled = computed(() => curConfig.value.enabled !== true)

// Load configuration when policy changes
watch(
    () => curPolicy.value?.id,
    () => {
        if (curPolicy.value) loadConfig()
    },
    { immediate: true }
)

function save() {
    saveConfig()
}

function cancel() {
    if (curPolicy.value) loadConfig()
}

function decrementDecimal(comp) {
    const current = curConfig.value.config[comp.prop] ?? comp.attrs.minValue
    curConfig.value.config[comp.prop] = Math.max(comp.attrs.minValue, current - comp.attrs.spinStep)
}

function incrementDecimal(comp) {
    const current = curConfig.value.config[comp.prop] ?? comp.attrs.minValue
    curConfig.value.config[comp.prop] = Math.min(comp.attrs.maxValue, current + comp.attrs.spinStep)
}
</script>
