import { describe, expect, it } from "vitest";

import { parseCsv, rankItems } from "../src/ranking";

describe("parseCsv", () => {
  it("accepts case-insensitive required columns with surrounding whitespace", () => {
    const items = parseCsv(" Name , Rating , Reviews \nApplyAll,4.8,65\nTalentDesk,4.3,816\n");

    expect(items).toEqual([
      { name: "ApplyAll", rating: 4.8, reviews: 65 },
      { name: "TalentDesk", rating: 4.3, reviews: 816 },
    ]);
  });

  it("rejects ratings outside the configured scale", () => {
    expect(() => parseCsv("name,rating,reviews\nBad Fit,5.6,12\n")).toThrow(
      "Row 2: rating 5.6 is outside the 1-5 scale.",
    );
  });
});

describe("rankItems", () => {
  it("matches the Python reference ranking for a two-item comparison", () => {
    const { items, settings } = rankItems([
      { name: "ApplyAll", rating: 4.8, reviews: 65 },
      { name: "TalentDesk", rating: 4.3, reviews: 816 },
    ]);

    expect(settings).toMatchObject({
      confidence: 0.95,
      priorCount: 50,
      priorCountSource: "default",
      priorMeanSource: "auto_weighted_mean",
      twoItemPriorCaveat: true,
    });
    expect(settings.priorMean).toBeCloseTo(4.33688989784336, 12);
    expect(settings.zScore).toBeCloseTo(1.6448536269514715, 12);

    expect(items).toEqual([
      expect.objectContaining({
        name: "ApplyAll",
        rawRank: 1,
        adjustedRating: expect.closeTo(4.598647781671026, 12),
        lowerBound: expect.closeTo(4.44526439007265, 12),
        balancedRank: 1,
        conservativeRank: 1,
      }),
      expect.objectContaining({
        name: "TalentDesk",
        rawRank: 2,
        adjustedRating: expect.closeTo(4.302129901723057, 12),
        lowerBound: expect.closeTo(4.246235500150709, 12),
        balancedRank: 2,
        conservativeRank: 2,
      }),
    ]);
  });

  it("groups practical ties within 0.03 stars", () => {
    const { items } = rankItems(
      [
        { name: "Alpha", rating: 4.5, reviews: 200 },
        { name: "Beta", rating: 4.48, reviews: 200 },
      ],
      { priorMean: 4.49, priorCount: 50 },
    );

    expect(items.map((item) => item.balancedRank)).toEqual([1, 1]);
    expect(items.map((item) => item.balancedTieGroup)).toEqual([1, 1]);
  });

  it.each([
    [4.60, 4.54, 1, 1],
    [4.40, 4.34, 1, 1],
    [4.6000000001, 4.54, 1, 2],
    [1004.60, 1004.54, 1001, 1],
    [1004.6000000001, 1004.54, 1001, 2],
  ])("ranks %s and %s consistently at the adjusted tie cutoff", (first, second, scaleMin, expectedRank) => {
    const { items } = rankItems(
      [
        { name: "Alpha", rating: first, reviews: 50 },
        { name: "Beta", rating: second, reviews: 50 },
      ],
      { scaleMin, scaleMax: scaleMin + 4 },
    );

    expect(items[1].balancedRank).toBe(expectedRank);
    expect(items[1].conservativeRank).toBe(expectedRank);
  });

  it("keeps distinct ratings separate on a small scale", () => {
    const { items } = rankItems(
      [
        { name: "Alpha", rating: 1e-16, reviews: 50 },
        { name: "Beta", rating: 0, reviews: 50 },
      ],
      { scaleMin: 0, scaleMax: 1e-16, ratingSd: 2.5e-17 },
    );

    expect(items[1]).toMatchObject({ rawRank: 2, balancedRank: 2, conservativeRank: 2 });
  });

  it("keeps a representable raw gap above the cutoff separate on a heavily offset scale", () => {
    const scaleMin = 1e15;
    const { items } = rankItems(
      [
        { name: "Alpha", rating: scaleMin + 2, reviews: 50 },
        { name: "Beta", rating: scaleMin + 1.875, reviews: 50 },
      ],
      { scaleMin, scaleMax: scaleMin + 4 },
    );

    expect(items[1].rawRank).toBe(2);
  });

  it("uses review counts to set automatic prior strength for larger comparisons", () => {
    const { settings } = rankItems([
      { name: "Alpha", rating: 4.8, reviews: 12 },
      { name: "Beta", rating: 4.6, reviews: 44 },
      { name: "Gamma", rating: 4.5, reviews: 142 },
      { name: "Delta", rating: 4.3, reviews: 816 },
      { name: "Epsilon", rating: 4.4, reviews: 1300 },
    ]);

    expect(settings.priorCount).toBe(142);
    expect(settings.priorCountSource).toBe("estimated");
  });

  it("scales the practical tie threshold with the rating range", () => {
    const { items, settings } = rankItems(
      [
        { name: "Alpha", rating: 9, reviews: 100 },
        { name: "Beta", rating: 8.94, reviews: 100 },
      ],
      { scaleMin: 0, scaleMax: 10, ratingSd: 2.5 },
    );

    expect(settings.practicalTieDelta).toBeCloseTo(0.075, 12);
    expect(items.map((item) => item.rawRank)).toEqual([1, 1]);
  });
});
