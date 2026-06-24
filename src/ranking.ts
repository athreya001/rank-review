export const PRACTICAL_TIE_DELTA = 0.03;
export const DEFAULT_PRIOR_COUNT = 50;
const DEFAULT_SCALE_WIDTH = 4;
const MIN_ESTIMATED_PRIOR_COUNT = 10;
const MAX_ESTIMATED_PRIOR_COUNT = 500;

export interface ReviewItem {
  name: string;
  rating: number;
  reviews: number;
}

export interface RankedItem extends ReviewItem {
  adjustedRating: number;
  lowerBound: number;
  rawRank: number;
  balancedRank: number;
  conservativeRank: number;
  rawTieGroup: number;
  balancedTieGroup: number;
  conservativeTieGroup: number;
}

export interface RankingOptions {
  confidence?: number;
  scaleMin?: number;
  scaleMax?: number;
  ratingSd?: number;
  priorMean?: number;
  priorCount?: number;
}

export interface RankingSettings {
  confidence: number;
  zScore: number;
  scaleMin: number;
  scaleMax: number;
  ratingSd: number;
  priorMean: number;
  priorMeanSource: "provided" | "auto_weighted_mean";
  priorCount: number;
  priorCountSource: "provided" | "estimated" | "default";
  practicalTieDelta: number;
  twoItemPriorCaveat: boolean;
}

export interface RankingResult {
  items: RankedItem[];
  settings: RankingSettings;
}

interface ResolvedOptions {
  confidence: number;
  scaleMin: number;
  scaleMax: number;
  ratingSd: number;
  priorMean?: number;
  priorCount?: number;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV input has an unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseCsv(
  input: string,
  { scaleMin = 1, scaleMax = 5 }: Pick<RankingOptions, "scaleMin" | "scaleMax"> = {},
): ReviewItem[] {
  const rows = parseCsvRows(input).filter((row) => row.some((field) => field.trim() !== ""));
  if (rows.length === 0) {
    throw new Error("CSV input must include a header row.");
  }

  const headers = rows[0];
  const fieldMap = new Map(headers.map((field, index) => [normalizeHeader(field), index]));
  const missing = ["name", "rating", "reviews"].filter((field) => !fieldMap.has(field));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missing.join(", ")}`);
  }

  const items: ReviewItem[] = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const name = (row[fieldMap.get("name") ?? -1] ?? "").trim();
    if (!name) {
      throw new Error(`Row ${rowNumber}: name is required.`);
    }

    const ratingText = (row[fieldMap.get("rating") ?? -1] ?? "").trim();
    const rating = Number(ratingText);
    if (!Number.isFinite(rating)) {
      throw new Error(`Row ${rowNumber}: rating must be numeric.`);
    }

    const reviewsText = (row[fieldMap.get("reviews") ?? -1] ?? "").trim();
    const reviewsFloat = Number(reviewsText);
    const reviews = Math.trunc(reviewsFloat);
    if (!Number.isFinite(reviewsFloat)) {
      throw new Error(`Row ${rowNumber}: reviews must be numeric.`);
    }
    if (reviews !== reviewsFloat) {
      throw new Error(`Row ${rowNumber}: reviews must be a whole number.`);
    }
    if (reviews <= 0) {
      throw new Error(`Row ${rowNumber}: reviews must be greater than zero.`);
    }
    if (rating < scaleMin || rating > scaleMax) {
      throw new Error(
        `Row ${rowNumber}: rating ${formatNumber(rating)} is outside the ${formatNumber(
          scaleMin,
        )}-${formatNumber(scaleMax)} scale.`,
      );
    }

    items.push({ name, rating, reviews });
  });

  if (items.length === 0) {
    throw new Error("CSV input must include at least one product or service.");
  }
  return items;
}

function weightedMean(items: ReviewItem[]): number {
  const totals = items.reduce(
    (accumulator, item) => ({
      reviews: accumulator.reviews + item.reviews,
      ratingSum: accumulator.ratingSum + item.rating * item.reviews,
    }),
    { reviews: 0, ratingSum: 0 },
  );
  if (totals.reviews <= 0) {
    throw new Error("Total reviews must be greater than zero.");
  }
  return totals.ratingSum / totals.reviews;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function estimatePriorCount(items: ReviewItem[]): number {
  if (items.length < 5) {
    return DEFAULT_PRIOR_COUNT;
  }

  const estimated = median(items.map((item) => item.reviews));
  if (!Number.isFinite(estimated)) {
    return DEFAULT_PRIOR_COUNT;
  }
  return Math.min(MAX_ESTIMATED_PRIOR_COUNT, Math.max(MIN_ESTIMATED_PRIOR_COUNT, estimated));
}

function resolveOptions(options: RankingOptions): ResolvedOptions {
  const resolved = {
    confidence: options.confidence ?? 0.95,
    scaleMin: options.scaleMin ?? 1,
    scaleMax: options.scaleMax ?? 5,
    ratingSd: options.ratingSd ?? 1,
    priorMean: options.priorMean,
    priorCount: options.priorCount,
  };

  if (resolved.confidence <= 0.5 || resolved.confidence >= 1) {
    throw new Error("confidence must be greater than 0.5 and less than 1.");
  }
  if (resolved.scaleMax <= resolved.scaleMin) {
    throw new Error("scaleMax must be greater than scaleMin.");
  }
  if (resolved.ratingSd <= 0) {
    throw new Error("ratingSd must be greater than zero.");
  }
  if (resolved.priorCount !== undefined && resolved.priorCount <= 0) {
    throw new Error("priorCount must be greater than zero.");
  }
  if (
    resolved.priorMean !== undefined &&
    (resolved.priorMean < resolved.scaleMin || resolved.priorMean > resolved.scaleMax)
  ) {
    throw new Error("priorMean must be within the rating scale.");
  }

  return resolved;
}

function assignRanks(
  values: Array<[number, number]>,
  practicalTieDelta = PRACTICAL_TIE_DELTA,
): {
  ranks: Map<number, number>;
  tieGroups: Map<number, number>;
} {
  const sortedValues = [...values].sort((left, right) => right[1] - left[1]);
  const ranks = new Map<number, number>();
  const tieGroups = new Map<number, number>();
  let currentRank = 0;
  let currentGroup = 0;
  let groupAnchorValue: number | undefined;

  sortedValues.forEach(([index, value], positionIndex) => {
    const position = positionIndex + 1;
    if (groupAnchorValue === undefined || Math.abs(groupAnchorValue - value) > practicalTieDelta) {
      currentRank = position;
      currentGroup += 1;
      groupAnchorValue = value;
    }
    ranks.set(index, currentRank);
    tieGroups.set(index, currentGroup);
  });

  return { ranks, tieGroups };
}

function practicalTieDeltaForScale(scaleMin: number, scaleMax: number): number {
  return (PRACTICAL_TIE_DELTA / DEFAULT_SCALE_WIDTH) * (scaleMax - scaleMin);
}

function inverseNormalCdf(probability: number): number {
  if (probability === 0.95) {
    return 1.6448536269514715;
  }

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lower = 0.02425;
  const upper = 1 - lower;

  if (probability < lower) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (probability > upper) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = probability - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
    q
  ) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function rankItems(items: ReviewItem[], options: RankingOptions = {}): RankingResult {
  if (items.length === 0) {
    throw new Error("At least one product or service is required.");
  }

  const resolved = resolveOptions(options);
  const priorMean = resolved.priorMean ?? weightedMean(items);
  const priorMeanSource = resolved.priorMean === undefined ? "auto_weighted_mean" : "provided";
  const priorCount = resolved.priorCount ?? estimatePriorCount(items);
  const priorCountSource =
    resolved.priorCount !== undefined ? "provided" : items.length >= 5 ? "estimated" : "default";
  const zScore = inverseNormalCdf(resolved.confidence);
  const practicalTieDelta = practicalTieDeltaForScale(resolved.scaleMin, resolved.scaleMax);

  const partials = items.map((item) => {
    const adjustedRating =
      (item.reviews * item.rating + priorCount * priorMean) / (item.reviews + priorCount);
    const lowerBound = Math.min(
      resolved.scaleMax,
      Math.max(
        resolved.scaleMin,
        adjustedRating - (zScore * resolved.ratingSd) / Math.sqrt(item.reviews + priorCount),
      ),
    );

    return { ...item, adjustedRating, lowerBound };
  });

  const raw = assignRanks(
    partials.map((item, index) => [index, item.rating]),
    practicalTieDelta,
  );
  const balanced = assignRanks(
    partials.map((item, index) => [index, item.adjustedRating]),
    practicalTieDelta,
  );
  const conservative = assignRanks(
    partials.map((item, index) => [index, item.lowerBound]),
    practicalTieDelta,
  );

  return {
    items: partials.map((item, index) => ({
      ...item,
      rawRank: raw.ranks.get(index) ?? 0,
      balancedRank: balanced.ranks.get(index) ?? 0,
      conservativeRank: conservative.ranks.get(index) ?? 0,
      rawTieGroup: raw.tieGroups.get(index) ?? 0,
      balancedTieGroup: balanced.tieGroups.get(index) ?? 0,
      conservativeTieGroup: conservative.tieGroups.get(index) ?? 0,
    })),
    settings: {
      confidence: resolved.confidence,
      zScore,
      scaleMin: resolved.scaleMin,
      scaleMax: resolved.scaleMax,
      ratingSd: resolved.ratingSd,
      priorMean,
      priorMeanSource,
      priorCount,
      priorCountSource,
      practicalTieDelta,
      twoItemPriorCaveat: items.length <= 2 && resolved.priorMean === undefined,
    },
  };
}
