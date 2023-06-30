const CONVERTER_URL = "https://converter.swagger.io/api/convert";
const fetch = require("node-fetch");
const { PRESERVE_REFS } = require("./custom-fields");
const METHODS = ["get", "post", "put", "delete", "patch"];

module.exports.HTTP_METHODS = METHODS;

module.exports.isOas3 = (specs) =>
  specs.openapi && specs.openapi.startsWith("3");

module.exports.isOas2 = (specs) =>
  specs.swagger && specs.swagger.startsWith("2");

const convertSecurityToBearer = (data) => {
  // convert bearer security,
  // Swagger 2 does not provide a way to define security specification for Bearer tokens,
  // When converting to V3, we change apiKeys in the authorization header with to bearer token
  if (data.components && data.components.securitySchemes) {
    Object.keys(data.components.securitySchemes)
      .filter((schemeName) => /bearer/i.test(schemeName))
      .filter((schemeName) => {
        const scheme = data.components.securitySchemes[schemeName];
        return (
          scheme.in === "header" &&
          scheme.type === "apiKey" &&
          /authorization/i.test(scheme.name)
        );
      })
      .forEach((schemeName) => {
        console.log("Converting", schemeName, "to bearer token");
        const scheme = data.components.securitySchemes[schemeName];
        data.components.securitySchemes[schemeName] = {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: scheme.description || "Bearer token authentication",
        };
      });
  }
};

module.exports.convertToOas3 = async (specs) => {
  const response = await fetch(CONVERTER_URL, {
    body: JSON.stringify(specs),
    cache: "no-cache",
    method: "post",
    headers: {
      "content-type": "application/json",
    },
  });

  if (response.ok) {
    const data = await response.json();
    if (data[PRESERVE_REFS]) {
      // preserve references of x-preserve-refs
      // but only keeping objects, as there's no reason to want to keep parameters in Swagger 2
      data[PRESERVE_REFS] = data[PRESERVE_REFS].map((ref) => {
        return ref.startsWith("#/definitions/")
          ? ref.replace("#/definitions/", "#/components/schemas/")
          : ref;
      });
    }

    //convert bearer security
    convertSecurityToBearer(data);

    return data;
  } else {
    const data = await response.text();
    throw new Error(
      `Could not load response, status=${response.status}, data: ${data}`
    );
  }
};

module.exports.isObject = (schema) =>
  !schema.type ||
  schema.type === "object" ||
  (schema.type === "string" && schema.enum);

module.exports.getOperationIterator = (apiSpec, methods = METHODS) => {
  return function* () {
    for (const path in apiSpec.paths) {
      const pathSpecs = apiSpec.paths[path];
      for (const method in pathSpecs) {
        if (!methods.includes(method)) {
          continue;
        }

        yield { path, method, operation: pathSpecs[method] };
      }
    }
  };
};
