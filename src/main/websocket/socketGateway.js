function createSocketGateway() {
  let initialized = false;

  function init() {
    initialized = true;
    console.log("[PDV Bridge] Websocket gateway preparado (placeholder).");
  }

  function publish(eventName, payload) {
    if (!initialized) return;
    console.log(`[PDV Bridge] WS event: ${eventName}`, payload);
  }

  return {
    init,
    publish
  };
}

module.exports = {
  createSocketGateway
};
