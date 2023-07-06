#!/usr/bin/env node
// usage:
// node import-spec.js --repo repository-name --paths service1/api-spec.yml,service2/api-spec.yml --ref development

const { hideBin } = require("yargs/helpers");
const yargs = require("yargs/yargs");
const { importWithOptions } = require("./lib/importer");
const { makeFromStates } = require("./lib/gateway-maker");

const getCliOptions = () => {
  // noinspection JSUnresolvedFunction
  return yargs(hideBin(process.argv))
    .option("repo", {
      alias: "r",
      describe: "Repository, should be in the form: Owner/RepoName",
    })
    .option("paths", {
      alias: "p",
      type: "array",
      describe: "Paths of the specs to import, must be yml or yaml files",
    })
    .option("ref", {
      describe: "Name of the branch from where import should be made from",
      default: "dev",
    })
    .option("force", {
      describe: "Force import even if no changes",
      default: false,
      type: "boolean",
    })
    .demandOption(["paths", "repo"], "See usages, required parameters missing")
    .help().argv;
};

console.log("Initializing import directory");
importWithOptions(getCliOptions())
  .then(async (imported) => {
    if (imported.length < 1) {
      console.error("No files imported");
      // process.exit(1);
    } else {
      await makeFromStates(imported);
      console.log(`Successfully imported ${imported.length} file(s)`);
    }
  })
  .catch((err) => {
    console.error("Import failed:", err.message, err.stack);
    process.exit(1);
  });
