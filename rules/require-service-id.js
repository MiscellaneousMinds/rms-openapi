const { truthy } = require("@stoplight/spectral-functions");

module.exports = {
  description: "x-service-id field must be specified and valid.",
  given: "$",
  severity: "error",
  message: "{{error}}",
  then: {
    field: "x-service-id",
    function: truthy,
  },
};
