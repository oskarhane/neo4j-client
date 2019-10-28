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

  describe("queries and errors", () => {
    test("query happy path", async () => {
      // Given
      const query = {
        statement: "RETURN $x",
        parameters: { x: 1 },
        metadata: { client: "test" },
        existingTxId: 1
      };

      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      await client.read(query);

      // Then
      expect(client.stateMatches("connected")).toBe(true);
      expect(link.connect).toHaveBeenCalledTimes(1);
      expect(link.read).toHaveBeenCalledTimes(1);
      expect(link.read).toHaveBeenCalledWith(query);
    });

    test("unauthorized path = failed state", async () => {
      // Given
      const error = { code: "UNAUTHORIZED" };
      const classifyErrorMock = jest.fn(e => e.code);
      const readMock = jest.fn(() => {
        return { id: 1, queryPromise: Promise.reject(error) };
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.read = readMock;
      link.classifyError = classifyErrorMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      try {
        const { queryPromise } = await client.read({});
        await queryPromise;
      } catch (e) {}

      // Then
      expect(client.stateMatches("failed")).toBe(true);
      expect(classifyErrorMock).toHaveBeenCalledTimes(1);
      expect(classifyErrorMock).toHaveBeenCalledWith(error);
    });

    test("query error path = still connected", async () => {
      // Given
      const error = { code: "Test.Error" }; // Query error
      const classifyErrorMock = jest.fn(e => e.code);
      const readMock = jest.fn(() => {
        return { id: 1, queryPromise: Promise.reject(error) };
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.read = readMock;
      link.classifyError = classifyErrorMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      try {
        const { queryPromise } = await client.read({});
        await queryPromise;
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
      const closeFn = jest.fn(fn => fn());
      const readMock = jest.fn(() => {
        return { id: 10, queryPromise: Promise.resolve(), closeFn };
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.read = readMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      const { id, queryPromise } = await client.read(query);
      await queryPromise;

      // Then
      expect(link.read).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(0);

      // When
      // Time to cancel
      client.cancel(id, cancelDone);

      // Then
      expect(link.read).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(0);
      expect(cancelDone).toHaveBeenCalledTimes(0); // <- not called
    });
    test("cancelling query", async () => {
      // Given
      const query = { statement: "RETURN 1" };
      const cancelDone = jest.fn();
      const closeFn = jest.fn(fn => fn());
      const readMock = jest.fn(() => {
        return { id: 1, queryPromise: new Promise(() => {}), closeFn }; // Never ending promise
      });
      const { onStateChange, waitUntilStateMatches } = observeStateChangeUntil(
        "connected"
      );
      const link = new TestLink();
      link.read = readMock;

      // When
      const client = new Neo4jClient({ link, onStateChange });
      // Wait for client to connect
      await waitUntilStateMatches();
      const { id } = await client.read(query);

      // Then
      expect(link.read).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(0);

      // When
      // Time to cancel
      client.cancel(id, cancelDone);

      // Then
      expect(link.read).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(cancelDone).toHaveBeenCalledTimes(1); // <- called
    });
  });
});
