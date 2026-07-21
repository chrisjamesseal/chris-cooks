/// <reference types="vite/client" />
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Optional endpoint of the AI import-cleanup worker; imports skip cleanup when unset. */
  readonly VITE_AI_CLEANUP_URL?: string
  /** Optional endpoint of the recipe/meal-plan sync worker; sync is inert when unset. */
  readonly VITE_SYNC_URL?: string
}
