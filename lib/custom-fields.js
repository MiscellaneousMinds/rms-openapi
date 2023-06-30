const customFields = {};

Object.defineProperties(customFields, {
  // User-specified properties
  ORGANIZATION: { value: "x-organization", writable: false, enumerable: true },
  SERVICE_ID: { value: "x-service-id", writable: false, enumerable: true },
  VISIBILITY: { value: "x-visibility", writable: false, enumerable: true },
  API_VISIBILITY: {
    value: "x-api-visibility",
    writable: false,
    enumerable: true,
  },
  PRESERVE_REFS: {
    value: "x-preserve-refs",
    writable: false,
    enumerable: true,
  },

  // System-annotation properties
  ORIGINAL_PATH: {
    value: "x-original-path",
    writable: false,
    enumerable: true,
  },
  SOURCE_REPOSITORY: {
    value: "x-source-repository",
    writable: false,
    enumerable: true,
  },
  SOURCE_PATH: { value: "x-source-path", writable: false, enumerable: true },
  COMMON_MODEL: { value: "x-common-model", writable: false, enumerable: true },
});

module.exports = customFields;
