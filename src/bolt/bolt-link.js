const { v1: neo4j } = require("neo4j-driver");
const BoltSession = require("./bolt-session");

class BoltLink {
  constructor(url, auth, opts) {
    this.url = url;
    this.auth = auth;
    this.opts = opts;
    this.driver = null;
    this.sessionTypes = {
      READ: neo4j.session.READ,
      WRITE: neo4j.session.WRITE
    };
  }
  async connect() {
    try {
      const driver = neo4j.driver(this.url, this.auth, this.opts);
      this.driver = driver;
      await this.verify();
      return true;
    } catch (e) {
      throw e;
    }
  }
  async verify() {
    let session;
    try {
      session = this.driver.session(this.sessionTypes.READ);
      await session.run("CALL db.indexes()");
      session.close();
    } catch (e) {
      // Only invalidate the connection if not available
      // or not authed
      // or credentials have expired
      // or if user hits rate limit
      session.close();
      const invalidStates = [
        "ServiceUnavailable",
        "Neo.ClientError.Security.Unauthorized",
        "Neo.ClientError.Security.CredentialsExpired",
        "Neo.ClientError.Security.AuthenticationRateLimit"
      ];
      if (!e.code || invalidStates.includes(e.code)) {
        throw e;
      }
    }
    return true;
  }
  disconnect() {
    if (this.driver) {
      this.driver.close();
      this.driver = undefined;
    }
    return Promise.resolve();
  }
  session(...args) {
    const session = this.driver.session(...args);
    return new BoltSession(session);
  }
  async read({ statement = "", parameters = {}, existingTxId, metadata }) {
    const session = await this.session(this.sessionTypes.READ);
    return this._runImplicitTx(session, {
      statement,
      parameters,
      existingTxId,
      metadata
    });
  }
  async write({ statement = "", parameters = {}, existingTxId, metadata }) {
    const session = await this.session(this.sessionTypes.WRITE);
    return this._runImplicitTx(session, {
      statement,
      parameters,
      existingTxId,
      metadata
    });
  }

  _runImplicitTx(
    session,
    { statement = "", parameters = {}, existingTxId, metadata }
  ) {
    const id = existingTxId || v4();
    const sessionMetadata = metadata ? { metadata: metadata } : undefined;

    const closeFn = (cb = () => {}) => {
      session.close(cb);
    };

    const queryPromise = session
      .run(statement, parameters, sessionMetadata)
      .then(r => {
        closeFn();
        return r;
      });
    return { id, queryPromise, closeFn };
  }

  classifyError(e) {
    if (e.code === "Neo.ClientError.Security.Unauthorized") {
      return "UNAUTHORIZED";
    }
    if (e.code === "ServiceUnavailable") {
      return "UNAVAILABLE";
    }
    return null;
  }
}

module.exports = BoltLink;
