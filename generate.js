const fs = require("fs");
const path = require("path");
const YAML = require("js-yaml");
const configValues = require("./config.json");
const { substituteProperties, getDirectoryFiles } = require("./lib/utils");
const X = require("./lib/custom-fields");
const { getStateData } = require("./lib/state");

let supportedLanguages = ["rust"];

const IS_RELEASE = process.env.GITHUB_REF === "refs/heads/main";
const SNAPSHOT_NUMBER = Math.round(Date.now() / 10000);
const CHECKPOINT = "[ $? != 0 ] && exit 25";

const buildPackageBuildScript = async (options, state, deploy = true) => {
  let script = "";
  const packageState = state.mappings.find(s => s.organization === "" && s.serviceId === "");

  console.log("Found package state: ", packageState);

  if (packageState) {
    const [organisation, repoName] = packageState.repository.split("/");
    const repoCloneUrl = `https://x-access-token:${GITHUB_TOKEN}@github.com/${organisation}/${repoName}.git`;

    console.log("Repo clone url: ", repoCloneUrl);

    script += `git clone ${repoCloneUrl}`
    script += `cd ${repoName}`;

    script += `rm -rf ${packageState.libPath}`;
    script += `ls`

    // switch (options["generator-name"]) {
    //   case "rust":
    //     script += `cargo package\n`;
    //     script += `cd target/package && ls -a && cd ../..\n`;
    //     if (deploy) {
    //       script += `cloudsmith push cargo ${cloudSmithRegistry} ./target/package/${options.configOptions.packageName}-${options.configOptions.packageVersion}.crate --republish\n`;
    //     }
    //     break;
    //   // eslint-disable-next-line no-fallthrough
    //   default:
    //     throw new Error("Unable to generate build script for specified language");
    // }

    // script += `\n[ \\$\? != 0 ] && exit 25 \n`; TODO:
  }

  return `echo "#!/bin/bash
cd \\"\\$(dirname \\"\\$0\\")\\"
${script}" > ${options.output}/publish.sh`;
};

const getGeneratorArguments = (options) => {
  const base = require("./code-templates/args-base.json");
  const allArgs = {
    rust: {
      ...base,
      ...require("./code-templates/args-rust.json"),
    },
  };

  return substituteProperties(allArgs, {
    _GIT_REPO_ID_: path.basename(githubRepository),
    _GIT_USER_ID_: githubOrganization.toLowerCase(),
    _ARTIFACT_VERSION_: options.version,
    _VERSION_SUFFIX_: IS_RELEASE ? "RELEASE" : "SNAPSHOT",
    _PUB_VERSION_: `${version}${IS_RELEASE ? "" : "-SNAPSHOT." + SNAPSHOT_NUMBER
      }`,
    _ARTIFACT_URL_: `https://github.com/${githubRepository}`,
    _DEVELOPER_NAME_: developerName,
    _DEVELOPER_EMAIL_: developerEmail,
    _DEVELOPER_ORGANIZATION_: developerOrganization,
    _ARTIFACT_GROUP_ID_: packageName,
  });
};

const buildGeneratorCommand = (options) => {
  const cliArgs = [`${generatorCommand} generate`];

  for (const opt in options) {
    if (opt !== "configOptions") {
      cliArgs.push(`  --${opt}='${options["" + opt]}'`);
    } else {
      for (const property in options.configOptions) {
        const propVal = options.configOptions[`${property}`];
        if (propVal) {
          cliArgs.push(`  -p ${property}='${propVal}'`);
        }
      }
    }
  }

  return cliArgs.join(" \\\n");
};

const createScriptForSpec = async (specPath, languages, output, state) => {
  let outputScript = [];
  const fileContent = fs.readFileSync(specPath, { encoding: "utf8" });
  const apiSpec = YAML.load(fileContent);

  const serviceId = apiSpec[X.SERVICE_ID];
  const organization = apiSpec[X.ORGANIZATION];
  const version = apiSpec.info.version;
  const fullName = `${organization}-${serviceId}`;
  const outputPrefix = serviceId === "common" ? "00000-" : "";

  let generatorArgs = getGeneratorArguments({ version });

  for (const language of languages) {
    const langConfig = substituteProperties(generatorArgs[language], {
      _INPUT_SPEC_: specPath,
      _ARTIFACT_ID_: `${organization}-${serviceId}`,
      _OUTPUT_: `${output}/${language}/${outputPrefix}${fullName}`,
    });
    const generatorCommand = buildGeneratorCommand(langConfig);

    outputScript.push(
      "",
      `echo "Generating files for file -> ${specPath}, Language -> ${language}"`
    );
    outputScript.push(
      generatorCommand,
      CHECKPOINT,
      await buildPackageBuildScript(langConfig, state),
      ""
    );
  }

  return outputScript;
};

// generate and list files
const generate = async () => {
  let specFolder = "./services";
  let output = "generated-sources";
  let scriptPath = "generate.sh";

  if (!fs.existsSync(specFolder)) {
    console.error("Specs folder does not exist");
    process.exit(1);
  }

  const FINAL_OUTPUT = [];
  FINAL_OUTPUT.push("#!/bin/bash", "#This is an auto-generated script");

  FINAL_OUTPUT.push('echo "Creating output directories"');
  supportedLanguages.forEach((lang) => {
    FINAL_OUTPUT.push(`mkdir -p ${output}/${lang}`);
  });

  const allFiles = await getDirectoryFiles(specFolder).then((files) =>
    files.filter((f) => /\.ya?ml$/i.test(f))
  );

  const state = getStateData();

  for (const specPath of allFiles) {
    const script = await createScriptForSpec(
      specPath,
      supportedLanguages,
      output,
      state
    );
    if (script.length > 0) {
      FINAL_OUTPUT.push(...script);
    }
  }

  FINAL_OUTPUT.push("", "");
  FINAL_OUTPUT.push("exit 0");
  console.log("Publishing shell script to", scriptPath);
  fs.writeFileSync(scriptPath, FINAL_OUTPUT.join("\n"), {
    encoding: "utf8",
  });
};

generate().catch((err) => {
  console.error("Execution error occurred");
  console.error(err.message, err.stack);
  process.exit(2);
});
