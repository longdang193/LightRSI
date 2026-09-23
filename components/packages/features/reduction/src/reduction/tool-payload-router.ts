import {
  classifyToolPayloadContentWithHint,
  type ToolPayloadClassification,
  type ToolPayloadContentType,
  type ToolPayloadHint,
} from "./content-classifier.js";
import {
  inferJsonAnchorPattern,
  selectJsonArrayAnchorIndices,
} from "./json-anchor-selector.js";
import { resourceKey } from "./resource-key.js";

export type ToolPayloadKind = "stdout" | "stderr" | "json" | "blob";

export type PayloadBlockConfig = {
  enabled: boolean;
  maxChars: number;
  keepHeadLines: number;
  keepTailLines: number;
  maxPreviewChars: number;
  maxItems: number;
  maxDepth: number;
};

export type ToolPayloadRouteConfig = {
  stdout: PayloadBlockConfig;
  stderr: PayloadBlockConfig;
  json: PayloadBlockConfig;
  blob: PayloadBlockConfig;
};

export type ToolPayloadReductionResult = {
  text: string;
  changed: boolean;
  route: ToolPayloadContentType;
  reason: string;
};

type ToolPayloadRoutingContext = {
  queryText?: string;
  previouslyReadPaths?: Set<string>;
};

function scaleBlockConfig(
  cfg: PayloadBlockConfig,
  factor: number,
): PayloadBlockConfig {
  const scaledMaxChars = Math.max(120, Math.floor(cfg.maxChars * factor));
  const scaledHead = Math.max(1, Math.floor(cfg.keepHeadLines * factor));
  const scaledTail = Math.max(1, Math.floor(cfg.keepTailLines * factor));
  const scaledItems = Math.max(1, Math.floor(cfg.maxItems * factor));
  const scaledPreview = Math.max(48, Math.floor(cfg.maxPreviewChars * Math.max(0.7, factor)));
  return {
    ...cfg,
    maxChars: scaledMaxChars,
    keepHeadLines: scaledHead,
    keepTailLines: scaledTail,
    maxItems: scaledItems,
    maxPreviewChars: scaledPreview,
  };
}

type SearchMatch = {
  file: string;
  lineNumber: number;
  columnNumber?: number;
  content: string;
  score: number;
};

type DiffFileSummary = {
  file: string;
  oldFile?: string;
  newFile?: string;
  status?: string;
  additions: number;
  deletions: number;
  hunks: number;
  hunkHeaders: string[];
  metadata: string[];
  preview: string[];
};

type CodeLineEntry = {
  lineNumber: number;
  text: string;
};

type CodeOutlineEntry = {
  lineNumber: number;
  signature: string;
  docLine?: string;
};

const LOG_IMPORTANCE_RE = /\b(error|warn(?:ing)?|failed|exception|traceback|panic|fatal|denied|timeout)\b/i;
const STACK_TRACE_RE = /^\s*(at\s+\S+\s+\(|Traceback \(most recent call last\):|Caused by:|File ".*", line \d+)/;
const DIFF_FILE_RE = /^\+\+\+ b\/(.+)$/;
const DIFF_GIT_RE = /^diff --git a\/(.+) b\/(.+)$/;
const DIFF_HUNK_RE = /^@@/;
const DIFF_CHANGE_RE = /^[+-][^+-]/;
const CODE_IMPORT_RE = /^\s*(import\s.+|from\s+\S+\s+import\s+.+|const\s+\w+\s*=\s*require\(.+\)|using\s+\S+.*)$/;
const CODE_SYMBOL_RE =
  /^\s*(export\s+)?(async\s+)?(function|class|def|interface|type|const\s+\w+\s*=\s*\(|let\s+\w+\s*=\s*\(|var\s+\w+\s*=\s*\()|^\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/;
const CODE_ALERT_RE = /\b(throw\s+new|throw\s+|catch\s*\(|Error\b|Exception\b|TODO\b|FIXME\b|panic!\b|console\.(error|warn)\b)\b/;
const NUMBERED_CODE_LINE_RE = /^\s*\d+\s*(?:[|:]\s*|\t|\s{2,})(.+)$/;
const CODE_DOC_RE = /^\s*(?:\/\*\*|\/\/|#|"""|''')/;
const CODE_RANGE_HINT_RE = /\b(offset|limit|start[_-]?line|end[_-]?line|line[_-]?range|ranges)\b/i;
const MARKDOWN_HEADING_RE = /^\s{0,3}#{1,6}\s+\S+/;
const MARKDOWN_LIST_RE = /^\s*(?:[-*+]|\d+\.)\s+\S+/;
const TASK_DOC_KEYWORD_RE = /\b(todo|task|plan|next step|acceptance criteria|deliverable|milestone|checklist)\b/i;

function clipText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function summarizeLineBlock(
  text: string,
  label: string,
  cfg: PayloadBlockConfig,
): string {
  if (text.length <= cfg.maxChars) return text;

  const lines = text.split("\n");
  const head = lines.slice(0, cfg.keepHeadLines);
  const tail = lines.slice(-cfg.keepTailLines);
  const omittedLineCount = Math.max(0, lines.length - head.length - tail.length);
  const summaryLine = `...[${label} reduced lines=${omittedLineCount} chars=${text.length}]`;
  const nextLines = [...head];
  if (omittedLineCount > 0 || text.length > cfg.maxChars) nextLines.push(summaryLine);
  if (tail.length > 0) nextLines.push(...tail);
  return nextLines.join("\n").trim();
}

function summarizeJsonValue(
  value: unknown,
  depth: number,
  maxDepth: number,
  maxItems: number,
  maxPreviewChars: number,
): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return clipText(value, maxPreviewChars);
  if (depth >= maxDepth) {
    if (Array.isArray(value)) return `[array:${value.length}]`;
    return "[object]";
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      preview: value
        .slice(0, maxItems)
        .map((item) => summarizeJsonValue(item, depth + 1, maxDepth, maxItems, maxPreviewChars)),
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      keyCount: entries.length,
      preview: Object.fromEntries(
        entries
          .slice(0, maxItems)
          .map(([key, item]) => [
            key,
            summarizeJsonValue(item, depth + 1, maxDepth, maxItems, maxPreviewChars),
          ]),
      ),
    };
  }
  return String(value);
}

function summarizeDroppedJsonItems(
  items: unknown[],
  keptIndices: Set<number>,
  maxCategories: number,
): string[] {
  if (items.length <= keptIndices.size) return [];
  const dropped = items.filter((_item, index) => !keptIndices.has(index));
  const categoryCounts = new Map<string, number>();
  for (const item of dropped) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const candidates = [
      record.type,
      record.kind,
      record.status,
      record.level,
      record.category,
      record.result,
      record.outcome,
    ];
    const raw = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
    const label = typeof raw === "string" ? raw.trim() : "other";
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
  }
  return [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCategories)
    .map(([label, count]) => `${count} ${label}`);
}

function summarizeJsonText(text: string, cfg: PayloadBlockConfig): string {
  return summarizeJsonTextWithContext(text, cfg);
}

function minifyJsonLossless(text: string, maxChars: number): string | undefined {
  let inString = false;
  let escaped = false;
  let output = "";
  for (const character of text) {
    if (inString) {
      output += character;
      if (output.length > maxChars) return undefined;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (/\s/.test(character)) continue;
    output += character;
    if (output.length > maxChars) return undefined;
    if (character === '"') inString = true;
  }
  return inString ? undefined : output;
}

function summarizeJsonTextWithContext(
  text: string,
  cfg: PayloadBlockConfig,
  context?: ToolPayloadRoutingContext,
  parsedOverride?: unknown,
): string {
  try {
    const parsed = parsedOverride ?? JSON.parse(text);
    const minified = minifyJsonLossless(text, cfg.maxChars);
    if (minified) {
      return minified;
    }

    if (Array.isArray(parsed)) {
      const keptIndices = new Set(
        selectJsonArrayAnchorIndices(parsed, {
          maxItems: cfg.maxItems,
          pattern: inferJsonAnchorPattern(parsed),
          queryText: context?.queryText,
          dedupIdenticalItems: true,
          useInformationDensity: true,
        }),
      );
      const keptItems = [...keptIndices]
        .sort((a, b) => a - b)
        .map((index) => parsed[index]);
      const omittedCategories = summarizeDroppedJsonItems(parsed, keptIndices, 5);
      const summary = {
        reduced: "json_array",
        originalChars: text.length,
        originalItems: parsed.length,
        keptItems: keptItems.length,
        omittedItems: Math.max(0, parsed.length - keptItems.length),
        keptIndices: [...keptIndices].sort((a, b) => a - b),
        omittedSummary: omittedCategories,
        preview: keptItems.map((item) =>
          summarizeJsonValue(item, 1, cfg.maxDepth, cfg.maxItems, cfg.maxPreviewChars)),
      };
      return JSON.stringify(summary, null, 2);
    }

    const summary = {
      reduced: "json_object",
      originalChars: text.length,
      summary: summarizeJsonValue(parsed, 0, cfg.maxDepth, cfg.maxItems, cfg.maxPreviewChars),
    };
    return JSON.stringify(summary, null, 2);
  } catch {
    return summarizeLineBlock(text, "json", cfg);
  }
}

function summarizeWebResultJson(
  parsed: unknown,
  originalText: string,
  cfg: PayloadBlockConfig,
  context?: ToolPayloadRoutingContext,
): string | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  const results = Array.isArray(obj.results) ? obj.results : undefined;
  const answer = typeof obj.answer === "string" ? obj.answer : undefined;
  if (!results && !answer) return undefined;

  const selectedResultIndices = Array.isArray(results)
    ? selectJsonArrayAnchorIndices(results, {
        maxItems: Math.max(1, Math.min(cfg.maxItems, 5)),
        pattern: "search_results",
        queryText: context?.queryText,
        dedupIdenticalItems: true,
        useInformationDensity: true,
      })
    : [];

  const anchoredResultsPreview = selectedResultIndices.map((index) => {
      const item = results?.[index];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return summarizeJsonValue(item, 1, cfg.maxDepth, cfg.maxItems, cfg.maxPreviewChars);
      }
      const record = item as Record<string, unknown>;
      return {
        title: typeof record.title === "string" ? clipText(record.title, cfg.maxPreviewChars) : undefined,
        url: typeof record.url === "string" ? clipText(record.url, cfg.maxPreviewChars) : undefined,
        score: typeof record.score === "number" ? record.score : undefined,
        contentPreview:
          typeof record.content === "string"
            ? clipText(record.content, cfg.maxPreviewChars)
            : undefined,
      };
    });

  return JSON.stringify({
    reduced: "web_result_json",
    originalChars: originalText.length,
    answerPreview: answer ? clipText(answer, cfg.maxPreviewChars * 2) : undefined,
    resultCount:
      typeof obj.result_count === "number"
        ? obj.result_count
        : results?.length,
    responseTime:
      typeof obj.response_time === "number"
        ? obj.response_time
        : undefined,
    resultIndices: selectedResultIndices,
    resultsPreview: anchoredResultsPreview,
  }, null, 2);
}

function summarizeBlobText(text: string, cfg: PayloadBlockConfig): string {
  const trimmed = text.trim();
  const preview = clipText(trimmed.replace(/\s+/g, ""), cfg.maxPreviewChars);
  let blobKind = "blob";
  if (trimmed.startsWith("data:")) blobKind = "data_url";
  else if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) blobKind = "base64";
  else if (/^[A-Fa-f0-9\s]+$/.test(trimmed)) blobKind = "hex";

  return `[${blobKind} reduced chars=${trimmed.length} preview=${preview}]`;
}

function parseSearchMatches(text: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(.+?):(\d+)(?::(\d+))?\s*(?:-|:)\s*(.*)$/);
    if (!match) continue;
    const file = match[1].trim();
    const lineNumber = Number.parseInt(match[2], 10);
    const columnNumber = match[3] ? Number.parseInt(match[3], 10) : undefined;
    const content = match[4].trim();
    if (!file || !Number.isFinite(lineNumber)) continue;
    let score = 1;
    if (LOG_IMPORTANCE_RE.test(content)) score += 3;
    if (/todo|fixme|bug|error|fail|warning/i.test(content)) score += 2;
    if (content.length > 120) score += 1;
    matches.push({ file, lineNumber, columnNumber, content, score });
  }
  return matches;
}

function summarizeSearchResults(text: string, cfg: PayloadBlockConfig): string {
  if (text.length <= cfg.maxChars) return text;
  const matches = parseSearchMatches(text);
  if (matches.length < 3) {
    return summarizeLineBlock(text, "search_results", cfg);
  }

  const grouped = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const bucket = grouped.get(match.file) ?? [];
    bucket.push(match);
    grouped.set(match.file, bucket);
  }

  const rankedFiles = [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, cfg.maxItems);

  const lines: string[] = [];
  for (const [file, fileMatches] of rankedFiles) {
    const first = fileMatches.reduce((min, item) => item.lineNumber < min.lineNumber ? item : min, fileMatches[0]);
    const last = fileMatches.reduce((max, item) => item.lineNumber > max.lineNumber ? item : max, fileMatches[0]);
    const highSignal = [...fileMatches]
      .sort((a, b) => b.score - a.score || a.lineNumber - b.lineNumber)
      .slice(0, Math.max(1, Math.min(2, cfg.keepHeadLines)));
    const selectedMap = new Map<number, SearchMatch>();
    selectedMap.set(first.lineNumber, first);
    selectedMap.set(last.lineNumber, last);
    for (const item of highSignal) selectedMap.set(item.lineNumber, item);
    const selected = [...selectedMap.values()].sort((a, b) => a.lineNumber - b.lineNumber);
    lines.push(`${file} (${fileMatches.length} matches)`);
    for (const item of selected) {
      const location = item.columnNumber == null
        ? `${item.lineNumber}`
        : `${item.lineNumber}:${item.columnNumber}`;
      lines.push(`  ${location}: ${clipText(item.content, cfg.maxPreviewChars)}`);
    }
  }
  const displayedMatches = rankedFiles.reduce((sum, [, fileMatches]) => {
    const selected = new Map<number, SearchMatch>();
    const first = fileMatches.reduce((min, item) => item.lineNumber < min.lineNumber ? item : min, fileMatches[0]);
    const last = fileMatches.reduce((max, item) => item.lineNumber > max.lineNumber ? item : max, fileMatches[0]);
    selected.set(first.lineNumber, first);
    selected.set(last.lineNumber, last);
    for (const item of [...fileMatches]
      .sort((a, b) => b.score - a.score || a.lineNumber - b.lineNumber)
      .slice(0, Math.max(1, Math.min(2, cfg.keepHeadLines)))) {
      selected.set(item.lineNumber, item);
    }
    return sum + selected.size;
  }, 0);
  const totalFiles = grouped.size;
  const displayedFiles = rankedFiles.length;
  const omittedFiles = Math.max(0, totalFiles - displayedFiles);
  const omittedMatches = Math.max(0, matches.length - displayedMatches);
  lines.push(`[search results reduced] total_files=${totalFiles} displayed_files=${displayedFiles} omitted_files=${omittedFiles} total_matches=${matches.length} displayed_matches=${displayedMatches} omitted_matches=${omittedMatches}`);
  return lines.join("\n");
}

function summarizeLogOutput(text: string, cfg: PayloadBlockConfig): string {
  if (text.length <= cfg.maxChars) return text;
  const lines = text.split("\n");
  const capacity = Math.max(8, cfg.maxItems * 4);
  const severity = (line: string): number => {
    if (/\bfatal|panic|exception|traceback\b/i.test(line)) return 4;
    if (/\bfailed|error|denied|timeout\b/i.test(line)) return 3;
    return 2;
  };
  const failureBlocks = new Map<string, { lines: string[]; firstIndex: number; score: number; occurrences: number }>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\b(error|failed|exception|traceback|panic|fatal|denied|timeout)\b/i.test(line)) continue;
    let start = index;
    while (start > 0 && /^\s*(?:not ok|FAIL|✖|test\b)/i.test(lines[start - 1])) start -= 1;
    const blockLines = [
      ...(start < index ? [lines[start]] : []),
      line,
      ...lines.slice(index + 1, index + 4).filter((frame) => /^\s+/.test(frame)),
    ];
    const key = line.trim().replace(/\s+/g, " ").toLowerCase();
    const existing = failureBlocks.get(key);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }
    failureBlocks.set(key, {
      lines: blockLines,
      firstIndex: start,
      score: severity(line),
      occurrences: 1,
    });
  }
  const selected = [...failureBlocks.values()]
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex)
    .slice(0, Math.max(2, cfg.maxItems));
  const selectedKeys = new Set(selected.flatMap((block) => block.lines.map((line) => line.trim())));
  const statusLines: string[] = [];
  for (const line of lines) {
    if (/\b(summary|completed|exit code|duration|elapsed|passed|failed)\b/i.test(line) && !selectedKeys.has(line.trim())) {
      if (!statusLines.includes(line)) statusLines.push(line);
    }
  }
  const header = lines.slice(0, Math.min(cfg.keepHeadLines, 6));
  const tail = lines.slice(-Math.min(cfg.keepTailLines, 6));
  const renderedFailures = selected
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .flatMap((block) => [
      ...block.lines.slice(0, 1),
      `${block.lines[block.lines.length > 1 ? 1 : 0]}${block.occurrences > 1 ? ` [Occurrences: ${block.occurrences}]` : ""}`,
      ...block.lines.slice(2),
    ]);
  const rendered = [...renderedFailures, ...statusLines].slice(0, capacity);
  const merged = [
    ...header,
    `...[log reduced important_lines=${rendered.length} total_lines=${lines.length}]`,
    ...rendered,
    ...tail,
  ];
  return merged.join("\n").trim();
}

function summarizeNodeTestOutput(
  text: string,
  cfg: PayloadBlockConfig,
  hint: ToolPayloadHint,
): string | undefined {
  const lines = text.split("\n");
  const tapTestLine = /^\s{0,2}(?:not )?ok\b/i;
  const tapStatusLine = /^\s*(?:TAP version|1\.\.\d+|# (?:tests|pass|fail|cancelled|skipped|todo|duration)\b)/i;
  const tapEvidenceLine = /^\s{2,}(location|failureType|error|code|stack|operator|expected|actual|duration_ms):\s*(.*)$/i;
  const tapContinuationLine = /^\s{4,}\S/;
  const signalCount = lines.filter((line) => tapTestLine.test(line) || tapStatusLine.test(line)).length;
  if (signalCount < 2) return undefined;

  const selected: string[] = [];
  const failures = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*not ok\b/i.test(line))
    .slice(0, Math.max(2, cfg.maxItems));
  for (const failure of failures) {
    const block: string[] = [];
    const pendingContinuation: string[] = [];
    const flushPendingContinuation = () => {
      if (pendingContinuation.length === 0) return;
      block.push(...pendingContinuation.slice(0, 8));
      const omitted = pendingContinuation.length - 8;
      if (omitted > 0) block.push(`[continuation lines omitted: ${omitted}; exact recovery available]`);
      pendingContinuation.length = 0;
    };
    block.push(failure.line);
    for (let index = failure.index + 1; index < lines.length; index += 1) {
      if (tapTestLine.test(lines[index]) || tapStatusLine.test(lines[index])) break;
      const field = lines[index].match(tapEvidenceLine);
      if (!field) {
        if (tapContinuationLine.test(lines[index])) pendingContinuation.push(lines[index]);
        continue;
      }
      flushPendingContinuation();
      const label = field[1].toLowerCase();
      const value = field[2].trim();
      if (!value && (label === "expected" || label === "actual")) {
        block.push(`[${label} value omitted; exact recovery available]`);
        continue;
      }
      const fieldLines = [lines[index]];
      const continuation: string[] = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        if (tapTestLine.test(lines[nextIndex]) || tapStatusLine.test(lines[nextIndex]) || tapEvidenceLine.test(lines[nextIndex])) break;
        if (tapContinuationLine.test(lines[nextIndex])) continuation.push(lines[nextIndex]);
        nextIndex += 1;
      }
      fieldLines.push(...continuation.slice(0, 8));
      if (continuation.length > 8) {
        fieldLines.push(`[${label} continuation lines omitted: ${continuation.length - 8}; exact recovery available]`);
      }
      block.push(...fieldLines);
      index = nextIndex - 1;
    }
    flushPendingContinuation();
    selected.push(...block);
  }
  const status = [...new Set(lines.filter((line) => tapStatusLine.test(line)))];
  const result = [
    ...status.slice(0, 1),
    ...selected,
    ...status.slice(1),
    formatExecutionEvidence(hint),
  ];
  return result.length > 1 ? result.join("\n") : undefined;
}

function formatExecutionEvidence(hint: ToolPayloadHint): string {
  const completion = hint.execution?.completion ?? "unknown";
  const exitCode = typeof hint.execution?.exitCode === "number"
    ? hint.execution.exitCode
    : "unavailable";
  return `Execution: ${completion}; exit code: ${exitCode}`;
}

function summarizeTypeScriptDiagnostics(
  text: string,
  cfg: PayloadBlockConfig,
  hint: ToolPayloadHint,
): string | undefined {
  const lines = text.split("\n");
  const diagnosticRe = /^(.+?)(?:\((\d+),(\d+)\)|:(\d+):(\d+)):\s*(error|warning)\s+(TS\d+):\s*(.*)$/i;
  const diagnosticStatusRe = /^(?:Found \d+ errors?|error TS\d+|warning TS\d+)\b/i;
  const diagnostics = new Map<string, { lines: string[]; count: number }>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(diagnosticRe);
    if (!match) continue;
    const file = match[1].trim();
    const row = match[2] ?? match[4] ?? "?";
    const column = match[3] ?? match[5] ?? "?";
    const code = match[7].toUpperCase();
    const message = match[8].trim();
    const key = `${file}:${row}:${column}:${code}:${message}`;
    const existing = diagnostics.get(key);
    if (existing) existing.count += 1;
    else {
      const continuation: string[] = [];
      for (let next = index + 1; next < Math.min(lines.length, index + 9); next += 1) {
        if (lines[next].match(diagnosticRe) || diagnosticStatusRe.test(lines[next])) break;
        if (lines[next].trim()) continuation.push(lines[next]);
      }
      diagnostics.set(key, {
        lines: [
          `${file}(${row},${column}): ${match[6].toLowerCase()} ${code}: ${clipText(message, cfg.maxPreviewChars * 2)}`,
          ...continuation,
        ],
        count: 1,
      });
    }
  }
  if (diagnostics.size === 0) return undefined;
  const status = [...new Set(lines.filter((line) => diagnosticStatusRe.test(line)))];
  const output = [
    ...[...diagnostics.values()].slice(0, Math.max(2, cfg.maxItems)).flatMap(({ lines: diagnosticLines, count }) => [
      `${diagnosticLines[0]}${count > 1 ? ` [Occurrences: ${count}]` : ""}`,
      ...diagnosticLines.slice(1),
    ]),
    ...status.slice(-2),
    formatExecutionEvidence(hint),
  ];
  return output.join("\n");
}

function summarizeMarkdownDoc(text: string, cfg: PayloadBlockConfig): string {
  if (text.length <= cfg.maxChars) return text;
  const lines = text.split("\n");
  const selected: string[] = [];
  let headingCount = 0;
  let bulletCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (MARKDOWN_HEADING_RE.test(line)) {
      selected.push(trimmed);
      headingCount += 1;
      continue;
    }
    if (MARKDOWN_LIST_RE.test(line) && bulletCount < Math.max(4, cfg.maxItems * 2)) {
      selected.push(trimmed);
      bulletCount += 1;
    }
  }

  const head = lines.slice(0, Math.min(cfg.keepHeadLines, 6)).filter((line) => line.trim().length > 0);
  return [
    `[markdown reduced headings=${headingCount} bullets=${bulletCount} total_lines=${lines.length}]`,
    ...head,
    ...selected.slice(0, Math.max(6, cfg.maxItems * 3)),
  ].join("\n").trim();
}

function summarizeTaskDoc(text: string, cfg: PayloadBlockConfig): string {
  if (text.length <= cfg.maxChars) return text;
  const lines = text.split("\n");
  const selected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (MARKDOWN_HEADING_RE.test(line) || MARKDOWN_LIST_RE.test(line) || TASK_DOC_KEYWORD_RE.test(line)) {
      selected.push(trimmed);
    }
    if (selected.length >= Math.max(8, cfg.maxItems * 3)) break;
  }
  return [
    `[task doc reduced highlights=${selected.length} total_lines=${lines.length}]`,
    ...selected,
  ].join("\n").trim();
}

function looksLikeExplicitRangeIntent(text: string, hint: ToolPayloadHint | undefined): boolean {
  if (hint?.readWindow && (hint.readWindow.offset != null || hint.readWindow.limit != null)) return true;
  const path = hint?.path?.trim().toLowerCase() ?? "";
  if (CODE_RANGE_HINT_RE.test(path)) return true;
  const sample = text.slice(0, 400).toLowerCase();
  if (/^\s*\d+\s*[:|-]/m.test(sample) && /read specific line range|specific line range|line range requested/i.test(sample)) {
    return true;
  }
  return false;
}

function extractCodeOutlineEntries(lines: string[], cfg: PayloadBlockConfig): CodeOutlineEntry[] {
  const entries: CodeOutlineEntry[] = [];
  const seenLines = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed || !CODE_SYMBOL_RE.test(trimmed)) continue;
    if (seenLines.has(index)) continue;
    seenLines.add(index);

    let docLine: string | undefined;
    let probe = index + 1;
    while (probe < lines.length && !(lines[probe]?.trim() ?? "")) probe += 1;
    if (probe < lines.length && CODE_DOC_RE.test(lines[probe]?.trim() ?? "")) {
      docLine = clipText(lines[probe].trim(), cfg.maxPreviewChars * 2);
    }

    entries.push({
      lineNumber: index + 1,
      signature: clipText(trimmed, cfg.maxPreviewChars * 2),
      docLine,
    });
    if (entries.length >= Math.max(6, cfg.maxItems * 2)) break;
  }

  return entries;
}

function summarizeCodeLike(
  text: string,
  cfg: PayloadBlockConfig,
  hint?: ToolPayloadHint,
  context?: ToolPayloadRoutingContext,
): string {
  if (text.length <= cfg.maxChars) return text;
  const lines = text.split("\n");
  const imports: CodeLineEntry[] = [];
  const alerts: CodeLineEntry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (CODE_IMPORT_RE.test(trimmed) && imports.length < Math.max(4, cfg.maxItems)) {
      imports.push({ lineNumber: index + 1, text: trimmed });
      continue;
    }
    if (CODE_ALERT_RE.test(trimmed) && alerts.length < Math.max(3, cfg.maxItems)) {
      alerts.push({ lineNumber: index + 1, text: trimmed });
    }
  }

  const outlineEntries = extractCodeOutlineEntries(lines, cfg);
  if (outlineEntries.length === 0 && imports.length === 0 && alerts.length === 0) {
    return summarizeLineBlock(text, "code", cfg);
  }

  const repeatedRead = Boolean(
    hint?.path
    && context?.previouslyReadPaths?.has(resourceKey(hint.path)),
  );
  const headerNote = looksLikeExplicitRangeIntent(text, hint)
    ? "explicit_range_hint_detected"
    : repeatedRead
      ? "repeat_read_detected"
      : "bodies_elided";

  const summary = [
    `[code outlined lines=${lines.length} imports=${imports.length} definitions=${outlineEntries.length} alerts=${alerts.length} mode=${headerNote}]`,
    ...(imports.length > 0
      ? [
          "imports:",
          ...imports.slice(0, Math.max(4, cfg.maxItems)).map((entry) => `  ${entry.lineNumber}: ${clipText(entry.text, cfg.maxPreviewChars)}`),
        ]
      : []),
    ...(outlineEntries.length > 0
      ? [
          "[outlined definitions; re-read with a line range to inspect a specific body]",
          ...outlineEntries.map((entry) => entry.signature),
          ...outlineEntries.flatMap((entry) => entry.docLine ? [entry.docLine] : []),
          ...outlineEntries.map(() => "    # ... (body elided by LightRSI; request a specific line range to inspect it)"),
        ]
      : []),
    ...(alerts.length > 0
      ? [
          "alerts:",
          ...alerts.slice(0, Math.max(3, cfg.maxItems)).map((entry) => `  ${entry.lineNumber}: ${clipText(entry.text, cfg.maxPreviewChars)}`),
        ]
      : []),
  ];
  return summary.join("\n").trim();
}

function looksLikeControlledCodeRead(text: string, hint: ToolPayloadHint | undefined): boolean {
  const lines = text.split("\n");
  const toolName = hint?.toolName?.trim().toLowerCase();
  const path = hint?.path?.trim().toLowerCase();
  const pathLooksCode = path != null && /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h|hpp|scala)$/i.test(path);
  const hasExplicitReadWindow = hint?.readWindow && (hint.readWindow.offset != null || hint.readWindow.limit != null);

  if (hasExplicitReadWindow && (pathLooksCode || toolName === "read" || toolName === "file_read")) {
    return true;
  }

  if (lines.length < 4 || lines.length > 160) return false;
  let numbered = 0;
  let codeish = 0;
  for (const line of lines) {
    const numberedMatch = line.match(NUMBERED_CODE_LINE_RE);
    const content = numberedMatch ? numberedMatch[1] : line;
    if (numberedMatch) numbered += 1;
    if (CODE_IMPORT_RE.test(content) || CODE_SYMBOL_RE.test(content) || /[{}();]/.test(content)) {
      codeish += 1;
    }
  }

  if (
    numbered >= Math.max(4, Math.floor(lines.length * 0.45))
    && codeish >= Math.max(4, Math.floor(lines.length * 0.3))
    && (pathLooksCode
      || toolName === "bash"
      || toolName === "shell"
      || toolName === "powershell"
      || toolName === "exec"
      || toolName === "read"
      || toolName === "file_read")
  ) {
    return true;
  }

  return codeish >= Math.max(6, Math.floor(lines.length * 0.5))
    && pathLooksCode
    && (toolName === "bash" || toolName === "shell" || toolName === "powershell" || toolName === "exec");
}

function summarizeDiffOutput(text: string, cfg: PayloadBlockConfig): string {
  if (text.length <= cfg.maxChars) return text;
  const lines = text.split("\n");
  const files = new Map<string, DiffFileSummary>();
  let currentFile = "unknown";

  for (const line of lines) {
    const gitMatch = line.match(DIFF_GIT_RE);
    if (gitMatch) {
      currentFile = gitMatch[2];
      files.set(currentFile, {
        file: currentFile,
        oldFile: gitMatch[1],
        newFile: gitMatch[2],
        additions: 0,
        deletions: 0,
        hunks: 0,
        hunkHeaders: [],
        metadata: [],
        preview: [],
      });
      continue;
    }
    const fileMatch = line.match(DIFF_FILE_RE);
    if (fileMatch) {
      currentFile = fileMatch[1].trim();
      if (!files.has(currentFile)) {
        files.set(currentFile, {
          file: currentFile,
          newFile: currentFile,
          additions: 0,
          deletions: 0,
          hunks: 0,
          hunkHeaders: [],
          metadata: [],
          preview: [],
        });
      }
      files.get(currentFile)!.newFile = currentFile;
      continue;
    }

    const summary = files.get(currentFile);
    if (!summary) continue;
    if (DIFF_HUNK_RE.test(line)) {
      summary.hunks += 1;
      if (summary.hunkHeaders.length < 2) summary.hunkHeaders.push(line);
      continue;
    }
    if (line.startsWith("--- ")) {
      summary.oldFile = line.slice(4).trim().replace(/^a\//, "");
      if (summary.oldFile === "/dev/null") summary.status = "added";
      continue;
    }
    if (line.startsWith("+++ ")) {
      summary.newFile = line.slice(4).trim().replace(/^b\//, "");
      if (summary.newFile === "/dev/null") summary.status = "deleted";
      continue;
    }
    if (/^(similarity index|rename from|rename to|new file mode|deleted file mode|old mode|new mode|index )/.test(line)) {
      if (summary.metadata.length < 3) summary.metadata.push(line);
      if (line.startsWith("rename from ")) summary.status = "renamed";
      if (line.startsWith("rename to ")) summary.status = "renamed";
      continue;
    }
    if (DIFF_CHANGE_RE.test(line)) {
      if (line.startsWith("+")) summary.additions += 1;
      if (line.startsWith("-")) summary.deletions += 1;
      if (summary.preview.length < Math.max(2, Math.min(4, cfg.keepHeadLines))) {
        summary.preview.push(clipText(line, cfg.maxPreviewChars));
      }
    }
  }

  const ranked = [...files.values()]
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
    .slice(0, cfg.maxItems);

  if (ranked.length === 0) {
    return summarizeLineBlock(text, "diff", cfg);
  }

  const output: string[] = [
    `[diff reduced files=${files.size} displayed_files=${ranked.length} omitted_files=${Math.max(0, files.size - ranked.length)} total_lines=${lines.length} lossy=true recovery=archive_required]`,
  ];
  for (const item of ranked) {
    const identity = item.status === "renamed" && item.oldFile && item.newFile
      ? `${item.oldFile} -> ${item.newFile}`
      : item.newFile === "/dev/null" && item.oldFile
        ? `${item.oldFile} (deleted)`
        : item.file;
    output.push(`${identity} (+${item.additions} -${item.deletions}, hunks=${item.hunks}${item.status ? `, status=${item.status}` : ""})`);
    output.push(...item.metadata.map((entry) => `  ${entry}`));
    output.push(...item.hunkHeaders.map((entry) => `  ${entry}`));
    for (const previewLine of item.preview) {
      output.push(`  ${previewLine}`);
    }
  }
  return output.join("\n").trim();
}

function getBlockConfig(cfg: ToolPayloadRouteConfig, kind: ToolPayloadKind): PayloadBlockConfig {
  if (kind === "stdout") return cfg.stdout;
  if (kind === "stderr") return cfg.stderr;
  if (kind === "json") return cfg.json;
  return cfg.blob;
}

function getLifecycleAdjustedBlockConfig(
  cfg: ToolPayloadRouteConfig,
  kind: ToolPayloadKind,
  contentType: ToolPayloadContentType,
  hint?: ToolPayloadHint,
): PayloadBlockConfig {
  const base = getBlockConfig(cfg, kind);
  const readState = hint?.readState;
  if (!readState) return base;
  if (readState === "fresh") return base;

  const baseFactor = readState === "superseded" ? 0.75 : 0.55;
  let factor = baseFactor;
  if (contentType === "log_output" || contentType === "search_results") {
    factor *= 0.78;
  } else if (contentType === "code_like" || contentType === "diff_output") {
    factor = Math.max(factor, readState === "superseded" ? 0.88 : 0.72);
  } else if (contentType === "json_array" || contentType === "json_object") {
    factor *= 0.9;
  }
  return scaleBlockConfig(base, factor);
}

function reduceByClassification(
  text: string,
  kind: ToolPayloadKind,
  cfg: ToolPayloadRouteConfig,
  classification: ToolPayloadClassification,
  hint?: ToolPayloadHint,
  context?: ToolPayloadRoutingContext,
): ToolPayloadReductionResult {
  const blockCfg = getLifecycleAdjustedBlockConfig(cfg, kind, classification.contentType, hint);
  if (!blockCfg.enabled) {
    return {
      text,
      changed: false,
      route: classification.contentType,
      reason: "config_disabled",
    };
  }

  let nextText = text;
  if (hint?.execution?.commandFamily === "node_test") {
    const specialized = summarizeNodeTestOutput(text, blockCfg, hint);
    if (specialized != null) {
      return {
        text: specialized,
        changed: specialized !== text,
        route: classification.contentType,
        reason: `${classification.reason}:node_test_selector`,
      };
    }
  }
  if (hint?.execution?.commandFamily === "typescript_diagnostics") {
    const specialized = summarizeTypeScriptDiagnostics(text, blockCfg, hint);
    if (specialized != null) {
      return {
        text: specialized,
        changed: specialized !== text,
        route: classification.contentType,
        reason: `${classification.reason}:typescript_diagnostics_selector`,
      };
    }
  }
  switch (classification.contentType) {
    case "json_array":
    case "json_object":
      try {
        const parsed = classification.parsed ?? JSON.parse(text);
        const specialized =
          hint?.toolName === "web_fetch" ||
          hint?.toolName === "web_search" ||
          hint?.toolName === "tavily_search"
            ? summarizeWebResultJson(parsed, text, blockCfg, context)
            : undefined;
        nextText = specialized ?? summarizeJsonTextWithContext(text, blockCfg, context, parsed);
      } catch {
      nextText = summarizeJsonTextWithContext(text, blockCfg, context, classification.parsed);
      }
      break;
    case "search_results":
      nextText = summarizeSearchResults(text, blockCfg);
      break;
    case "log_output":
      if (hint?.execution?.commandFamily === "node_test") {
        nextText = summarizeNodeTestOutput(text, blockCfg, hint) ?? summarizeLogOutput(text, blockCfg);
      } else if (hint?.execution?.commandFamily === "typescript_diagnostics") {
        nextText = summarizeTypeScriptDiagnostics(text, blockCfg, hint) ?? summarizeLogOutput(text, blockCfg);
      } else {
        nextText = summarizeLogOutput(text, blockCfg);
      }
      break;
    case "diff_output":
      nextText = summarizeDiffOutput(text, blockCfg);
      break;
    case "blob":
      nextText = summarizeBlobText(text, blockCfg);
      break;
    case "code_like":
      if (
        hint?.path
        && context?.previouslyReadPaths?.has(resourceKey(hint.path))
      ) {
        return {
          text,
          changed: false,
          route: classification.contentType,
          reason: `${classification.reason}:progressive_disclosure_repeat_read`,
        };
      }
      if (looksLikeControlledCodeRead(text, hint)) {
        const relaxedChars = Math.max(blockCfg.maxChars * 6, 9_000);
        if (text.length <= relaxedChars) {
          return {
            text,
            changed: false,
            route: classification.contentType,
            reason: `${classification.reason}:controlled_code_read`,
          };
        }
        return {
          text: `[controlled code read oversized chars=${text.length}; exact recovery available from archive]`,
          changed: true,
          route: classification.contentType,
          reason: `${classification.reason}:controlled_code_read_oversized`,
        };
      }
      nextText = summarizeCodeLike(text, blockCfg);
      break;
    case "readme_doc":
    case "markdown_doc":
      nextText = summarizeMarkdownDoc(text, blockCfg);
      break;
    case "task_doc":
      nextText = summarizeTaskDoc(text, blockCfg);
      break;
    case "plain_text":
      nextText = summarizeLineBlock(text, kind, blockCfg);
      break;
    default:
      nextText = summarizeLineBlock(text, kind, blockCfg);
      break;
  }

  return {
    text: nextText,
    changed: nextText !== text,
    route: classification.contentType,
    reason: classification.reason,
  };
}

export function reduceToolPayloadText(
  text: string,
  kind: ToolPayloadKind,
  cfg: ToolPayloadRouteConfig,
  hint?: ToolPayloadHint,
  context?: ToolPayloadRoutingContext,
): ToolPayloadReductionResult {
  const classification = classifyToolPayloadContentWithHint(text, hint);
  return reduceByClassification(text, kind, cfg, classification, hint, context);
}
