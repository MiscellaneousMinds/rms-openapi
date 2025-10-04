const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const YAML = require("js-yaml");
const { getDirectoryFiles } = require("./utils");
const { resolveRefs } = require("./resolver.v3");
const configValues = require("../config.json");
const { HTTP_METHODS, getOperationIterator } = require("./openapi");
const {
  ORGANIZATION,
  SERVICE_ID,
  VISIBILITY,
  ORIGINAL_PATH,
  PRESERVE_REFS,
} = require("./custom-fields");

const SPECS_DIR = path.resolve(__dirname, "../services");
const GATEWAY_SERVICE_ID = "api-gateway";
const EXTERNAL_GATEWAY_SERVICE_ID = "external-gateway";

const X_VISIBILITY_VALUES = {
  PUBLIC: "public",
  PRIVATE: "private",
  INTERNAL: "internal",
  EXTERNAL: "external",
};

const ORGANIZATIONS_WITH_EXTERNAL_APIS = ["onboard"];
const ORGANIZATIONS_WITH_NO_GATEWAY = ["core"];

const getBaseGateway = (organization, overrides = {}) => {
  const baseGateway = {
    openapi: "3.0.3",
    [ORGANIZATION]: organization.githubOrganization,
    [SERVICE_ID]: GATEWAY_SERVICE_ID,
    info: {
      version: organization.version,
      title: `${_.upperFirst(organization.githubOrganization)} API Gateway`,
      description: `**Introduction**
API Gateway for ${_.upperFirst(organization.githubOrganization)}

This specification describes API endpoints that are available to the public internet via the API gateway. The different endpoints require different authentication schemes, see documentation for what applies to the operation you want to access.

**Errors**
Uses conventional HTTP response codes to indicate success or failure. In
general:
 
- \`2xx\` status codes indicate success. Codes in the
- \`4xx\` range
indicate a client error (e.g. required parameters, failed request etc.).
- \`5xx\` status codes indicate a server error occurred.`,
      contact: {
        name: "AdeThorMiwa",
        email: "BenDaMyth@gmail.com",
      },
      license: {
        name: "UNLICENSED",
      },
    },

    servers: [
      {
        url: `https://${organization.toLowerCase()}-dev.api.miscminds.io`,
        description: "Default Gateway",
      },
    ],
    paths: {},
    tags: [],
    components: {
      schemas: {},
      securitySchemes: {},
    },
    [PRESERVE_REFS]: [],
  };

  console.log(overrides);
  return _.merge(baseGateway, overrides);
};

const renameTag = (serviceId, originalName) =>
  `${serviceId}-${originalName}`.toLowerCase();

const selectPathsFromService = (
  serviceId,
  specs,
  targetVisibility = [X_VISIBILITY_VALUES.PUBLIC]
) => {
  const outObject = {};

  for (const apiPath in specs.paths) {
    const pathObject = _.cloneDeep(specs.paths[`${apiPath}`]);

    HTTP_METHODS.forEach((method) => {
      //only include properly tagged path methods
      const operationSpec = pathObject[method];

      const shouldInclude =
        operationSpec &&
        operationSpec[VISIBILITY] &&
        targetVisibility.includes(operationSpec[VISIBILITY].toLowerCase());

      if (!shouldInclude) {
        delete pathObject[method];
        return;
      }

      // indicate appropriate security.
      if (!operationSpec.security) {
        operationSpec.security = specs.security || [];
      }

      operationSpec.tags = operationSpec.tags.map((tag) =>
        renameTag(serviceId, tag)
      );
    });

    const methodKeys = Object.keys(pathObject).filter((prop) =>
      HTTP_METHODS.includes(prop)
    );
    if (methodKeys.length > 0) {
      // generally trying to avoid redundant naming in API endpoints, e.g. /users/users/{userId}
      // API needs to be aware that it needs to look at x-original-path field of the path.
      pathObject[ORIGINAL_PATH] = apiPath;
      const pathPrefix = apiPath.slice(1).split("/").shift();
      const newPath =
        pathPrefix.toLowerCase() === serviceId.toLowerCase()
          ? apiPath
          : `/${serviceId}${apiPath}`;
      outObject[`${newPath}`] = pathObject;
    }
  }

  return outObject;
};

const renameSchemaInList = (list, oldSchemaName, newSchemaName) => {
  const oldRef = `#/components/schemas/${oldSchemaName}`;
  const newRef = `#/components/schemas/${newSchemaName}`;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === oldRef) {
      list[i] = newRef;
    }
  }
};

const renameSchema = (sourceObj, oldSchemaName, newSchemaName, path = "") => {
  const oldRef = `#/components/schemas/${oldSchemaName}`;
  const newRef = `#/components/schemas/${newSchemaName}`;
  for (const objKey in sourceObj) {
    const objValue = sourceObj[objKey];
    if (typeof objValue === "object") {
      if (objValue.$ref) {
        if (objValue.$ref === oldRef) {
          console.log(
            "Renaming",
            oldRef,
            "to",
            newRef,
            "in",
            `${path}.${objKey}`
          );
          objValue.$ref = newRef;
        }
      } else if (objValue.discriminator && objValue.discriminator.mapping) {
        for (const discName in objValue.discriminator.mapping) {
          if (objValue.discriminator.mapping[discName] === oldRef) {
            // bearing in mind that the upstream service is not aware of this rename.
            console.log(
              "Discriminator Re-mapping",
              discName,
              "::",
              oldRef,
              "to",
              newRef,
              "in",
              `${path}.${objKey}`
            );
            objValue.discriminator.mapping[discName] = newRef;
          }
        }
      } else {
        renameSchema(
          objValue,
          oldSchemaName,
          newSchemaName,
          `${path}.${objKey}`
        );
      }
    }
  }
};

const mergeIntoDefinitions = (serviceId, specs, merged, targetVisibility) => {
  //filter paths:
  const selectedPaths = selectPathsFromService(
    serviceId,
    specs,
    targetVisibility
  );
  if (Object.keys(selectedPaths).length < 1) {
    console.log("#", serviceId, "skipping as no valid paths found");
    return;
  }

  // process tags
  if (specs.tags && specs.tags.length) {
    const tags = specs.tags.map((tag) => {
      return { ...tag, name: renameTag(serviceId, tag.name) };
    });

    merged.tags = _.merge([], merged.tags, tags);
  }

  const preservedRefs = specs[PRESERVE_REFS] || [];

  const componentsToMerge = { ...specs.components };
  if (specs.components.schemas) {
    const specSchemas = _.cloneDeep(componentsToMerge.schemas);
    delete componentsToMerge.schemas;

    const existingSchemas = Object.keys(merged.components.schemas).map((a) =>
      a.toLowerCase()
    );
    const duplicateSchemas = Object.keys(specSchemas).filter((schemaName) => {
      return (
        existingSchemas.includes(schemaName.toLowerCase()) &&
        !specSchemas[schemaName]["x-common-model"]
      );
    });

    if (duplicateSchemas.length > 0) {
      const proposedPrefix =
        specs[SERVICE_ID].split("-").map(_.capitalize).join("") + "Svc";
      duplicateSchemas.forEach((sc) => {
        console.log("replacing for:", sc);
        const newName = proposedPrefix + sc;
        renameSchema(specSchemas, sc, newName);
        renameSchema(selectedPaths, sc, newName);
        specSchemas[newName] = specSchemas[sc];
        renameSchemaInList(preservedRefs, sc, newName);
        delete specSchemas[sc];
      });
    }

    componentsToMerge.schemas = specSchemas;
  }

  merged.paths = _.merge({}, merged.paths || {}, selectedPaths);
  merged.components = _.merge({}, merged.components, componentsToMerge);
  merged[PRESERVE_REFS].push(...preservedRefs);
};

const buildGatewaySpecs = (
  organization,
  specifications,
  gatewayOverride = {},
  targetVisibility = [X_VISIBILITY_VALUES.PUBLIC, X_VISIBILITY_VALUES.EXTERNAL]
) => {
  // TODO include API gateway definition.
  const gatewayApi = _.merge({}, getBaseGateway(organization, gatewayOverride));
  //merge definitions
  for (const spec of specifications) {
    const serviceId = spec[SERVICE_ID];
    if (
      serviceId !== "api-gateway" &&
      serviceId !== EXTERNAL_GATEWAY_SERVICE_ID
    ) {
      mergeIntoDefinitions(serviceId, spec, gatewayApi, targetVisibility);
    }
  }
  return gatewayApi;
};

const rewriteOperationId = (operationId, op) => {
  if (op.operation.operationId !== operationId) return;
  const pathPrefix = op.path.slice(1).split("/").shift();
  const newOpId = operationId + _.upperFirst(_.camelCase(pathPrefix));
  console.log("Duplicate Operation ID:", operationId, "renamed to", newOpId);
  op.operation.operationId = newOpId;
};

const checkDuplicateOperationIds = (spec) => {
  const mappedOpIds = new Map();
  const iterator = getOperationIterator(spec)();
  for (const op of iterator) {
    const operationId = op.operation.operationId;
    if (!mappedOpIds.has(operationId)) {
      mappedOpIds.set(operationId, op);
    } else {
      rewriteOperationId(operationId, mappedOpIds.get(operationId));
      rewriteOperationId(operationId, op);
    }
  }
};

module.exports.gatewayBuilder = async ({ organization }) => {
  if (!/^[a-z0-9-]+$/gi.test(organization.githubOrganization)) {
    throw new Error("organization MUST be alpha-numeric");
  }

  const targetDir = path.join(SPECS_DIR, organization.githubOrganization);
  const resources = await getDirectoryFiles(targetDir);
  const orgSpecs = [];

  for (const filePath of resources) {
    if (/\.json$/i.test(filePath)) {
      const spec = JSON.parse(fs.readFileSync(filePath, { encoding: "utf8" }));
      if (spec.openapi) {
        orgSpecs.push(spec);
      }
    }
  }

  if (!ORGANIZATIONS_WITH_NO_GATEWAY.includes(organization.githubOrganization)) {
    const gatewaySpec = await resolveRefs(
      buildGatewaySpecs(organization, orgSpecs)
    );
    persistSpecs("api-gateway", targetDir, gatewaySpec);
  } else {
    console.log("Skipping API gateway generation for:", organization.githubOrganization);
  }

  if (ORGANIZATIONS_WITH_EXTERNAL_APIS.includes(organization.githubOrganization)) {
    const gatewayOverride = {
      [SERVICE_ID]: "external-gateway",
      info: {
        title: `${_.upperFirst(organization.githubOrganization)} External API Gateway`,
        version: organization.version
      },
    };
    const externalGatewaySpec = await resolveRefs(
      buildGatewaySpecs(organization, orgSpecs, gatewayOverride, [
        X_VISIBILITY_VALUES.EXTERNAL,
      ])
    );
    persistSpecs(EXTERNAL_GATEWAY_SERVICE_ID, targetDir, externalGatewaySpec);
  }
};

const persistSpecs = (name, targetDir, gatewaySpec) => {
  // check for duplicate Operation IDs
  checkDuplicateOperationIds(gatewaySpec);

  fs.writeFileSync(
    path.join(targetDir, `${name}.yml`),
    YAML.dump(gatewaySpec, {}),
    { encoding: "utf-8" }
  );
  fs.writeFileSync(
    path.join(targetDir, `${name}.json`),
    JSON.stringify(gatewaySpec, null, 2),
    { encoding: "utf-8" }
  );
};

module.exports.makeFromStates = async (states) => {
  const allOrgs = new Set();
  states.forEach((s) => allOrgs.add(s.organization));
  for (const [organization] of allOrgs.entries()) {
    const orgConfig = configValues[organization];
    console.log("Building API gateway for:", organization, orgConfig);
    await this.gatewayBuilder({ organization: orgConfig });
  }
};
