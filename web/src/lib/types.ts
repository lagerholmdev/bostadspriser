/**
 * Datakontraktet mellan pipelinen (Python) och webben.
 *
 * Pipelinen skriver src/generated/areas.json (Dataset) och src/generated/areas.geojson
 * (geometri med bara `slug` som egenskap). Ändras formatet här ska pipelinens export
 * och docs/data.md ändras i samma commit.
 */

/** Senaste 3 respektive 12 månaderna, räknat bakåt från publiceringsmånaden. */
export type Period = "m3" | "m12";

/** Bostadsrätt eller villa (småhus). */
export type Housing = "apartment" | "house";

/** Stadsdelsområde i Stockholms stad eller kommun i länet. */
export type AreaKind = "district" | "municipality";

/**
 * Varför ett värde saknas, enligt Mäklarstatistik:
 * F = för få affärer (under 25 på tre månader), N = icke-representativt, 0 = ingen data.
 */
export type MissingReason = "F" | "N" | "0";

export interface Stat {
  /** Antal sålda bostäder under perioden. */
  sales: number | null;
  /** Snittpris per kvadratmeter, kr. */
  pricePerSqm: number | null;
  /** Medelpris per bostad, kr. */
  meanPrice: number | null;
  /** Prisförändring i procent mot jämförelseperioden. */
  change: number | null;
  /** Fält som saknas och varför. */
  missing?: Partial<Record<"sales" | "pricePerSqm" | "meanPrice" | "change", MissingReason>>;
}

export type StatsByPeriod = Record<Period, Stat>;

/**
 * SCB-statistik per område (data/scb/kontext.json, DeSO 2025 summerat per område).
 * Andelar är 0–1. `condos` är antalet bostadsrätter, nämnaren i omsättningsgraden.
 */
export interface AreaContext {
  /** Andel hushåll med barn (sammanboende eller ensamstående). */
  families: number | null;
  /** Andel 20 år och äldre i rikets översta fjärdedel för sammanräknad förvärvsinkomst. */
  highIncome: number | null;
  /** Andel 25–65 år med eftergymnasial utbildning på 3 år eller mer. */
  higherEducation: number | null;
  /** Andel av befolkningen som är 25–44 år. */
  age25to44: number | null;
  /** Antal bostadsrätter. */
  condos: number | null;
}

export type ContextKey = keyof AreaContext;

export interface Area {
  slug: string;
  name: string;
  kind: AreaKind;
  /** Punkt för etikett och kamera, [lon, lat]. Ligger alltid inuti ytan. */
  label: [number, number];
  /** Slugs för områden inom 1 km. */
  neighbours: string[];
  /** [väst, syd, öst, nord] i WGS84. */
  bbox: [number, number, number, number];
  apartment: StatsByPeriod | null;
  house: StatsByPeriod | null;
  /**
   * "city" när villastatistiken gäller hela Stockholms stad (stadsdelarna har ingen egen).
   * "area" när den gäller området självt.
   */
  houseScope: "area" | "city" | null;
  /** SCB-kontext, eller null om den inte har hämtats. */
  context: AreaContext | null;
}

/** Förra månadens siffror per område (samma villaregel som Area). */
export interface PreviousArea {
  apartment: StatsByPeriod | null;
  house: StatsByPeriod | null;
}

export interface Dataset {
  /** Datum då Mäklarstatistik publicerade siffrorna, YYYY-MM-DD. */
  updated: string;
  /** Läsbara periodnamn, t.ex. { m3: "jul–sep 2026", m12: "okt 2025–sep 2026" }. */
  periods: Record<Period, string>;
  source: { name: string; url: string };
  county: { name: string; apartment: StatsByPeriod; house: StatsByPeriod };
  /** Källa, år per mått och länets värden för SCB-kontexten. null om den inte har hämtats. */
  context: {
    source: { name: string; url: string };
    years: Record<ContextKey, string>;
    county: AreaContext;
  } | null;
  /** Förra ögonblicksbilden, för placeringsflytten i Förändring. null när bara en månad finns. */
  previous: { updated: string; areas: Record<string, PreviousArea> } | null;
  areas: Area[];
}
