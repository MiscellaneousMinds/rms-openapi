const config = require("./config.json");

const { hideBin } = require("yargs/helpers");
const yargs = require("yargs/yargs");
const fs = require("fs");

const getCliOptions = () => {
  // noinspection JSUnresolvedFunction
  return yargs(hideBin(process.argv))
    .option("semver", {
      alias: "s",
      describe:
        "Part of the version to bump. This automatically sets lesser parts to 0",
      choices: ["major", "minor", "patch"],
      default: "patch",
    })
    .option("dry-run", {
      describe: "Dry run alone",
      default: false,
      type: "boolean",
    })
    .version(config.version)
    .help().argv;
};

let [major, minor, patch] = config.version.split(".").map((nk) => parseInt(nk));

const args = getCliOptions();
switch (args.semver) {
  case "major":
    major++;
    minor = patch = 0;
    break;
  case "minor":
    minor++;
    patch = 0;
    break;
  case "patch":
  default:
    patch++;
}

config.version = [major, minor, patch].join(".");

const newContent = JSON.stringify(config, null, "  ");
if (args.dryRun) {
  console.log(newContent);
} else {
  fs.writeFileSync(__dirname + "/config.json", newContent, {
    encoding: "utf-8",
  });
}
