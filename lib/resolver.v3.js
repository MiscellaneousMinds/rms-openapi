const _ = require("lodash");
const { loadExternalSpecs } = require("./content-loader");
const { isObject } = require("./openapi");
const { SERVICE_ID, ORGANIZATION, PRESERVE_REFS } = require("./custom-fields");

const _findInTarget = (object, paths) => {
  const target = object[`${paths[0]}`];
  if (!target) {
    throw new Error("Invalid path");
  }

  if (paths.length === 1) {
    return target;
  }

  return _findInTarget(target, paths.slice(1));
};

const findByPath = (object, path) => {
  const paths = path.split("/").slice(1);
  return _findInTarget(object, paths);
};

const findAllRefs = (object) => {
  const refs = [];
  for (const k in object) {
    if (typeof object[k] === "object") {
      refs.push(...findAllRefs(object[k]));
    } else if (k === "$ref") {
      refs.push(object.$ref);
    }
  }
  return refs;
};

const findMergeForRef = (root, path) => {
  const referencedObj = findByPath(root, path);
  let mergeInfo = {};
  mergeInfo[path.replace(/^#/, "")] = referencedObj;

  const refs = findAllRefs(referencedObj);
  for (const ref of refs) {
    if (!ref.startsWith("#")) {
      throw new Error(
        "Externally loaded references cannot reference remote links for now: " +
          ref
      );
    }
    mergeInfo = { ...mergeInfo, ...findMergeForRef(root, ref) };
  }

  return mergeInfo;
};

class ReferenceUpdater {
  constructor(root) {
    this.root = root;
    this.referencedDefs = new Set();
  }

  async updateReferences(object, fullPath = "") {
    if (typeof object !== "object") {
      // console.log(`#${prefix} => `, (typeof object));
      return object;
    }

    for (const key in object) {
      if (typeof object[key] === "object") {
        object[key] = await this.updateReferences(
          object[key],
          fullPath + "/" + key
        );
      } else if (key === "$ref") {
        const [uri, refPath] = object.$ref.trim().split("#");
        if (!refPath) {
          throw new Error("References must contain path: " + object.$ref);
        }

        if (uri) {
          const { path: computedPath, schema } =
            await this.getPathForExternalSpec(uri, refPath);
          object.$ref = `#${computedPath}`;
          if (fullPath === computedPath) {
            console.log("Replacing object with schema at root:", computedPath);
            // avoid recursion:
            // Copy all properties of the original schema into the main item
            // This forces replacement of the original object with the schema and avoids recursion.
            _.merge(object, { ...schema });
            delete object.$ref;
            break;
          }
        } else if (object.$ref.startsWith("#/definitions/")) {
          // bug for V3 converter
          console.log("Fixing V3 converter bug for:", object.$ref);
          object.$ref = object.$ref.replace(
            "#/definitions/",
            "#/components/schemas/"
          );
        }

        const modelKey = refPath.split("/").pop();

        // replace common scalar definitions like UUID, Timestamp with their original definition.
        if (
          object.$ref.includes("/components/schemas") &&
          this.isScalar(modelKey)
        ) {
          delete object[key];
          const modelSpec = this.root.components.schemas[modelKey];
          object = _.merge({}, object, modelSpec);
        } else {
          //non-scalar, so mark as referenced
          this.referencedDefs.add(
            refPath.startsWith("/definitions/")
              ? refPath.replace("/definitions/", "/components/schemas/")
              : refPath
          );
        }
      }
    }

    return object;
  }

  async getPathForExternalSpec(uri, refPath) {
    const externalSpecs = await loadExternalSpecs(uri);
    const mergeInfo = findMergeForRef(externalSpecs, refPath);
    const newPaths = {};
    for (const aPath in mergeInfo) {
      newPaths[aPath] = this.insertIntoRoot(aPath, mergeInfo[aPath]);
    }

    return {
      path: newPaths[`${refPath}`],
      schema: mergeInfo[refPath],
    };
  }

  insertIntoRoot(originalPath, object) {
    const component = this.getComponentLocation(originalPath);
    const baseName = originalPath.split("/").pop();

    this.root.components[component] = this.root.components[component] || {};
    this.root.components[component][baseName] = object;
    const refPath = `/components/${component}/${baseName}`;
    this.referencedDefs.add(refPath);
    return refPath;
  }

  getComponentLocation(path) {
    if (path.startsWith("/components")) {
      return path.split("/")[2];
    }

    if (path.startsWith("/definitions")) {
      return "schemas";
    }

    if (path.startsWith("/parameters")) {
      return "parameters";
    }

    return "schemas";
  }

  isScalar(modelKey) {
    const schema = this.root.components.schemas[modelKey];
    return schema && !isObject(schema);
  }
}

const COMPONENTS_TO_CLEAN = [
  "schemas",
  "callbacks",
  "parameters",
  "responses",
  "requestBodies",
];
//remove unused definitions, no need generating bloated files
module.exports.resolveRefs = async (apiSpec) => {
  let hasUnused;
  let runs = 0;
  const name = `${apiSpec[SERVICE_ID]}.${apiSpec[ORGANIZATION]}`;

  do {
    console.log(name, "updating references", ++runs);
    hasUnused = false;
    const refUpdater = new ReferenceUpdater(apiSpec);

    apiSpec.components = await refUpdater.updateReferences(
      apiSpec.components || {},
      "/components"
    );
    apiSpec.paths = await refUpdater.updateReferences(
      apiSpec.paths || {},
      "/paths"
    );

    const keepTypes = apiSpec[PRESERVE_REFS] || [];

    for (const component of COMPONENTS_TO_CLEAN) {
      const components = apiSpec.components[component];
      if (components) {
        for (const key in components) {
          const fullPath = `/components/${component}/${key}`;
          if (
            !refUpdater.referencedDefs.has(fullPath) &&
            !keepTypes.includes(`#${fullPath}`)
          ) {
            hasUnused = true;
            console.log("Removing unused reference:", fullPath, "from", name);
            delete components[key];
          }
        }
      }
    }
  } while (hasUnused);

  return apiSpec;
};
