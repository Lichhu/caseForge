import { computed } from 'vue';
import type { ScenarioScope } from '@case-forge/shared';
import { SCENARIO_SCOPE_API } from '@case-forge/shared';
import type { ScenarioLibraryItem, ScenarioLibraryPayload } from '@/api/client';
import { useApiTestStore } from '@/stores/apiTest';
import { useCaseForgeStore } from '@/stores/caseForge';

export function useScenarioLibrary(scope: ScenarioScope) {
  const caseForgeStore = useCaseForgeStore();
  const apiTestStore = useApiTestStore();

  const scenarios = computed<ScenarioLibraryItem[]>(() =>
    scope === SCENARIO_SCOPE_API ? apiTestStore.apiScenarios : caseForgeStore.scenarios,
  );

  async function loadScenarioLibrary() {
    if (scope === SCENARIO_SCOPE_API) {
      await apiTestStore.loadApiScenarioLibrary();
      return;
    }
    await caseForgeStore.loadScenarioLibrary();
  }

  async function saveScenario(
    item: Partial<ScenarioLibraryPayload> & {
      id?: string;
      name: string;
      description: string;
      category: string;
      isActive: boolean;
    },
    options?: { successMessage?: string; silent?: boolean },
  ) {
    if (scope === SCENARIO_SCOPE_API) {
      return apiTestStore.saveApiScenario(item, options);
    }
    return caseForgeStore.saveScenario(item, options);
  }

  async function deleteScenario(id: string) {
    if (scope === SCENARIO_SCOPE_API) {
      await apiTestStore.deleteApiScenario(id);
      return;
    }
    await caseForgeStore.deleteScenario(id);
  }

  return {
    scenarios,
    loadScenarioLibrary,
    saveScenario,
    deleteScenario,
  };
}
