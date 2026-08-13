import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkUserFlowGuides,
  readE2eTestFiles,
  scanRepositoryTestFiles,
  validateE2eMarkerRegistry,
  validateE2eTestFiles,
  validateGuide,
} from "./check-user-flow-guides.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const guidesDirectory = join(repositoryRoot, "docs", "user-flows");

function assertFeatureSlug(feature) {
  if (!feature || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature)) {
    throw new Error("feature must be a kebab-case user-flow slug");
  }
}

export async function inspectUserFlowE2e(feature, options = {}) {
  assertFeatureSlug(feature);
  const filename = `${feature}.md`;
  const [content, index] = await Promise.all([
    readFile(join(guidesDirectory, filename), "utf8"),
    readFile(join(guidesDirectory, "README.md"), "utf8"),
  ]);
  const guide = validateGuide(content, filename, index);
  if (!guide.e2e) {
    throw new Error(`${filename}: no E2E mapping is declared`);
  }

  const testFiles = await readE2eTestFiles(guide.e2e);
  const validationErrors = [];
  try {
    validateE2eTestFiles(guide.e2e, testFiles, filename);
  } catch (error) {
    validationErrors.push(
      error instanceof Error ? error.message : String(error),
    );
  }
  try {
    validateE2eMarkerRegistry(
      new Map([[feature, guide.e2e]]),
      options.repositoryTestFiles ?? (await scanRepositoryTestFiles()),
      feature,
    );
  } catch (error) {
    validationErrors.push(
      error instanceof Error ? error.message : String(error),
    );
  }

  const scenarioFiles = new Map(
    guide.e2e.scenarios.map((scenario) => [scenario, []]),
  );
  for (const [testPath, testContent] of testFiles) {
    for (const scenario of guide.e2e.scenarios) {
      const marker = `// @user-flow ${feature}/${scenario}`;
      if (testContent.split("\n").some((line) => line.trim() === marker)) {
        scenarioFiles.get(scenario).push(testPath);
      }
    }
  }

  return {
    ...guide.e2e,
    guidePath: `docs/user-flows/${filename}`,
    scenarioFiles,
    validationError:
      validationErrors.length > 0 ? validationErrors.join("; ") : undefined,
  };
}

export function formatInspection(inspection) {
  const lines = [
    `User flow: ${inspection.feature}`,
    `Guide: ${inspection.guidePath}`,
    `Guide revision: ${inspection.revision}`,
    `E2E command ID: ${inspection.commandId}`,
    `E2E command: ${inspection.command}`,
    "Test files:",
    ...inspection.testPaths.map((testPath) => `  - ${testPath}`),
    "Scenarios:",
    ...inspection.scenarios.map((scenario) => {
      const files = inspection.scenarioFiles.get(scenario);
      return `  - ${scenario}: ${files.length > 0 ? files.join(", ") : "missing marker"}`;
    }),
    inspection.validationError
      ? `Status: invalid — ${inspection.validationError}`
      : "Status: synchronized",
  ];
  return lines.join("\n");
}

function usage() {
  return [
    "Usage:",
    "  pnpm user-flow:e2e -- inspect <feature-slug>",
    "  pnpm user-flow:e2e -- check [feature-slug]",
    "",
    "The command inspects and validates metadata; it never executes guide-provided shell text.",
  ].join("\n");
}

export async function main(args = process.argv.slice(2)) {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [action, feature, ...extra] = normalizedArgs;
  if (extra.length > 0 || !["check", "inspect"].includes(action)) {
    throw new Error(usage());
  }

  if (action === "check") {
    if (feature) assertFeatureSlug(feature);
    await checkUserFlowGuides(feature ? { feature } : {});
    return;
  }

  if (!feature) throw new Error(usage());
  const inspection = await inspectUserFlowE2e(feature);
  console.log(formatInspection(inspection));
  if (inspection.validationError) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
