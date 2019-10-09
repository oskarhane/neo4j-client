const { v1: neo4j } = require("neo4j-driver");
const BoltClient = require("./client");

const u = "neo4j";
const p = "newpasswrd";

const auth = neo4j.auth.basic(u, p);
const opts = { encryption: false };

const client = new BoltClient("bolt://localhost:7687", auth, opts);

async function main() {
  try {
    const [id, p] = await client.read({ statement: "RETURN rand()" });
    const res = await p;
    console.log("res: ", res.records[0]._fields[0]);
  } catch (e) {
    console.log("e in test: ", e);
  }
}

main();
