const { GITHUB_TOKEN } = process.env;
const { Octokit } = require("@octokit/core");
const fs = require("fs");
const API_BASE_URL = "https://api.github.com";
const fetch = require("node-fetch");
const config = require("../config.json");

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

module.exports.downloadFile = async (
  repository,
  filePath,
  ref,
  destinationPath
) => {
  if (!GITHUB_TOKEN) {
    throw new Error("GitHub Token is missing");
  }

  const response = await fetch(
    `${API_BASE_URL}/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(
      ref
    )}`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw",
      },
    }
  );

  if (response.ok) {
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer), {
      encoding: "binary",
    });
  } else {
    const data = await response.text();
    const err = new Error(
      `Could not load response, status=${response.status}, data: ${data}`
    );
    err.response = response;
    throw err;
  }
};

const findPackageWithVersionName = async (
  packageType,
  packageName,
  versionName
) => {
  try {
    const { data: allVersions } = await octokit.request(
      "GET /orgs/{org}/packages/{packageType}/{packageName}/versions",
      {
        packageType,
        packageName,
        org: config.githubOrganization,
      }
    );

    const pkg = allVersions.find(
      (a) => a.name.toLowerCase() === versionName.toLowerCase()
    ) || { id: 0 };
    pkg.versions = allVersions.length;
    return pkg;
  } catch (e) {
    if (e.response && e.response.status === 404) {
      console.log(packageType, packageName, "Not found");
      return { id: 0 };
    }
    const message =
      (e.response && e.response.data && e.response.data.message) || e.message;
    throw new Error("Unable to complete GitHub request: " + message);
  }
};

module.exports.findNpmPackage = (artifactId, versionName) => {
  return findPackageWithVersionName("npm", artifactId, versionName);
};
