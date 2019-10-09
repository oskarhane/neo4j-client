const { v1: neo4j } = require("neo4j-driver");
const { Machine, assign, interpret } = require("xstate");
const { v4 } = require("uuid");

class BoltClient {
  constructor(url, auth, opts = {}) {
    this.url = url;
    this.auth = auth;
    this.opts = opts;
    this.service = null;
    this.drivers = { direct: undefined, routed: undefined };
    this.init();
    this.service.send("CONNECT");
    this.statementQueue = [];
    this.trackedSessions = {};
  }
  init() {
    const machineSpec = {
      id: "connection",
      initial: "disconnected",
      context: {
        errorMessage: undefined
      },
      states: {
        disconnected: {
          on: {
            CONNECT: "connecting"
          }
        },
        connecting: {
          invoke: {
            id: "connect",
            src: () => {
              return this.connect();
            },
            onDone: {
              target: "connected"
            },
            onError: {
              target: "failed",
              actions: assign({
                errorMessage: (context, event) => {
                  console.log("event: ", event);
                  return event.data.message;
                }
              })
            }
          }
        },
        connected: {
          on: {
            DISCONNECT: "disconnecting",
            UNAUTHORIZED: "disconnecting"
          }
        },
        disconnecting: {
          invoke: {
            id: "disconnect",
            src: (context, event) => {
              return this.disconnect();
            },
            onDone: {
              target: "disconnected"
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
    const machine = Machine(machineSpec);
    this.service = interpret(machine).onTransition(state => {
      console.log(state.value);
    });
    this.service.start();
  }
  connect() {
    try {
      const driver = neo4j.driver(this.url, this.auth, this.opts);
      this.driver = driver;
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
  disconnect() {
    if (this.driver) {
      this.driver.close();
      this.driver = undefined;
    }
    return Promise.resolve();
  }

  async session(...args) {
    try {
      await this.ensureConnected(3);
    } catch (e) {
      return Promise.reject("Could not establish session. Are you connected?");
    }
    return Promise.resolve(this.driver.session(...args));
  }

  async read({ statement = "", parameters = {}, existingTxId, metadata }) {
    const session = await this.session(neo4j.session.READ);
    return this._runImplicitTx(session, {
      statement,
      parameters,
      existingTxId,
      metadata
    });
  }

  async write({ statement = "", parameters = {}, existingTxId, metadata }) {
    const session = await this.session(neo4j.session.WRITE);
    return this._runImplicitTx(session, {
      statement,
      parameters,
      existingTxId,
      metadata
    });
  }

  cancel(id, cb) {
    if (!this.trackedSessions[id]) {
      return;
    }
    this.trackedSessions[id](cb);
  }

  _runImplicitTx(
    session,
    { statement = "", parameters = {}, existingTxId, metadata }
  ) {
    const id = existingTxId || v4();
    const sessionMetadata = metadata ? { metadata: metadata } : undefined;

    const closeFn = (cb = () => {}) => {
      session.close(cb);
      if (this.trackedSessions[id]) {
        delete this.trackedSessions[id];
      }
    };

    this.trackedSessions[id] = closeFn;

    const runPromise = session
      .run(statement, parameters, sessionMetadata)
      .then(r => {
        closeFn();
        return r;
      })
      .catch(e => {
        if (e.code === "Neo.ClientError.Security.Unauthorized") {
          this.service.send("UNAUTHORIZED");
        }
        closeFn();
        throw e;
      });
    return [id, runPromise];
  }

  async ensureConnected(retries = 3) {
    if (!this.service.state.matches("connected")) {
      console.log(
        "Connection not established. Client is in state:",
        this.service.state.value
      );
      if (retries) {
        await new Promise(resolve => setTimeout(() => resolve(), 1000));
        return this.ensureConnected(--retries);
      }
      return Promise.reject();
    }
    return Promise.resolve();
  }
}

module.exports = BoltClient;
