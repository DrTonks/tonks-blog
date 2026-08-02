/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SLEEPY_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
