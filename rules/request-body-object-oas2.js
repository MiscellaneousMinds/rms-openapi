const { oas2 } = require("@stoplight/spectral-formats");

const checkParam = function (obj) {
  if (obj.in === "body" && !(obj.schema && obj.schema.type === "object")) {
    return [
      {
        message: "Request bodies MUST be object",
      },
    ];
  }
  return [];
};

module.exports = {
  description: "All request bodies MUST be structured as an object",
  message: "{{error}}",
  severity: "error",
  formats: [oas2],
  resolved: true,
  given: "$.paths[*][*].parameters[*]",
  then: {
    function: checkParam,
  },
};
