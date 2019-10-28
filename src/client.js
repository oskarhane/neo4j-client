const { Machine, assign, interpret } = require("xstate");
const { v4 } = require("uuid");

class Neo4jClient {
  constructor(config = {}) {
    this.link = config.link;
    this.onStateChange = config.onStateChange || function() {};
    this.service = null;
    this.init();
    this.connect();
    this.trackedSessions = {};
  }
  init() {
    const machineSpec = {
      id: "neo4j-client",
      initial: "disconnected",
      context: {
        errorMessage: null
      },
      states: {
        disconnected: {
          on: {
            CONNECT: "connecting"
          }
        },
        connecting: {
          entry: "resetErrorMessage",
          invoke: {
            id: "connect",
            src: () => {
              return this.link.connect();
            },
            onDone: {
              target: "connected"
            },
            onError: {
              target: "failed",
              actions: assign({
                errorMessage: (context, event) => {
                  return event.data.code;
                }
              })
            }
          }
        },
        connected: {
          on: {
            DISCONNECT: "disconnecting",
            UNAUTHORIZED: {
              target: "failed",
              actions: assign({
                errorMessage: (context, event) => {
                  return "Unauthorized";
                }
              })
            },
            UNAVAILABLE: {
              target: "failed",
              actions: assign({
                errorMessage: (context, event) => {
                  console.log("ServiceUnavailable");
                  return "ServiceUnavailable";
                }
              })
            }
          }
        },
        disconnecting: {
          invoke: {
            id: "disconnect",
            src: (context, event) => {
              return this.link.disconnect();
            },
            onDone: {
              target: "disconnected",
              actions: "resetErrorMessage"
            }
          }
        },
        failed: {
          on: {
            CONNECT: "connecting"
          }
        }
      }
    };
    const machine = Machine(machineSpec, {
      actions: {
        resetErrorMessage: assign({ errorMessage: null })
      }
    });
    this.service = interpret(machine).onTransition(state => {
      this.onStateChange(state.value, state.context.errorMessage, this);
    });
    this.service.start();
  }

  stateMatches(what) {
    return this.service.state.matches(what);
  }

  connect() {
    return this.service.send("CONNECT");
  }

  disconnect() {
    return this.service.send("DISCONNECT");
  }

  async read(args) {
    return this.query(args, "read");
  }

  async write(args) {
    return this.query(args, "write");
  }

  async query(args, type = "read") {
    const ensuredId = args.existingTxId || v4();
    const onClose = id => this.untrack(id);
    const { id, queryPromise, closeFn } = await this.link[type]({
      ...args,
      existingTxId: ensuredId
    });
    const closeFnMod = this.track(id, closeFn);
    const queryPromiseMod = this.addErrorCheck(
      queryPromise.then(res => {
        onClose(id);
        return res;
      }),
      closeFn
    );
    return {
      id,
      queryPromise: queryPromiseMod,
      closeFn: closeFnMod
    };
  }

  cancel(id, cb) {
    if (!this.trackedSessions[id]) {
      return;
    }
    this.trackedSessions[id](cb);
  }

  addErrorCheck(queryPromise, closeFn) {
    return queryPromise.catch(e => {
      // We want to react on certain errors
      // that should effect the state
      const errorType = this.link.classifyError(e);
      if (errorType === "UNAUTHORIZED") {
        this.service.send("UNAUTHORIZED");
      }
      if (errorType === "UNAVAILABLE") {
        this.service.send("UNAVAILABLE");
      }
      closeFn();

      // Bubble error to user land
      throw e;
    });
  }

  untrack(id) {
    if (this.trackedSessions[id]) {
      delete this.trackedSessions[id];
      return true;
    }
    return null;
  }

  track(id, closeFn) {
    const newCloseFn = (cb = () => {}) => {
      if (this.untrack(id)) {
        closeFn(cb);
      }
    };
    this.trackedSessions[id] = newCloseFn;
    return newCloseFn;
  }

  async ensureConnected(retries = 3) {
    if (!this.service.state.matches("connected")) {
      console.log(
        "Connection not established. Client is in state:",
        this.service.state.value
      );
      if (retries > 1) {
        await new Promise(resolve => setTimeout(() => resolve(), 1000));
        return this.ensureConnected(--retries);
      }
      return Promise.reject();
    }
    return Promise.resolve();
  }
}

module.exports = Neo4jClient;
