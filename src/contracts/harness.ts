/** Gate 0 contract only; not the eventual race scenario schema. */
export interface HarnessInput { readonly schemaVersion: 'harness-1'; readonly seed: string }
export interface HarnessState { readonly phase: 'initialized'; readonly tick: 0; readonly seed: string }
