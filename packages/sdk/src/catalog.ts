/**
 * Catalog of real-world exposures Keel can hedge, and how each one maps onto a
 * Hyperliquid HIP-3 perp. Every perp here is quoted in USD per "instrument unit"
 * (barrel, troy ounce, pound, MMBtu, ...). Users think in their own units
 * (litres of diesel, grams of gold, tonnes of copper), so each exposure carries
 * conversion factors from user units into instrument units.
 */

export type ExposureCategory = "energy" | "metals" | "fx";

export interface UnitDef {
  id: string;
  label: string;
  /** How many instrument units one of these user units represents. */
  toInstrument: number;
}

export interface InstrumentDef {
  /** Perp symbol on the HIP-3 dex, e.g. "xyz:BRENTOIL". */
  coin: string;
  label: string;
  /** Unit the perp price is quoted in, e.g. "bbl". */
  unit: string;
}

export interface ExposureDef {
  id: string;
  label: string;
  category: ExposureCategory;
  /** Who typically carries this exposure; used for copy in the UI. */
  whoHasIt: string;
  /** Instruments that can hedge it. The first one is the default. */
  instruments: InstrumentDef[];
  units: UnitDef[];
  /**
   * For inverse FX quotes (USD/JPY), the perp price is "foreign per USD". The
   * planner converts foreign-currency amounts into a USD-denominated size.
   */
  inverseQuote?: boolean;
  /**
   * Plain-language note about what the hedge does and does not cover
   * (e.g. diesel = crude + refining margin; we hedge the crude part).
   */
  basisNote?: string;
}

const LITRES_PER_BARREL = 158.987294928;
const US_GALLONS_PER_BARREL = 42;
const GRAMS_PER_TROY_OZ = 31.1034768;
const POUNDS_PER_KG = 2.20462262185;
const MMBTU_PER_MWH = 3.412141633;
const MMBTU_PER_GJ = 0.947817120;

const BRENT: InstrumentDef = { coin: "xyz:BRENTOIL", label: "Brent crude", unit: "bbl" };
const WTI: InstrumentDef = { coin: "xyz:CL", label: "WTI crude", unit: "bbl" };

const fuelUnits: UnitDef[] = [
  { id: "L", label: "litres", toInstrument: 1 / LITRES_PER_BARREL },
  { id: "gal", label: "US gallons", toInstrument: 1 / US_GALLONS_PER_BARREL },
  { id: "bbl", label: "barrels", toInstrument: 1 },
];

const troyUnits: UnitDef[] = [
  { id: "ozt", label: "troy ounces", toInstrument: 1 },
  { id: "g", label: "grams", toInstrument: 1 / GRAMS_PER_TROY_OZ },
  { id: "kg", label: "kilograms", toInstrument: 1000 / GRAMS_PER_TROY_OZ },
];

const fuelBasis =
  "Refined fuel prices = crude oil + refining margin + taxes + delivery. Keel hedges the crude-oil part, which drives most of the month-to-month swings.";

export const EXPOSURES: ExposureDef[] = [
  {
    id: "diesel",
    label: "Diesel",
    category: "energy",
    whoHasIt: "Trucking, logistics, delivery fleets, construction, agriculture, generators",
    instruments: [BRENT, WTI],
    units: fuelUnits,
    basisNote: fuelBasis,
  },
  {
    id: "gasoline",
    label: "Petrol / gasoline",
    category: "energy",
    whoHasIt: "Ride-hailing and courier fleets, field-service businesses",
    instruments: [BRENT, WTI],
    units: fuelUnits,
    basisNote: fuelBasis,
  },
  {
    id: "jetfuel",
    label: "Jet fuel",
    category: "energy",
    whoHasIt: "Charter operators, air cargo, flight schools",
    instruments: [BRENT, WTI],
    units: fuelUnits,
    basisNote: fuelBasis,
  },
  {
    id: "crude",
    label: "Crude oil",
    category: "energy",
    whoHasIt: "Producers, refiners, traders",
    instruments: [BRENT, WTI],
    units: [{ id: "bbl", label: "barrels", toInstrument: 1 }],
  },
  {
    id: "natgas",
    label: "Natural gas",
    category: "energy",
    whoHasIt: "Manufacturers, bakeries, greenhouses, utilities",
    instruments: [{ coin: "xyz:NATGAS", label: "Henry Hub natural gas", unit: "MMBtu" }],
    units: [
      { id: "MMBtu", label: "MMBtu", toInstrument: 1 },
      { id: "therm", label: "therms", toInstrument: 0.1 },
      { id: "GJ", label: "gigajoules", toInstrument: MMBTU_PER_GJ },
      { id: "MWh", label: "MWh (gas)", toInstrument: MMBTU_PER_MWH },
    ],
    basisNote: "Priced off the US Henry Hub benchmark. Regional gas prices can differ.",
  },
  {
    id: "gold",
    label: "Gold",
    category: "metals",
    whoHasIt: "Jewellers, refiners, dental labs, electronics makers",
    instruments: [{ coin: "xyz:GOLD", label: "Gold", unit: "ozt" }],
    units: troyUnits,
  },
  {
    id: "silver",
    label: "Silver",
    category: "metals",
    whoHasIt: "Jewellers, solar-panel and electronics makers",
    instruments: [{ coin: "xyz:SILVER", label: "Silver", unit: "ozt" }],
    units: troyUnits,
  },
  {
    id: "platinum",
    label: "Platinum",
    category: "metals",
    whoHasIt: "Catalytic-converter, jewellery and lab-equipment makers",
    instruments: [{ coin: "xyz:PLATINUM", label: "Platinum", unit: "ozt" }],
    units: troyUnits,
  },
  {
    id: "palladium",
    label: "Palladium",
    category: "metals",
    whoHasIt: "Auto-parts and electronics makers",
    instruments: [{ coin: "xyz:PALLADIUM", label: "Palladium", unit: "ozt" }],
    units: troyUnits,
  },
  {
    id: "copper",
    label: "Copper",
    category: "metals",
    whoHasIt: "Electricians, cable and motor makers, HVAC installers, builders",
    instruments: [{ coin: "xyz:COPPER", label: "COMEX copper", unit: "lb" }],
    units: [
      { id: "lb", label: "pounds", toInstrument: 1 },
      { id: "kg", label: "kilograms", toInstrument: POUNDS_PER_KG },
      { id: "t", label: "metric tonnes", toInstrument: 1000 * POUNDS_PER_KG },
    ],
  },
  {
    id: "eur",
    label: "Euro invoices",
    category: "fx",
    whoHasIt: "Importers paying EU suppliers, exporters paid in euros",
    instruments: [{ coin: "xyz:EUR", label: "EUR/USD", unit: "EUR" }],
    units: [{ id: "EUR", label: "euros", toInstrument: 1 }],
  },
  {
    id: "gbp",
    label: "Pound sterling invoices",
    category: "fx",
    whoHasIt: "Importers paying UK suppliers, exporters paid in pounds",
    instruments: [{ coin: "xyz:GBP", label: "GBP/USD", unit: "GBP" }],
    units: [{ id: "GBP", label: "pounds sterling", toInstrument: 1 }],
  },
  {
    id: "jpy",
    label: "Japanese yen invoices",
    category: "fx",
    whoHasIt: "Importers of Japanese machinery, vehicles and parts",
    // Quoted in yen per dollar, so position size is in dollars.
    instruments: [{ coin: "xyz:JPY", label: "USD/JPY", unit: "USD" }],
    units: [{ id: "JPY", label: "yen", toInstrument: 1 }],
    inverseQuote: true,
  },
];

export function getExposure(id: string): ExposureDef {
  const def = EXPOSURES.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown exposure "${id}"`);
  return def;
}

export function getUnit(exposure: ExposureDef, unitId: string): UnitDef {
  const unit = exposure.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unit "${unitId}" is not valid for ${exposure.label}`);
  return unit;
}

export function getInstrument(exposure: ExposureDef, coin?: string): InstrumentDef {
  if (!coin) return exposure.instruments[0]!;
  const inst = exposure.instruments.find((i) => i.coin === coin);
  if (!inst) throw new Error(`${coin} cannot hedge ${exposure.label}`);
  return inst;
}

/** Every perp symbol referenced by the catalog, de-duplicated. */
export function catalogCoins(): string[] {
  return [...new Set(EXPOSURES.flatMap((e) => e.instruments.map((i) => i.coin)))];
}
