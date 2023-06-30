const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const yaml = require("js-yaml");
const config = require("../config.json");

const BASE_SPECS_DIRECTORY = path.resolve(__dirname, "../services");

const CACHE = {};

const parseContent = (data, uri) => {
  if (
    uri.endsWith(".yaml") ||
    uri.endsWith(".yml") ||
    data.startsWith("swagger") ||
    data.startsWith("openapi")
  ) {
    return yaml.load(data);
  } else if (uri.endsWith(".json") || data.startsWith("{")) {
    return JSON.parse(data);
  } else {
    throw new Error("Cannot determine format for specs at: " + uri);
  }
};

const loadLocalContent = (uri) => {
  const fullPath = path.resolve(BASE_SPECS_DIRECTORY, uri);
  console.log("Loading content of ", fullPath);
  if (!fullPath.startsWith(BASE_SPECS_DIRECTORY)) {
    throw new Error(uri + " is outside the services directory");
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(uri + " is not a valid file.");
  }

  const content = fs.readFileSync(fullPath, { encoding: "utf8" });
  return parseContent(content, uri);
};

const loadRemoteContent = async (uri) => {
  const response = await fetch(uri, {});
  const data = await response.text();
  if (!response.ok) {
    throw new Error(
      `Could not load response, status=${response.status}, data: ${data}`
    );
  }

  return parseContent(data, uri);
};

module.exports.loadExternalSpecs = async (uri) => {
  if (CACHE[uri]) {
    return CACHE[uri];
  }

  if (uri.endsWith("/openapi/common.yaml")) {
    return (CACHE[uri] = require("../annotate-common").annotated);
  }

  console.log("Attempting to load external ref from:", uri);
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const valid = config.allowedExternalUrls.some((prefix) =>
      uri.startsWith(prefix)
    );
    if (!valid) {
      throw new Error(
        uri + " is not allowed, contact administrator to whitelist."
      );
    }

    return (CACHE[uri] = await loadRemoteContent(uri));
  } else if (!uri.includes(":")) {
    //ignore anything with protocol
    return (CACHE[uri] = await loadLocalContent(uri));
  } else {
    throw new Error("Cannot load included file at: " + uri);
  }
};
