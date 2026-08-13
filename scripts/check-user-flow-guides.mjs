import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const guidesDirectory = join(repositoryRoot, "docs", "user-flows");
const indexPath = join(guidesDirectory, "README.md");
const allowedKeys = new Set([
  "feature",
  "last_verified",
  "related_features",
  "source_paths",
  "status",
  "surfaces",
  "title",
]);
const allowedStatuses = new Set(["current", "draft", "retired"]);
const surfaceHeadings = new Map([
  ["admin", "Admin verification"],
  ["api", "API verification"],
  ["browser", "Browser verification"],
  ["cli", "CLI verification"],
  ["mobile", "Mobile verification"],
  ["system", "System verification"],
]);
const alwaysRequiredHeadings = [
  "What this verifies",
  "Start the development environment",
  "Expected failure and edge cases",
  "Automated regression checks",
  "Troubleshooting",
  "Cleanup",
];

export function parseFrontmatter(content, filename) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) {
    throw new Error(`${filename}: missing YAML frontmatter`);
  }

  const metadata = new Map();
  let activeList;

  for (const [lineIndex, line] of match[1].split("\n").entries()) {
    const listItem = /^ {2}- (.+)$/.exec(line);
    if (listItem) {
      if (!activeList) {
        throw new Error(
          `${filename}:${lineIndex + 2}: list item has no parent key`,
        );
      }
      metadata.get(activeList).push(listItem[1].trim());
      continue;
    }

    const property = /^([a-z][a-z0-9_]*):(?: (.*))?$/.exec(line);
    if (!property) {
      throw new Error(
        `${filename}:${lineIndex + 2}: unsupported frontmatter syntax`,
      );
    }

    const [, key, rawValue = ""] = property;
    if (!allowedKeys.has(key)) {
      throw new Error(`${filename}: unsupported frontmatter key '${key}'`);
    }
    if (metadata.has(key)) {
      throw new Error(`${filename}: duplicate frontmatter key '${key}'`);
    }

    if (rawValue === "") {
      metadata.set(key, []);
      activeList = key;
    } else {
      metadata.set(key, rawValue.trim());
      activeList = undefined;
    }
  }

  return {
    body: content.slice(match[0].length).replace(/^\n/, ""),
    metadata,
  };
}

function requireScalar(metadata, key, filename) {
  const value = metadata.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${filename}: '${key}' must be a non-empty scalar`);
  }
  return value;
}

function requireList(metadata, key, filename) {
  const value = metadata.get(key);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => item.trim().length === 0)
  ) {
    throw new Error(`${filename}: '${key}' must be a non-empty list`);
  }
  return value;
}

function assertValidDate(value, filename) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${filename}: 'last_verified' must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${filename}: 'last_verified' is not a real date`);
  }
}

function sectionsByHeading(body) {
  const sections = new Map();
  let activeHeading;
  let activeContent = [];
  let fenced = false;

  const saveActiveSection = () => {
    if (activeHeading) {
      sections.set(activeHeading, activeContent.join("\n").trim());
    }
  };

  for (const line of body.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      if (activeHeading) activeContent.push(line);
      continue;
    }
    const heading = fenced ? null : /^## ([^#].*)$/.exec(line);
    if (heading?.[1]) {
      saveActiveSection();
      activeHeading = heading[1].trim();
      activeContent = [];
    } else if (activeHeading) {
      activeContent.push(line);
    }
  }
  saveActiveSection();

  return sections;
}

function assertSection(sections, heading, filename) {
  const content = sections.get(heading);
  if (content === undefined) {
    throw new Error(`${filename}: missing required '## ${heading}' section`);
  }
  const substantiveContent = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*(?:```|~~~).*$/gm, "")
    .trim();
  if (substantiveContent.length === 0) {
    throw new Error(`${filename}: required '## ${heading}' section is empty`);
  }
}

function hasIndexLink(index, filename) {
  let fenced = false;
  const indexWithoutComments = index.replace(/<!--[\s\S]*?-->/g, "");

  for (const line of indexWithoutComments.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const lineWithoutInlineCode = line.replace(/`[^`\n]*`/g, "");
    const targets = [...lineWithoutInlineCode.matchAll(/\]\(([^)]+)\)/g)].map(
      (match) => match[1],
    );
    if (!fenced && targets.includes(`./${filename}`)) {
      return true;
    }
  }

  return false;
}

export function validateGuide(content, filename, index) {
  const { body, metadata } = parseFrontmatter(content, filename);
  const feature = requireScalar(metadata, "feature", filename);
  const title = requireScalar(metadata, "title", filename);
  const status = requireScalar(metadata, "status", filename);
  const lastVerified = requireScalar(metadata, "last_verified", filename);
  const surfaces = requireList(metadata, "surfaces", filename);
  const sourcePaths = requireList(metadata, "source_paths", filename);
  const expectedFilename = `${feature}.md`;
  const sections = sectionsByHeading(body);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature)) {
    throw new Error(`${filename}: 'feature' must be a kebab-case slug`);
  }
  if (filename !== expectedFilename) {
    throw new Error(
      `${filename}: filename must match feature slug '${expectedFilename}'`,
    );
  }
  if (!allowedStatuses.has(status)) {
    throw new Error(`${filename}: 'status' must be current, draft, or retired`);
  }
  assertValidDate(lastVerified, filename);

  for (const surface of new Set(surfaces)) {
    const heading = surfaceHeadings.get(surface);
    if (!heading) {
      throw new Error(`${filename}: unsupported surface '${surface}'`);
    }
    assertSection(sections, heading, filename);
  }

  for (const sourcePath of sourcePaths) {
    if (
      sourcePath.startsWith("/") ||
      sourcePath.startsWith("./") ||
      sourcePath.includes("..") ||
      sourcePath.includes("\\")
    ) {
      throw new Error(
        `${filename}: source path '${sourcePath}' must be repository-relative`,
      );
    }
  }

  if (!body.startsWith(`# ${title}\n`)) {
    throw new Error(`${filename}: first heading must be '# ${title}'`);
  }
  for (const heading of alwaysRequiredHeadings) {
    assertSection(sections, heading, filename);
  }
  if (!hasIndexLink(index, filename)) {
    throw new Error(`${filename}: guide is missing from README.md index`);
  }
}

export async function checkUserFlowGuides() {
  const entries = await readdir(guidesDirectory, { withFileTypes: true });
  const filenames = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md",
    )
    .map((entry) => entry.name)
    .sort();

  if (filenames.length === 0) {
    throw new Error("docs/user-flows must contain at least one feature guide");
  }

  const index = await readFile(indexPath, "utf8");
  const failures = [];

  for (const filename of filenames) {
    try {
      validateGuide(
        await readFile(join(guidesDirectory, filename), "utf8"),
        filename,
        index,
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.map((failure) => `- ${failure}`).join("\n"));
  }

  console.log(`Validated ${filenames.length} user-flow guide(s).`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await checkUserFlowGuides().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
