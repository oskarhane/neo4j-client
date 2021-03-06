const { v4 } = require("uuid");

module.exports.TestLink = function() {
  this.sessionTypes = {
    READ: "READ",
    WRITE: "WRITE"
  };
  this.connect = jest.fn(() => Promise.resolve()); // Successful by default
  this.disconnect = jest.fn();
  this.session = jest.fn((...args) => ({ run: jest.fn(), close: jest.fn() }));
  this.classifyError = jest.fn();
  this.read = jest.fn((...args) => {
    return { id: args.id || v4(), queryPromise: Promise.resolve() };
  });
  this.write = jest.fn((...args) => {
    return { id: args.id || v4(), queryPromise: Promise.resolve() };
  });
};

module.exports.sleep = secs => {
  return new Promise(resolve => setTimeout(() => resolve(), secs * 1000));
};

module.exports.waitUntilNumberOfCalls = async (mockFn, num) => {
  const timeout = 3;
  const interval = 0.1;
  return new Promise(async (resolve, reject) => {
    if (mockFn.mock.calls.length >= num) {
      return resolve();
    }
    for (let i = timeout / interval; i > 0; i--) {
      if (mockFn.mock.calls.length >= num) {
        return resolve();
      }
      await sleep(interval);
    }
    reject();
  });
};

module.exports.observeStateChangeUntil = wantedState => {
  const timeout = 3;
  let didResolve = null;
  let resolveRef;
  let timeoutTimer;

  const onStateChange = (state, errorMsg, client) => {
    if (didResolve === null) {
      checkIfMatches(state);
    }
  };

  const outerResolve = () => {
    didResolve = true;
    clearTimeout(timeoutTimer);
    if (resolveRef) {
      resolveRef();
    }
  };

  const checkIfMatches = currentState => {
    return currentState === wantedState ? outerResolve() : null;
  };

  const waitUntilStateMatches = () => {
    return new Promise((resolve, reject) => {
      resolveRef = resolve;
      if (didResolve === true) {
        return resolve();
      }
      timeoutTimer = setTimeout(() => {
        didResolve = false;
        reject("Did not reach state: " + wantedState);
      }, timeout * 1000);
    });
  };

  return {
    onStateChange,
    waitUntilStateMatches
  };
};
