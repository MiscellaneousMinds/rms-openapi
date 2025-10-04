const APP_ROOT = path.resolve(__dirname, "../");
const SPECS_DIR = path.resolve(APP_ROOT, "./services");

const stateFile = path.join(SPECS_DIR, "state.json");

/**
* Shape:
*  {
*    mappings: [
*      {
*        "repository": "repo",
*        "sourcePath": "",
*        "targetPath"
*        "hash": ""
*      }
*    ]
*   }
*
* return {{mappings: {}}|{mappings: []}|undefined}
*/
export const getStateData = function () {
    try {
        return JSON.parse(fs.readFileSync(stateFile, { encoding: "utf8" }));
    } catch (e) {
        console.error("Unable to load existing state information:", e.message);
        return {
            mappings: [],
        };
    }
};

export const saveStateData = (stateData) => {
    if (!stateData || !stateData.mappings || stateData.mappings.length < 1) {
        throw new Error("Invalid state data received");
    }

    fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2));
};