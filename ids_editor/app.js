const FIELDS = ["en", "fr", "es", "yaq"];
const FIELD_NAMES = { en: "English", fr: "French", es: "Spanish", yaq: "Yaq" };

let data = { words_collection: {} };
let chapters = [];
let fileName = "words.json";
let selectedChapter = "all";
let selectedId = null;
let activeField = "en";
let dirty = false;

const $ = id => document.getElementById(id);

function getCollection() {
  return data.words_collection || {};
}

function normalizeFields(fields = {}) {
  return {
    en: fields.en ?? "",
    fr: fields.fr ?? "",
    es: fields.es ?? "",
    yaq: fields.yaq ?? "X"
  };
}

function allEntries() {
  const entries = [];

  for (const [groupId, group] of Object.entries(getCollection())) {
    for (const [elementId, fields] of Object.entries(group || {})) {
      entries.push({
        groupId,
        elementId,
        id: `${groupId}.${elementId}`,
        fields: normalizeFields(fields)
      });
    }
  }

  return entries;
}

function getChapterName(groupId) {
  return chapters.find(chapter => chapter.category === groupId)?.name
    || "Unlisted chapter";
}

function setDirty() {
  dirty = true;
  $("status").textContent = "Unsaved changes";
}

async function loadChapters() {
  const response = await fetch("./chapters.json");
  if (!response.ok) {
    throw new Error(`Could not load chapters.json (${response.status})`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("chapters.json must contain an array.");
  }

  chapters = rows.map((row, index) => {
    const category = String(row.category ?? "").trim().padStart(2, "0");
    const name = String(row.name ?? "").trim();
    const elementCount = Number(row.element_count);

    if (!category || !name || !Number.isFinite(elementCount)) {
      throw new Error(
        `Chapter row ${index + 1} needs category, name, and element_count.`
      );
    }

    return { category, name, element_count: elementCount };
  });
}

function getVisibleEntries() {
  const query = $("search").value.trim().toLocaleLowerCase();
  const completeness = $("completeness").value;
  const sortBy = $("sort").value;

  const entries = allEntries().filter(entry => {
    if (selectedChapter !== "all" && entry.groupId !== selectedChapter) {
      return false;
    }

    const searchable = [entry.id, ...FIELDS.map(field => entry.fields[field])]
      .join(" ")
      .toLocaleLowerCase();

    if (query && !searchable.includes(query)) return false;

    const complete = FIELDS.every(field => {
      const value = entry.fields[field].trim();
      return value !== "" && value !== "X";
    });

    if (completeness === "missing" && complete) return false;
    if (completeness === "complete" && !complete) return false;

    return true;
  });

  entries.sort((a, b) => sortBy === "en"
    ? a.fields.en.localeCompare(b.fields.en)
    : a.id.localeCompare(b.id, undefined, { numeric: true }));

  return entries;
}

function renderChapters() {
  const list = $("chapterList");
  const query = $("chapterSearch").value.trim().toLocaleLowerCase();
  const collection = getCollection();

  list.replaceChildren();

  const allButton = document.createElement("button");
  allButton.className = `chapter ${selectedChapter === "all" ? "active" : ""}`;

  const allName = document.createElement("span");
  allName.className = "name";
  allName.textContent = "All chapters";

  const allCount = document.createElement("span");
  allCount.className = "count";
  allCount.textContent = String(allEntries().length);

  allButton.append(allName, allCount);
  allButton.onclick = () => {
    selectedChapter = "all";
    render();
  };
  list.append(allButton);

  // Use the catalogue so chapters with no entries yet still appear.
  for (const chapter of chapters) {
    if (!chapter.name.toLocaleLowerCase().includes(query)) continue;

    const actual = Object.keys(collection[chapter.category] || {}).length;

    const button = document.createElement("button");
    button.className =
      `chapter ${selectedChapter === chapter.category ? "active" : ""}`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = chapter.name;
    name.title = chapter.name;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${actual} / ${chapter.element_count}`;

    button.append(name, count);
    button.onclick = () => {
      selectedChapter = chapter.category;
      render();
    };
    list.append(button);
  }
  $("addElementButton").disabled = selectedChapter === "all";
}

function renderEntries() {
  const list = $("entryList");
  const entries = getVisibleEntries();

  $("resultCount").textContent =
    `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;

  list.replaceChildren();

  if (!entries.length) {
    list.innerHTML = '<div class="empty">No matching entries.</div>';
    $("editorArea").innerHTML =
      '<div class="empty">Select an entry to edit.</div>';
    return;
  }

  if (!entries.some(entry => entry.id === selectedId)) {
    selectedId = entries[0].id;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.className = `entry-item ${entry.id === selectedId ? "active" : ""}`;
    button.innerHTML =
      '<span class="entry-id"></span><span class="entry-label"></span>';

    button.querySelector(".entry-id").textContent = entry.id;
    button.querySelector(".entry-label").textContent =
      entry.fields.en || entry.fields.fr || entry.fields.es || "Untitled entry";

    button.onclick = () => {
      selectedId = entry.id;
      renderEntries();
    };

    list.append(button);
  }

  renderEditor(entries.find(entry => entry.id === selectedId));
}

function renderEditor(entry) {
  if (!entry) {
    $("editorArea").innerHTML =
      '<div class="empty">Select an entry to edit.</div>';
    return;
  }

  const area = $("editorArea");
  const title = entry.fields.en || entry.fields.fr || "Untitled entry";

  area.innerHTML = `
    <div class="editor">
      <div class="editor-head">
        <div>
          <div class="crumb"></div>
          <h1></h1>
        </div>
        <div class="entry-nav">
          <span class="entry-code"></span>
          <button id="prevEntry" aria-label="Previous entry">←</button>
          <button id="nextEntry" aria-label="Next entry">→</button>
        </div>
      </div>
      <div class="tabs" role="tablist" aria-label="Language fields"></div>
      <label class="field-label" id="fieldLabel" for="fieldEditor"></label>
      <textarea id="fieldEditor" spellcheck="false"></textarea>
      <div class="field-help">
        Separate multiple forms with commas. Changes are saved when you download the JSON.
      </div>
      <div class="meta">
        Chapter: <span id="chapterMeta"></span>
      </div>
    </div>`;

  area.querySelector(".crumb").textContent =
    `${getChapterName(entry.groupId)} / Entry`;
  area.querySelector("h1").textContent = title;
  area.querySelector(".entry-code").textContent = entry.id;
  area.querySelector("#chapterMeta").textContent =
    `${getChapterName(entry.groupId)} (${entry.groupId})`;

  const tabs = area.querySelector(".tabs");

  for (const field of FIELDS) {
    const button = document.createElement("button");
    button.className = `tab ${activeField === field ? "active" : ""}`;
    button.textContent = field.toUpperCase();
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(activeField === field));

    button.onclick = () => {
      activeField = field;
      renderEditor(entry);
    };

    tabs.append(button);
  }

  area.querySelector("#fieldLabel").textContent = FIELD_NAMES[activeField];

  const textarea = area.querySelector("#fieldEditor");
  textarea.value = entry.fields[activeField];

  textarea.oninput = () => {
    getCollection()[entry.groupId][entry.elementId][activeField] =
      textarea.value;

    setDirty();

    if (activeField === "en") {
      area.querySelector("h1").textContent =
        textarea.value || "Untitled entry";
    }

    renderEntryListOnly();
    renderChapters();
  };

  const entries = getVisibleEntries();
  const index = entries.findIndex(item => item.id === entry.id);

  area.querySelector("#prevEntry").disabled = index <= 0;
  area.querySelector("#nextEntry").disabled = index >= entries.length - 1;

  area.querySelector("#prevEntry").onclick = () => selectAt(index - 1, entries);
  area.querySelector("#nextEntry").onclick = () => selectAt(index + 1, entries);
}

function renderEntryListOnly() {
  const list = $("entryList");
  const entries = getVisibleEntries();

  list.replaceChildren();

  for (const entry of entries) {
    const button = document.createElement("button");
    button.className = `entry-item ${entry.id === selectedId ? "active" : ""}`;
    button.innerHTML =
      '<span class="entry-id"></span><span class="entry-label"></span>';

    button.querySelector(".entry-id").textContent = entry.id;
    button.querySelector(".entry-label").textContent =
      entry.fields.en || entry.fields.fr || entry.fields.es || "Untitled entry";

    button.onclick = () => {
      selectedId = entry.id;
      renderEntries();
    };

    list.append(button);
  }
}

function selectAt(index, entries) {
  if (index >= 0 && index < entries.length) {
    selectedId = entries[index].id;
    renderEntries();
  }
}

function render() {
  renderChapters();
  renderEntries();
  $("fileLabel").textContent = fileName;
}

function download(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  link.click();

  URL.revokeObjectURL(url);
}

function saveJson() {
  download(
    JSON.stringify(data, null, 2) + "\n",
    fileName,
    "application/json"
  );
  dirty = false;
  $("status").textContent = "JSON downloaded";
}

function csvCell(value, delimiter) {
  const text = String(value ?? "");

  return /["\r\n]/.test(text) || text.includes(delimiter)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function exportDelimited(delimiter, extension) {
  const rows = [["id", "group_id", "element_id", ...FIELDS]];

  for (const entry of getVisibleEntries()) {
    rows.push([
      entry.id,
      entry.groupId,
      entry.elementId,
      ...FIELDS.map(field => entry.fields[field])
    ]);
  }

  const content = rows
    .map(row => row.map(cell => csvCell(cell, delimiter)).join(delimiter))
    .join("\r\n");

  download(
    "\uFEFF" + content,
    `words.${extension}`,
    "text/plain;charset=utf-8"
  );

  $("status").textContent = `${extension.toUpperCase()} exported`;
}

function convertToGrouped(parsed) {
  if (parsed?.words_collection && !Array.isArray(parsed.words_collection)) {
    return parsed;
  }

  const rows = Array.isArray(parsed) ? parsed : parsed?.words_collection;

  if (!Array.isArray(rows)) {
    throw new Error("Expected grouped words_collection JSON or a JSON array.");
  }

  const result = {
    words_collection: {},
    ...(parsed && !Array.isArray(parsed) && parsed.chapter_names
      ? { chapter_names: parsed.chapter_names }
      : {})
  };

  for (const row of rows) {
    const id = String(row.id || `${row.group_id}.${row.element_id}`);
    const match = id.match(/^(\d+)\.(\d+)$/);

    if (!match) throw new Error(`Invalid entry ID: ${id}`);

    const [, groupId, elementId] = match;
    result.words_collection[groupId] ??= {};
    result.words_collection[groupId][elementId] = normalizeFields(row);
  }

  return result;
}

function openJsonFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      data = convertToGrouped(JSON.parse(reader.result));
      fileName = file.name;
      selectedChapter = "all";
      selectedId = null;
      dirty = false;
      $("status").textContent = "JSON loaded";
      render();
    } catch (error) {
      alert(`Could not load JSON: ${error.message}`);
    }
  };

  reader.readAsText(file);
}

function addElement() {
  if (selectedChapter === "all") {
    $("status").textContent = "Select a chapter before adding an element.";
    return;
  }

  const chapter = chapters.find(item => item.category === selectedChapter);
  if (!chapter) {
    $("status").textContent = "Chapter is missing from chapters.json.";
    return;
  }

  const group = getCollection()[selectedChapter] || {};
  const maximum = chapter.element_count;

  // Find the first unused three-digit ID within this chapter's allowed range.
  let nextNumber = 1;
  while (nextNumber <= maximum && group[String(nextNumber).padStart(3, "0")]) {
    nextNumber++;
  }

  if (nextNumber > maximum || nextNumber > 999) {
    $("status").textContent =
      `${chapter.name} is full; its limit is ${maximum} elements.`;
    return;
  }

  const elementId = String(nextNumber).padStart(3, "0");

  data.words_collection ??= {};
  data.words_collection[selectedChapter] ??= {};
  data.words_collection[selectedChapter][elementId] = {
    en: "",
    fr: "",
    es: "",
    yaq: "X"
  };

  selectedId = `${selectedChapter}.${elementId}`;
  activeField = "en";
  setDirty();
  render();
  $("fieldEditor")?.focus();
}

$("openButton").onclick = () => $("fileInput").click();

$("fileInput").onchange = event => {
  const file = event.target.files[0];
  if (file) openJsonFile(file);
  event.target.value = "";
};

$("saveButton").onclick = saveJson;

$("exportButton").onclick = () => {
  const choice = prompt("Export as CSV or TSV?", "CSV");
  if (!choice) return;

  const format = choice.trim().toLowerCase();

  if (format === "csv") exportDelimited(",", "csv");
  else if (format === "tsv") exportDelimited("\t", "tsv");
  else alert("Enter CSV or TSV.");
};

$("search").oninput = renderEntries;
$("completeness").onchange = renderEntries;
$("sort").onchange = renderEntries;
$("chapterSearch").oninput = renderChapters;
$("addElementButton").onclick = addElement;

(async function start() {
  try {
    await loadChapters();
    $("status").textContent = "Chapters loaded. Open a JSON file to begin.";
  } catch (error) {
    $("status").textContent = error.message;
  }

  render();
})();
