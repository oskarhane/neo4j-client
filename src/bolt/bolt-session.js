class BoltSession {
  constructor(session) {
    this.session = session;
  }
  run(statement, params, metadata) {
    return this.session.run(statement, params, metadata);
  }
  close() {
    this.session.close();
  }
}

module.exports = BoltSession;
