const { pattern } = require("@stoplight/spectral-functions");

module.exports = {
  description:
    "x-service-id field must match valid ID and not end with `service`.",
  given: "$",
  severity: "error",
  then: {
    field: "x-service-id",
    function: pattern,
    functionOptions: {
      match: "^([a-z1-9-][a-z1-9-]+)*[a-z1-9]+$",
      notMatch: "service$",
    },
  },
};
