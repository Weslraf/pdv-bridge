const path = require("path");

const rootPackage = require("../../package.json");

module.exports = {
  APP_NAME: "Uno Press",
  APP_VERSION: rootPackage.version || "0.0.0",
  APP_USER_MODEL_ID: rootPackage.build?.appId || "com.unopress.app",
  SERVER_PORT: 8181,
  APP_ICON: path.join(__dirname, "..", "..", "build", "icon.png"),
  PRELOAD_PATH: path.join(__dirname, "preload.js"),
  RENDERER_PATH: path.join(__dirname, "..", "renderer", "index.html")
};
