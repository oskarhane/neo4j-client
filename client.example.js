const { v1: neo4j } = require("neo4j-driver");
const Neo4jClient = require("./src/client");
const BoltLink = require("./src/bolt/bolt-link");
const { sleep } = require("./test-utils");

const creds = {
  u: "neo4j",
  p: "newpassword"
};
const auth = neo4j.auth.basic(creds.u, creds.p);

const creds2 = {
  u: "neo4j",
  p: "."
};
const auth2 = neo4j.auth.basic(creds2.u, creds2.p);

const url = "bolt://localhost:7687";
const opts = { encryption: false };

const boltLinks = [
  new BoltLink(url, auth, opts),
  new BoltLink(url, auth2, opts)
];
let currentLink = 0;

let retries = 10;

const onStateChange = async (state, errorMsg, client) => {
  console.log("state, errorMsg: ", state, errorMsg);
  if (client.stateMatches("failed")) {
    retries--;
    if (retries > 0) {
      if (errorMsg === client.errorTypes.UNAUTHORIZED) {
        currentLink = Math.abs(currentLink - 1);
        client.replaceLink(boltLinks[currentLink]);
      }
    }
  }
};

const client = new Neo4jClient({ link: boltLinks[currentLink], onStateChange });

const queries = Array(10).fill("RETURN rand()");

async function main(queries) {
  for (let query of queries) {
    await sleep(2);
    await run({ statement: query });
  }
  client.disconnect();
}

async function run(q) {
  try {
    const { queryPromise } = await client.read(q);
    const res = await queryPromise;
    console.log("res: ", res.records[0]._fields[0]);
  } catch (e) {
    console.log("e in test: ", e);
  }
}

main(queries);
