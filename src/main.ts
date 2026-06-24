import "./styles.css";
import { createRankingViewModel, type RankingRow } from "./presentation";
import { rankItems, type RankingOptions, type ReviewItem } from "./ranking";

const emptyRows = 3;

const entryRows = element<HTMLTableSectionElement>("entryRows");
const rankButton = element<HTMLButtonElement>("rankButton");
const addRowButton = element<HTMLButtonElement>("addRowButton");
const clearButton = element<HTMLButtonElement>("clearButton");
const scaleMinInput = element<HTMLInputElement>("scaleMinInput");
const scaleMaxInput = element<HTMLInputElement>("scaleMaxInput");
const errorBox = element<HTMLDivElement>("errorBox");
const resultsContent = element<HTMLDivElement>("resultsContent");
const settingsSummary = element<HTMLParagraphElement>("settingsSummary");
const recommendationText = element<HTMLElement>("recommendationText");
const conservativeBody = element<HTMLTableSectionElement>("conservativeBody");
const balancedBody = element<HTMLTableSectionElement>("balancedBody");
const settingsList = element<HTMLDListElement>("settingsList");
const notesList = element<HTMLUListElement>("notesList");

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) {
    throw new Error(`Missing element: ${id}`);
  }
  return target as T;
}

function entryInputs(row: HTMLTableRowElement) {
  return {
    name: row.querySelector<HTMLInputElement>('[data-field="name"]'),
    rating: row.querySelector<HTMLInputElement>('[data-field="rating"]'),
    reviews: row.querySelector<HTMLInputElement>('[data-field="reviews"]'),
  };
}

function readScaleInput(input: HTMLInputElement, label: string): number {
  const value = input.value.trim();
  if (!value) {
    throw new Error(`Enter the ${label}.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
}

function readRatingScale(): Pick<Required<RankingOptions>, "scaleMin" | "scaleMax"> {
  const scaleMin = readScaleInput(scaleMinInput, "lowest possible rating");
  const scaleMax = readScaleInput(scaleMaxInput, "highest possible rating");
  if (scaleMax <= scaleMin) {
    throw new Error("Highest possible rating must be greater than lowest possible rating.");
  }
  return { scaleMin, scaleMax };
}

function automaticRatingSd(scaleMin: number, scaleMax: number): number {
  return (scaleMax - scaleMin) / 4;
}

function readOptions(): RankingOptions {
  const { scaleMin, scaleMax } = readRatingScale();
  return {
    confidence: 0.95,
    ratingSd: automaticRatingSd(scaleMin, scaleMax),
    scaleMin,
    scaleMax,
  };
}

function createInputCell(label: string, input: HTMLInputElement): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.append(input);
  return cell;
}

function createEntryInput(
  field: keyof ReviewItem,
  value: string,
  placeholder: string,
  type: "text" | "number",
): HTMLInputElement {
  const input = document.createElement("input");
  input.dataset.field = field;
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = "off";

  if (field === "rating") {
    input.inputMode = "decimal";
    input.step = "0.1";
  }
  if (field === "reviews") {
    input.inputMode = "numeric";
    input.min = "1";
    input.step = "1";
  }

  return input;
}

function createEntryRow(item: Partial<ReviewItem> = {}): HTMLTableRowElement {
  const row = document.createElement("tr");

  const nameInput = createEntryInput("name", item.name ?? "", "Acme Pro", "text");
  nameInput.setAttribute("aria-label", "Option name");
  const ratingInput = createEntryInput(
    "rating",
    item.rating === undefined ? "" : String(item.rating),
    "4.6",
    "number",
  );
  ratingInput.setAttribute("aria-label", "Average rating");
  const reviewsInput = createEntryInput(
    "reviews",
    item.reviews === undefined ? "" : String(item.reviews),
    "120",
    "number",
  );
  reviewsInput.setAttribute("aria-label", "Review count");

  const nameCell = createInputCell("Option name", nameInput);
  const ratingCell = createInputCell("Average rating", ratingInput);
  const reviewsCell = createInputCell("Reviews", reviewsInput);
  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  actionCell.dataset.label = "Remove";
  removeButton.className = "row-remove";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.setAttribute("aria-label", `Remove ${item.name || "option"}`);
  actionCell.append(removeButton);

  row.append(nameCell, ratingCell, reviewsCell, actionCell);
  return row;
}

function syncEntryInputBounds() {
  const { scaleMin, scaleMax } = readRatingScale();
  entryRows.querySelectorAll<HTMLInputElement>('[data-field="rating"]').forEach((input) => {
    input.min = String(scaleMin);
    input.max = String(scaleMax);
  });
}

function renderEntryRows(items: Array<Partial<ReviewItem>>) {
  entryRows.replaceChildren(...items.map((item) => createEntryRow(item)));
  syncEntryInputBounds();
}

function addEntryRow(item: Partial<ReviewItem> = {}) {
  const row = createEntryRow(item);
  entryRows.append(row);
  syncEntryInputBounds();
  entryInputs(row).name?.focus();
}

function readEntryItems(
  options: Pick<Required<RankingOptions>, "scaleMin" | "scaleMax">,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): ReviewItem[] | undefined {
  const items: ReviewItem[] = [];

  Array.from(entryRows.rows).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const inputs = entryInputs(row);
    const name = inputs.name?.value.trim() ?? "";
    const ratingText = inputs.rating?.value.trim() ?? "";
    const reviewsText = inputs.reviews?.value.trim() ?? "";

    if (!name && !ratingText && !reviewsText) {
      return;
    }

    if (!name || !ratingText || !reviewsText) {
      throw new Error(`Option ${rowNumber}: add a name, rating, and review count.`);
    }

    const rating = Number(ratingText);
    if (!Number.isFinite(rating)) {
      throw new Error(`Option ${rowNumber}: rating must be a number.`);
    }
    if (rating < options.scaleMin || rating > options.scaleMax) {
      throw new Error(
        `Option ${rowNumber}: rating must be between ${options.scaleMin} and ${options.scaleMax}.`,
      );
    }

    const reviewsFloat = Number(reviewsText);
    const reviews = Math.trunc(reviewsFloat);
    if (!Number.isFinite(reviewsFloat)) {
      throw new Error(`Option ${rowNumber}: reviews must be a number.`);
    }
    if (reviews !== reviewsFloat) {
      throw new Error(`Option ${rowNumber}: reviews must be a whole number.`);
    }
    if (reviews <= 0) {
      throw new Error(`Option ${rowNumber}: reviews must be greater than zero.`);
    }

    items.push({ name, rating, reviews });
  });

  if (items.length === 0) {
    if (allowEmpty) {
      resetResults("Add at least one option to calculate ranks.");
      return undefined;
    }
    throw new Error("Add at least one option to calculate ranks.");
  }

  return items;
}

function renderRows(body: HTMLTableSectionElement, rows: RankingRow[], mode: "conservative" | "balanced") {
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      const columns =
        mode === "conservative"
          ? [
              ["Rank", row.rank],
              ["Option", row.name],
              ["Raw", row.rawRank],
              ["Move", row.rankDelta],
              ["Rating", row.rating],
              ["Reviews", row.reviews],
              ["Lower", row.lowerBound],
              ["Adjusted", row.adjustedRating],
              ["Why", row.explanation],
            ]
          : [
              ["Rank", row.rank],
              ["Option", row.name],
              ["Raw", row.rawRank],
              ["Move", row.rankDelta],
              ["Rating", row.rating],
              ["Reviews", row.reviews],
              ["Adjusted", row.adjustedRating],
              ["Lower", row.lowerBound],
              ["Why", row.explanation],
            ];

      columns.forEach(([label, value], index) => {
        const cell = document.createElement(index === 1 ? "th" : "td");
        cell.textContent = String(value);
        cell.dataset.label = String(label);
        if (label === "Move") {
          cell.classList.add("rank-delta", `rank-delta-${row.deltaTone}`);
        }
        if (label === "Why") {
          cell.classList.add("reason-cell");
        }
        if (index === 1) {
          cell.setAttribute("scope", "row");
        }
        tr.append(cell);
      });
      return tr;
    }),
  );
}

function renderDefinitionList(list: HTMLDListElement, rows: Array<[string, string]>) {
  list.replaceChildren(
    ...rows.flatMap(([term, description]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      return [dt, dd];
    }),
  );
}

function renderNotes(notes: string[]) {
  notesList.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      return item;
    }),
  );
}

function showError(message: string) {
  errorBox.hidden = false;
  errorBox.textContent = message;
  resultsContent.hidden = true;
  settingsSummary.textContent = "Fix the input and run the comparison again.";
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function resetResults(message: string) {
  hideError();
  resultsContent.hidden = true;
  settingsSummary.textContent = message;
}

function runRanking({ allowEmpty = false }: { allowEmpty?: boolean } = {}) {
  try {
    syncEntryInputBounds();
    hideError();
    const options = readOptions();
    const items = readEntryItems(
      { scaleMin: options.scaleMin ?? 1, scaleMax: options.scaleMax ?? 5 },
      { allowEmpty },
    );
    if (!items) {
      return;
    }
    const result = rankItems(items, options);
    const viewModel = createRankingViewModel(result);

    recommendationText.textContent = viewModel.recommendation;
    renderRows(conservativeBody, viewModel.conservativeRows, "conservative");
    renderRows(balancedBody, viewModel.balancedRows, "balanced");
    renderDefinitionList(settingsList, viewModel.settings);
    renderNotes(viewModel.notes);
    settingsSummary.textContent = `${items.length} options ranked`;
    resultsContent.hidden = false;
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not rank these options.");
  }
}

clearButton.addEventListener("click", () => {
  renderEntryRows(Array.from({ length: emptyRows }, () => ({})));
  resetResults("Add options to calculate ranks.");
  entryInputs(entryRows.rows[0]).name?.focus();
});

rankButton.addEventListener("click", () => runRanking());
addRowButton.addEventListener("click", () => {
  addEntryRow();
  runRanking({ allowEmpty: true });
});
scaleMinInput.addEventListener("input", () => runRanking({ allowEmpty: true }));
scaleMaxInput.addEventListener("input", () => runRanking({ allowEmpty: true }));

entryRows.addEventListener("input", () => runRanking({ allowEmpty: true }));
entryRows.addEventListener("click", (event) => {
  const removeButton = (event.target as HTMLElement).closest<HTMLButtonElement>(".row-remove");
  if (!removeButton) {
    return;
  }

  removeButton.closest("tr")?.remove();
  if (entryRows.rows.length === 0) {
    addEntryRow();
  }
  runRanking({ allowEmpty: true });
});
entryRows.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    runRanking();
  }
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    addEntryRow();
  }
});

renderEntryRows(Array.from({ length: emptyRows }, () => ({})));
resetResults("Add options to calculate ranks.");
