const { v1: neo4j } = require("neo4j-driver");

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
    return this.driver.session(...args);
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
