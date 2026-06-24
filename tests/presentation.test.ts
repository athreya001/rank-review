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
    expect(viewModel.recommendation).toContain("Reliable Choice");
    expect(viewModel.balancedRows).toContainEqual(
      expect.objectContaining({
        name: "Reliable Choice",
        rawRank: "#2",
        rankDelta: "Up 1",
        explanation: expect.stringContaining("rose #2 to #1"),
      }),
    );
    expect(viewModel.notes).toContain(
      "The lower bound is approximate because only average rating and review count are used.",
    );
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
