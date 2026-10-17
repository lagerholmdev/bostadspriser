/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Kodnamn hos GoatCounter för cookiefri besöksstatistik. Tomt = ingen statistik. */
  readonly PUBLIC_GOATCOUNTER?: string;
}
