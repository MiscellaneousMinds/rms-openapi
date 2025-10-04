const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const validator = require("ibm-openapi-validator");

const gh = require("./github");
const configValues = require("../config.json");
const { sha256hex } = require("./utils");
const { isOas2, convertToOas3 } = require("./openapi");
const { resolveRefs } = require("./resolver.v3");
const {
  SERVICE_ID,
  ORGANIZATION,
  SOURCE_PATH,
  SOURCE_REPOSITORY,
  API_VISIBILITY,
  LIB_PATH,
  LIB_PACKAGE_NAME
} = require("./custom-fields");
const { getStateData, saveStateData } = require("./state");

const { GITHUB_REF } = process.env;
const tmpdir = fs.mkdtempSync(
  path.join(process.env.TMPDIR || process.env.HOME, "importSpecs")
);
const APP_ROOT = path.resolve(__dirname, "../");
const SPECS_DIR = path.resolve(APP_ROOT, "./services");

const stateFile = path.join(SPECS_DIR, "state.json");

console.log("Import directory set for:", tmpdir, "state file =", stateFile);

const validateSpecs = async ({ specs, filePath, repo }) => {
  const validationResult = await validator(specs);
  if (validationResult.errors && validationResult.errors.length > 0) {
    console.error(`${repo} ${filePath} - validation error occurred`);
    validationResult.errors.forEach((err) => {
      console.error(`Message: \t${err.message}`);
      console.error(`Path: \t${err.path}`);
      console.error(`Rule: \t${err.rule}`);
      console.error();
    });

    throw new Error("Validation failed for " + filePath);
  }
};

const getAndCheckTargetPath = ({ specs, stateData, filePath, repo }) => {
  const destinationPathDir = specs[ORGANIZATION];
  const absoluteDestinationDir = path.join(SPECS_DIR, destinationPathDir);
  if (!fs.existsSync(absoluteDestinationDir)) {
    fs.mkdirSync(absoluteDestinationDir);
  }

  // if target exists and repository is different, get admin to remove old one.
  const finalPath = path.join(destinationPathDir, specs[SERVICE_ID] + ".yml");
  if (fs.existsSync(path.join(SPECS_DIR, finalPath))) {
    // find matching stuff.
    const existingData = stateData.mappings.find(
      (sd) => sd.targetPath === finalPath
    );
    if (existingData) {
      if (existingData.repository.toLowerCase() !== repo.toLowerCase()) {
        throw new Error(
          filePath +
          ": service details is trying to overwrite existing specs not from " +
          existingData.repository
        );
      }

      if (existingData.sourcePath !== filePath) {
        console.warn(
          "New source path detected for",
          existingData.targetPath,
          "Deleting the existing one."
        );
        const idx = stateData.mappings.indexOf(existingData);
        stateData.mappings.splice(idx, 1);
      }
    }
  }

  return finalPath;
};

const importFile = async ({ filePath, stateData, repo, ref, force, config }) => {
  // set here
  const previousDir = process.cwd();
  process.chdir(SPECS_DIR);
  try {
    console.log(`Importing ${filePath} from ${repo}`);

    const localPath = path.join(
      tmpdir,
      filePath.replace(/[^A-Za-z0-9]+/g, "_")
    );
    await gh.downloadFile(repo, filePath, ref, localPath);

    if (!fs.existsSync(localPath)) {
      throw new Error(localPath + " File was not saved");
    }

    const fileContent = fs.readFileSync(localPath, { encoding: "utf8" });
    const contentHash = sha256hex(fileContent.trim());
    let specs = yaml.load(fileContent);
    if (!specs) {
      throw new Error("No valid specification.");
    }

    const currentState = stateData.mappings.find(
      (sd) => sd.sourcePath === filePath && sd.repository === repo
    ) || { repository: repo, sourcePath: filePath, _isNew: true };

    const oldTargetPath = !currentState._isNew ? currentState.targetPath : "";

    if (currentState.hash === contentHash && !force) {
      console.log("No changes detected in:" + filePath, "Hash =", contentHash);
      return null;
    }

    currentState.hash = contentHash;

    // validation
    await validateSpecs({ repo, specs, filePath });

    // run resolve
    currentState.targetPath = getAndCheckTargetPath({
      specs,
      stateData,
      filePath,
      repo,
    });
    currentState.organization = specs[ORGANIZATION];
    currentState.serviceId = specs[SERVICE_ID];
    currentState.libPath = specs[LIB_PATH];
    currentState.libPackageName = specs[LIB_PACKAGE_NAME];

    if (oldTargetPath && currentState.targetPath !== oldTargetPath) {
      const absOldTargetPath = path.resolve(SPECS_DIR, oldTargetPath);
      const absOldTargetPathJson = absOldTargetPath.replace(/.ya?ml/, ".json");
      console.warn(
        "File path has changed, removing file:",
        absOldTargetPath,
        "and",
        absOldTargetPathJson
      );
      fs.unlinkSync(absOldTargetPath);
      fs.unlinkSync(absOldTargetPathJson);
    }

    //conversion
    if (isOas2(specs)) {
      specs = await convertToOas3(specs);
    }

    specs = await resolveRefs(specs);
    specs[SOURCE_REPOSITORY] = repo;
    specs[SOURCE_PATH] = filePath;

    const hostName = `${currentState.serviceId}.${currentState.organization}`;
    specs.servers =
      specs[API_VISIBILITY] === "public" &&
        specs.servers &&
        specs.servers.length > 0
        ? specs.servers
        : [
          {
            url: `http://${hostName}`,
            description: "Service Url from within cluster",
          },
          {
            url: `${config.ingressUrl}/${currentState.organization}/${currentState.serviceId}`,
            description: "URL to access staging deployment.",
          },
        ];

    // if (specs.info) {
    //   specs.info.version = configValues.version;
    // }
    console.log("Api spec version >>> ", specs.info);

    const absoluteOutPath = path.resolve(SPECS_DIR, currentState.targetPath);
    fs.writeFileSync(absoluteOutPath, yaml.dump(specs, {}), {
      encoding: "utf8",
    });
    fs.writeFileSync(
      absoluteOutPath.replace(/\.ya?ml$/, ".json"),
      JSON.stringify(specs, null, 1),
      { encoding: "utf8" }
    );
    if (currentState._isNew) {
      delete currentState._isNew;
      stateData.mappings.push(currentState);
    }

    return currentState;
  } finally {
    process.chdir(previousDir);
  }
};

const removeFile = (targetPath) => {
  const absoluteDestinationDir = path.join(SPECS_DIR, targetPath);

  if (fs.existsSync(absoluteDestinationDir)) {
    fs.unlinkSync(absoluteDestinationDir);
  }
};

const removeSpec = ({ organization, serviceId, targetPath }) => {
  [targetPath, `${organization}/${serviceId}.json`].forEach(removeFile);
};

/**
 *
 * @param {{paths: string[], repo: string, ref?: string, force: boolean}} args
 * @returns {Promise<[{}]>}
 */
module.exports.importWithOptions = async function main(args) {
  const { repo, paths, ref } = args;

  const config = configValues[path.dirname(ref)];
  if (
    !repo ||
    !repo
      .toLowerCase()
      .startsWith(config.githubOrganization.toLowerCase() + "/")
  ) {
    console.error(
      "Expected repository owner is:",
      config.githubOrganization,
      "Got: ",
      path.dirname(repo)
    );
    process.exit(1);
  }

  if (GITHUB_REF === "refs/heads/main" || GITHUB_REF === "refs/heads/dev") {
    if (ref !== path.basename(GITHUB_REF)) {
      // This check is ensuring the api spec has gone through review before being imported.
      console.error(
        `OpenAPI spec from ${ref} cannot be imported into ${GITHUB_REF}`
      );
      process.exit(1);
    }
  }

  const stateData = getStateData();
  const imported = [];
  let removed = 0;

  for (const pathList of paths) {
    for (const filePath of pathList.split(/\s*,\s*/)) {
      if (!filePath.endsWith(".yaml") && !filePath.endsWith(".yml")) {
        console.error(
          "Invalid path specified, expecting .yml or .yaml file: ",
          filePath
        );
        process.exit(1);
      }

      const importOpts = {
        filePath: filePath.trim(),
        stateData,
        repo,
        ref,
        force: args.force,
      };
      try {
        const state = await importFile(importOpts);
        if (state) {
          console.log("Imported: ", filePath, " location:", state.targetPath);
          imported.push(state);
        }
      } catch (e) {
        if (e.response && e.response.status === 404) {
          const idx = stateData.mappings.findIndex(
            (a) =>
              a.repository === importOpts.repo &&
              a.sourcePath === importOpts.filePath
          );
          if (idx >= 0) {
            console.log(
              `Removing: ${importOpts.repo}:/${importOpts.filePath}, as it no longer exists`
            );
            const [removedSpec] = stateData.mappings.splice(idx, 1);
            removeSpec(removedSpec);
            removed++;
          }
        } else {
          throw e;
        }
      }
    }
  }

  if (imported.length > 0 || removed > 0) {
    // persist state.
    saveStateData(stateData);
  }
  return imported;
};
