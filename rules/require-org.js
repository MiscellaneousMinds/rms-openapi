const { truthy } = require("@stoplight/spectral-functions");

module.exports = {
  description: "x-organization field must be specified.",
  given: "$",
  severity: "error",
  message: "{{error}}",
  then: {
    field: "x-organization",
    function: truthy,
  },
};
