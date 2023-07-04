const ibmCloudValidationRules = require("@ibm-cloud/openapi-ruleset");
const _ = require("lodash");

const extendRule = (original, modifications) => {
  return _.merge({}, { ...original }, modifications);
};

const mergedRules = extendRule(ibmCloudValidationRules, {
  rules: {
    "require-org": require("./require-org"),
    "match-valid-org": require("./match-valid-org"),
    "require-service-id": require("./require-service-id"),
    "valid-service-id": require("./valid-service-id"),
    "operation-id-case-convention": {
      severity: "error",
      then: {
        functionOptions: { type: "camel" },
      },
    },
    "operation-operationId": "error",
    "array-responses": { severity: "error" },
    "operation-tag-defined": "warn",
    "operation-id-naming-convention": {
      severity: "off",
    },
    "parameter-description": { severity: "warn" },
    "parameter-case-convention": {
      severity: "error",
      then: {
        functionOptions: {
          // Allow snake case for query parameter names,
          // but also allow '.' within the name.
          query: {
            type: "camel",
            separator: {
              char: ".",
            },
          },
          // Allow snake case for path parameter names.
          path: {
            type: "camel",
          },
          // Allow header parameter names to be in canonical header name form (e.g. X-My-Header).
          header: {
            type: "pascal",
            separator: {
              char: "-",
            },
          },
        },
      },
    },
    "valid-type-format": { severity: "error" },
    "content-type-parameter": { severity: "error" },
    "accept-parameter": { severity: "error" },
    "path-params": true,
    "path-declarations-must-exist": "error",
    "duplicate-path-parameter": { severity: "warn" },
    "path-segment-case-convention": {
      severity: "error",
      then: {
        functionOptions: { type: "kebab" },
      },
    },
    "security-schemes": { severity: "warn" },
    "property-case-convention": {
      severity: "error",
      then: {
        functionOptions: {
          type: "camel",
        },
      },
    },
    "property-inconsistent-name-and-type": {
      severity: "warn",
      then: {
        functionOptions: {
          excludedProperties: ["code", "default", "type", "value"],
        },
      },
    },
    "enum-case-convention": {
      severity: "error",
      then: {
        functionOptions: {
          type: "macro",
        },
      },
    },
    "circular-refs": { severity: "error" },
    "no-$ref-siblings": "off",
    "response-status-codes": { severity: "warn" },
    "parameter-schema-or-content": { severity: "error" },
    "consecutive-path-param-segments": { severity: "warn" },
    "request-body-object-oas2": require("./request-body-object-oas2"),
  },
});

module.exports = mergedRules;
