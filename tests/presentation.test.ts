import { describe, expect, it } from "vitest";

import { createRankingViewModel, formatStars } from "../src/presentation";
import { rankItems } from "../src/ranking";

describe("formatStars", () => {
  it("formats ranking numbers to three decimal places", () => {
    expect(formatStars(4.246235500150709)).toBe("4.246");
  });
});

describe("createRankingViewModel", () => {
  it("sorts conservative and balanced tables by their respective ranks", () => {
    const result = rankItems([
      { name: "Small Favorite", rating: 5, reviews: 1 },
      { name: "Reliable Choice", rating: 4.6, reviews: 900 },
      { name: "Middle", rating: 4.5, reviews: 180 },
    ]);

    const viewModel = createRankingViewModel(result);

    expect(viewModel.conservativeRows[0].name).toBe("Reliable Choice");
    expect(viewModel.balancedRows[0].name).toBe("Reliable Choice");
    expect(viewModel.recommendation).toBe("Reliable Choice ranks first by conservative score.");
    expect(viewModel.balancedRows).toContainEqual(
      expect.objectContaining({
        name: "Reliable Choice",
        rawRank: "#2",
        rankDelta: "Up 1",
        explanation: expect.stringContaining("rose #2 to #1"),
      }),
    );
    expect(viewModel.settings).toContainEqual(["Penalty multiplier", "1.645"]);
  });

  it("names all tied leaders regardless of entry order and excludes lower ranks", () => {
    const items = [
      { name: "Birch", rating: 4.5, reviews: 100 },
      { name: "Alder", rating: 4.5, reviews: 100 },
      { name: "Cedar", rating: 4.5, reviews: 100 },
      { name: "Elm", rating: 3.5, reviews: 100 },
    ];
    const expected = "Alder, Birch and Cedar share first place by conservative score.";
    for (const order of [items, [...items].reverse()]) {
      expect(createRankingViewModel(rankItems(order)).recommendation).toBe(expected);
    }
  });

  it("reports shared first place when different scores are a practical tie", () => {
    const view = createRankingViewModel(rankItems([
      { name: "East", rating: 4.5, reviews: 100 },
      { name: "West", rating: 4.52, reviews: 100 },
    ]));
    expect(view.conservativeRows[0].lowerBound).not.toBe(view.conservativeRows[1].lowerBound);
    expect(view.recommendation).toBe("East and West share first place by conservative score.");
  });

  it("surfaces the two-item prior caveat when the comparison is sparse", () => {
    const result = rankItems([
      { name: "ApplyAll", rating: 4.8, reviews: 65 },
      { name: "TalentDesk", rating: 4.3, reviews: 816 },
    ]);

    const viewModel = createRankingViewModel(result);

    expect(viewModel.notes).toContain("With only two supplied options, the typical rating is approximate.");
  });
});
