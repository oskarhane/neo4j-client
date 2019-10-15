module.exports.TestLink = function() {
  this.sessionTypes = {
    READ: "READ",
    WRITE: "WRITE"
  };
  this.connect = jest.fn(() => Promise.resolve()); // Successful by default
  this.disconnect = jest.fn();
  this.session = jest.fn(() => new TestSession());
  this.classifyError = jest.fn();
};

module.exports.TestSession = function() {
  this.run = jest.fn(() => Promise.resolve());
  this.close = jest.fn(cb => cb && cb());
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
