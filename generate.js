// generate and list files
const generate = async () => {};

const main = async () => {
  console.log("Act is running...");
};

main().catch((err) => {
  console.error("Execution error occurred");
  console.error(err.message, err.stack);
  process.exit(2);
});
