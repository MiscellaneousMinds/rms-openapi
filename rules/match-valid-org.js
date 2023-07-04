const { pattern } = require("@stoplight/spectral-functions");

module.exports = {
  description: "x-organization field must be valid.",
  given: "$",
  message: "{{error}}",
  severity: "error",
  then: {
    field: "x-organization",
    function: pattern,
    functionOptions: {
      match: /^(rust|AdeThorMiwa)$/,
    },
  },
};
