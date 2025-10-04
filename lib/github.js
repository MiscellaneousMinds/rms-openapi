const { GITHUB_TOKEN } = process.env;
const fs = require("fs");
const API_BASE_URL = "https://api.github.com";
const fetch = require("node-fetch");

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
