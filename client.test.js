const { v1: neo4j } = require("neo4j-driver");
const Neo4jClient = require("./client");
const BoltLink = require("./bolt/bolt-link");

const u = "neo4j";
const p = "newpassword";
const url = "bolt://localhost:7687";

const auth = neo4j.auth.basic(u, p);
const opts = { encryption: false };

let retries = 10;

const onStateChange = (state, errorMsg, client) => {
  console.log("state, errorMsg: ", state, errorMsg);
  if (client.stateMatches("failed") && --retries) {
    client.connect();
  }
};

const boltLink = new BoltLink(url, auth, opts);
const client = new Neo4jClient({ link: boltLink, onStateChange });

const queries = Array(2).fill("RETURN rand()");

async function main(queries) {
  for (let query of queries) {
    await sleep(2);
    await run({ statement: query });
  }
  client.disconnect();
}

async function run(q) {
  try {
    const [id, p] = await client.read(q);
    const res = await p;
    console.log("res: ", res.records[0]._fields[0]);
  } catch (e) {
    console.log("e in test: ", e);
  }
}

function sleep(secs) {
  return new Promise(resolve => setTimeout(() => resolve(), secs * 1000));
}

main(queries);
