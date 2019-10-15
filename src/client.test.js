const Neo4jClient = require("./client");
const {
  observeStateChangeUntil,
  TestLink,
  TestSession,
  sleep
} = require("../test-utils");

describe("neo4j-client", () => {
  describe("connections", () => {
    test("Connecting happy path", async () => {
      // Given
      const sessionMock = jest.fn();
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });

      // Wait for client to connect
      await waitUntilStateMatches();

      // Then
      expect(client.stateMatches("connected")).toBe(true);
      expect(link.connect).toHaveBeenCalledTimes(1);
      expect(link.disconnect).toHaveBeenCalledTimes(0);
      expect(sessionMock).toHaveBeenCalledTimes(0);
    });

    test("Connecting fail ends up in failed state", async () => {
      // Given
      const connectMock = jest.fn(() =>
        Promise.reject({ code: "Any error code" })
      );
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "failed"
      );
      const link = new TestLink();
      link.connect = connectMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });

      // Wait for client to connect
      await waitUntilStateMatches();

      // Then
      expect(client.stateMatches("failed")).toBe(true);
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("sessions", () => {
    test("session happy path", async () => {
      // Given
      const query = {
        statement: "RETURN $x",
        parameters: { x: 1 },
        metadata: { client: "test" }
      };
      let session;
      const sessionMock = jest.fn(() => {
        session = new TestSession();
        return session;
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      await client.read(query);

      // Then
      expect(client.stateMatches("connected")).toBe(true);
      expect(link.connect).toHaveBeenCalledTimes(1);
      expect(sessionMock).toHaveBeenCalledTimes(1);
      expect(sessionMock).toHaveBeenCalledWith(link.sessionTypes.READ);
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);
      expect(session.run).toHaveBeenCalledWith(
        query.statement,
        query.parameters,
        { metadata: query.metadata }
      );
    });

    test("session unauthorized path = failed state", async () => {
      // Given
      const error = { code: "UNAUTHORIZED" };
      const classifyErrorMock = jest.fn(e => e.code);
      let session;
      const sessionMock = jest.fn(() => {
        session = new TestSession();
        session.run = jest.fn(() => Promise.reject(error));
        return session;
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;
      link.classifyError = classifyErrorMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      try {
        const [_, res] = await client.read({});
        await res;
      } catch (e) {}

      // Then
      expect(client.stateMatches("failed")).toBe(true);
      expect(classifyErrorMock).toHaveBeenCalledTimes(1);
      expect(classifyErrorMock).toHaveBeenCalledWith(error);
    });

    test("session query error path = still connected", async () => {
      // Given
      const error = { code: "Test.Error" }; // Query error
      const classifyErrorMock = jest.fn(e => e.code);
      let session;
      const sessionMock = jest.fn(() => {
        session = new TestSession();
        session.run = jest.fn(() => Promise.reject(error));
        return session;
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;
      link.classifyError = classifyErrorMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      try {
        const [_, res] = await client.read({});
        await res;
      } catch (e) {}

      // Then
      expect(client.stateMatches("failed")).toBe(false);
      expect(client.stateMatches("connected")).toBe(true);
      expect(classifyErrorMock).toHaveBeenCalledTimes(1);
      expect(classifyErrorMock).toHaveBeenCalledWith(error);
    });
  });
  describe("query tracking", () => {
    test("cancelling a finished query doesnt throw, but doesnt call done fn either", async () => {
      // Given
      const query = { statement: "RETURN 1" };
      const cancelDone = jest.fn();
      let session;
      const sessionMock = jest.fn(() => {
        session = new TestSession();
        return session;
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      const [id] = await client.read(query);

      // Then
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);

      // When
      // Time to cancel
      client.cancel(id, cancelDone);

      // Then
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);
      expect(cancelDone).toHaveBeenCalledTimes(0); // <- not called
    });
    test("cancelling query", async () => {
      // Given
      const query = { statement: "RETURN 1" };
      const cancelDone = jest.fn();
      let session;
      const sessionMock = jest.fn(() => {
        session = new TestSession();
        session.run = jest.fn(() => new Promise(() => {})); // never ending promise
        return session;
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.session = sessionMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      const [id] = await client.read(query);

      // Then
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(0);

      // When
      // Time to cancel
      client.cancel(id, cancelDone);

      // Then
      expect(session.run).toHaveBeenCalledTimes(1);
      expect(session.close).toHaveBeenCalledTimes(1);
      expect(cancelDone).toHaveBeenCalledTimes(1); // <- called
    });
  });
});
