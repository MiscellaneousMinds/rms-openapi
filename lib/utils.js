const crypto = require("crypto");
const path = require("path");
const _ = require("lodash");
const { readdir } = require("fs").promises;

const sha256hex = function (str) {
  const hash = crypto.createHash("sha256", { encoding: "hex" });
  return hash.update(str).digest().toString("hex");
};

const getDirectoryFiles = async function (dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = [],
    dirs = [];
  dirents.forEach((dirent) => {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      dirs.push(res);
    } else {
      files.push(res);
    }
  });

  const dirFiles = await Promise.all(dirs.map(getDirectoryFiles));

  return Array.prototype.concat(files, ...dirFiles);
};

const doSubstitute = (str, mappings) => {
  for (const ph in mappings) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    str = str.replace(new RegExp(ph, "ig"), mappings[ph]);
  }

  return str;
};

const substituteProperties = (input, mappings) => {
  const object = _.cloneDeep(input);
  for (const prop in object) {
    if (typeof object[prop] === "object") {
      object[prop] = substituteProperties(object[prop], mappings);
    } else if (typeof object[prop] === "string") {
      object[prop] = doSubstitute(object[prop], mappings);
    }
  }

  return object;
};

module.exports = {
  getDirectoryFiles,
  substituteProperties,
  sha256hex,
};
