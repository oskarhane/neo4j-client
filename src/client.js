import { Machine, assign, interpret } from "xstate";

class BoltClient {
  constructor(url, auth, opts = {}) {
    this.url = url;
    this.auth = auth;
    this.opts = opts;
    this.service = null;
    this.init();
    this.connect();
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
            src: (context, event) => {
              console.log("yo");
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
            DISCONNECT: "disconnecting"
          }
        },
        disconnecting: {
          invoke: {
            id: "disconnect",
            src: (context, event) => {
              console.log("disconnecting");
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
    this.service.send("CONNECT");
  }
}

module.exports = BoltClient;
