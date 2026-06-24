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
- **Conservative rank**: a cautious lower-bound ranking that favors options with
  stronger evidence.

## Example

Imagine comparing two products:

| Option | Average rating | Reviews |
| --- | ---: | ---: |
| Small Favorite | 5.0 | 3 |
| Reliable Choice | 4.6 | 900 |

A raw average ranks `Small Favorite` first. Review Confidence Ranker may rank
`Reliable Choice` higher because its score is supported by far more reviews.

## How The Ranking Works

The ranking is intentionally approximate. It uses only average rating and review
count, not the full distribution of individual reviews.

At a high level, the app:

1. Estimates a typical rating from the options you entered.
2. Shrinks low-review options toward that typical rating.
3. Calculates an approximate cautious lower bound.
4. Ranks options by both adjusted score and conservative lower bound.
5. Treats very small score differences as practical ties.

## Assumptions And Limits

- The average rating and review count are accurate.
- Reviews are treated as roughly comparable across the options.
- The lower bound is approximate because individual review-level data is not
  available.
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
