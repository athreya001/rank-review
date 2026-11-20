# Review Confidence Ranker

Review Confidence Ranker helps compare options when all you know is an average
rating and a review count. It is useful for choices where a perfect rating from
three reviews should not automatically beat a slightly lower rating from hundreds
or thousands of reviews.

Live app: https://athreya001.github.io/rank-review/

## What It Does

Enter each option with:

- its name
- its average rating
- the number of reviews behind that average

The app then shows two rankings:

- **Balanced rank**: the best estimate after pulling small samples toward the
  typical rating in the set.
- **Conservative rank** orders options by their adjusted rating after a penalty
  that decreases as the review count grows.

## Example

Imagine comparing two products:

| Option | Average rating | Reviews |
| --- | ---: | ---: |
| Small Favorite | 5.0 | 3 |
| Reliable Choice | 4.6 | 900 |

The balanced ranking treats these two options as a practical tie. The
conservative ranking puts `Reliable Choice` first because its 900 reviews
give it a smaller penalty.

## How The Ranking Works

The ranking is intentionally approximate. It uses only average rating and review
count, not the full distribution of individual reviews.

At a high level, the app:

1. Estimates a typical rating from the options you entered.
2. Shrinks low-review options toward that typical rating.
3. Subtracts a review-count penalty from each adjusted rating, keeping the
   conservative score within the rating scale.
4. Ranks options by both adjusted rating and conservative score.
5. Treats very small score differences as practical ties.

## Assumptions And Limits

- The average rating and review count are accurate.
- Reviews are treated as roughly comparable across the options.
- The conservative score is a ranking heuristic. Its penalty uses the review
  count and prior strength and assumes a standard deviation of one quarter of
  the rating scale's width.
- With only one or two options, the automatically estimated typical rating is
  less stable.
- The app is a decision aid, not a guarantee of product or service quality.

## Privacy

All calculations happen locally in your browser. The app does not upload the
options, ratings, or review counts you enter.

## Development

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test
npm run build
```

## GitHub Pages

The repository includes a GitHub Actions workflow that builds the app and deploys
the `dist` output to GitHub Pages on pushes to `main`.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
