import type { RankedItem, RankingResult } from "./ranking";

type RankingMode = "conservative" | "balanced";
type DeltaTone = "up" | "down" | "same";

export interface RankingRow {
  name: string;
  rank: number;
  rawRank: string;
  rankDelta: string;
  deltaTone: DeltaTone;
  rating: string;
  reviews: string;
  adjustedRating: string;
  lowerBound: string;
  explanation: string;
}

export interface RankingViewModel {
  conservativeRows: RankingRow[];
  balancedRows: RankingRow[];
  recommendation: string;
  notes: string[];
  settings: Array<[string, string]>;
}

export function formatStars(value: number): string {
  return value.toFixed(3);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}

function formatPriorCount(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);
}

function formatRank(rank: number): string {
  return `#${rank}`;
}

function rankDelta(rawRank: number, methodRank: number): Pick<RankingRow, "rankDelta" | "deltaTone"> {
  const movement = rawRank - methodRank;
  if (movement > 0) {
    return { rankDelta: `Up ${movement}`, deltaTone: "up" };
  }
  if (movement < 0) {
    return { rankDelta: `Down ${Math.abs(movement)}`, deltaTone: "down" };
  }
  return { rankDelta: "Same", deltaTone: "same" };
}

function movementPhrase(rawRank: number, methodRank: number): string {
  if (methodRank < rawRank) {
    return `rose ${formatRank(rawRank)} to ${formatRank(methodRank)}`;
  }
  if (methodRank > rawRank) {
    return `dropped ${formatRank(rawRank)} to ${formatRank(methodRank)}`;
  }
  return `held ${formatRank(methodRank)}`;
}

function evidencePhrase(item: RankedItem, priorCount: number): string {
  if (item.reviews < priorCount * 0.5) {
    return `only ${formatCount(item.reviews)} reviews, so the prior has a strong pull`;
  }
  if (item.reviews < priorCount * 2) {
    return `${formatCount(item.reviews)} reviews, so the prior still matters`;
  }
  return `${formatCount(item.reviews)} reviews, enough evidence for its own rating to dominate`;
}

function priorPullPhrase(item: RankedItem, priorMean: number): string {
  const formattedPrior = formatStars(priorMean);
  if (Math.abs(item.rating - priorMean) < 0.05) {
    return `its rating is close to the ${formattedPrior} prior`;
  }
  if (item.rating > priorMean) {
    return `its rating is pulled down toward the ${formattedPrior} prior`;
  }
  return `its rating is lifted toward the ${formattedPrior} prior`;
}

function explanationFor(item: RankedItem, mode: RankingMode, result: RankingResult): string {
  const rank = mode === "conservative" ? item.conservativeRank : item.balancedRank;
  const movement = movementPhrase(item.rawRank, rank);
  const evidence = evidencePhrase(item, result.settings.priorCount);

  if (mode === "balanced") {
    return `${movement}: ${evidence}, and ${priorPullPhrase(item, result.settings.priorMean)}.`;
  }

  const penalty = item.adjustedRating - item.lowerBound;
  return `${movement} with ${evidence}. The conservative score is ${formatStars(penalty)} below the adjusted rating.`;
}

function priorMeanSourceLabel(source: RankingResult["settings"]["priorMeanSource"]): string {
  return source === "provided" ? "custom" : "auto from review-weighted average";
}

function priorCountSourceLabel(source: RankingResult["settings"]["priorCountSource"]): string {
  if (source === "provided") {
    return "custom";
  }
  if (source === "estimated") {
    return "auto from review counts";
  }
  return "default for short lists";
}

function rowFor(item: RankedItem, rank: number, mode: RankingMode, result: RankingResult): RankingRow {
  const delta = rankDelta(item.rawRank, rank);
  return {
    name: item.name,
    rank,
    rawRank: formatRank(item.rawRank),
    rankDelta: delta.rankDelta,
    deltaTone: delta.deltaTone,
    rating: formatStars(item.rating),
    reviews: formatCount(item.reviews),
    adjustedRating: formatStars(item.adjustedRating),
    lowerBound: formatStars(item.lowerBound),
    explanation: explanationFor(item, mode, result),
  };
}

function conservativeHeadline(items: RankedItem[]): string {
  const leaders = items.filter((item) => item.conservativeRank === 1).map((item) => item.name);
  if (leaders.length === 0) return "Add options to compare their conservative scores.";
  if (leaders.length === 1) return `${leaders[0]} ranks first by conservative score.`;

  const names = new Intl.ListFormat("en-AU").format(leaders.sort());
  return `${names} share first place by conservative score.`;
}

export function createRankingViewModel(result: RankingResult): RankingViewModel {
  const conservativeItems = [...result.items].sort(
    (left, right) =>
      left.conservativeRank - right.conservativeRank ||
      right.lowerBound - left.lowerBound ||
      right.adjustedRating - left.adjustedRating,
  );
  const balancedItems = [...result.items].sort(
    (left, right) =>
      left.balancedRank - right.balancedRank ||
      right.adjustedRating - left.adjustedRating ||
      right.lowerBound - left.lowerBound,
  );
  const notes = [
    "Balanced rank is the best estimate after shrinking small samples toward the typical rating.",
    "Typical rating and prior strength are selected automatically from the entered options.",
    "Move compares each method's rank with the raw-average rank.",
    `Treat options within ${formatStars(result.settings.practicalTieDelta)} rating points as a practical tie.`,
    "The conservative score is a heuristic based on average ratings and review counts.",
  ];

  if (result.settings.twoItemPriorCaveat) {
    notes.push("With only two supplied options, the typical rating is approximate.");
  }

  return {
    conservativeRows: conservativeItems.map((item) =>
      rowFor(item, item.conservativeRank, "conservative", result),
    ),
    balancedRows: balancedItems.map((item) => rowFor(item, item.balancedRank, "balanced", result)),
    recommendation: conservativeHeadline(conservativeItems),
    notes,
    settings: [
      ["Penalty multiplier", formatStars(result.settings.zScore)],
      [
        "Typical rating",
        `${formatStars(result.settings.priorMean)} (${priorMeanSourceLabel(
          result.settings.priorMeanSource,
        )})`,
      ],
      [
        "Prior strength",
        `${formatPriorCount(result.settings.priorCount)} reviews (${priorCountSourceLabel(
          result.settings.priorCountSource,
        )})`,
      ],
      [
        "Rating scale",
        `${formatStars(result.settings.scaleMin)} to ${formatStars(result.settings.scaleMax)}`,
      ],
      ["Practical tie threshold", `${formatStars(result.settings.practicalTieDelta)} rating points`],
    ],
  };
}
