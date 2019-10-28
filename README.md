## Neo4j Client

A Neo4j Client somewhat inspired by [ApolloClient](https://www.apollographql.com/docs/react/api/apollo-client/).

### Explicit client states

The client is explicit states and events so user code can always check the current state and trust it.

### Separation of client and connections

Connections are invisible in the code. We work with `read` and `write` statements.
This full chaining mechanism of Link's in ApolloClient is not implentented as this stage, but ideally will at some point.

### Usage

See test file for more usage examples.

```js
const boltLink = new BoltLink(url, auth, opts);
const client = new Neo4jClient({ link: boltLink });

async function run(q) {
  try {
    const { id, queryPromise } = await client.read({ statement: q });
    return await queryPromise;
  } catch (e) {
    console.log("errored: ", e);
    throw e;
  }
}
```
