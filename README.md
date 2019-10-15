## Neo4j Client

A Neo4j Client somewhat inspired by [https://www.apollographql.com/docs/react/api/apollo-client/](ApolloClient).

### Explicit client states

The client is explicit states and events so user code can always check the current state and trust it.

### Separation of client and connections

Connections are invisible in the code. We work with `read` and `write` statements.

### Usage

See test file for more usage examples.

```js
const boltLink = new BoltLink(url, auth, opts);
const client = new Neo4jClient({ link: boltLink });

async function run(q) {
  try {
    const [id, res] = await client.read({ statement: q });
    return await res;
  } catch (e) {
    console.log("errored: ", e);
    throw e;
  }
}
```
