import { CosmosClient } from "@azure/cosmos";

const {
  COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER
} = process.env;

const cosmos = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
const container = cosmos.database(COSMOS_DB).container(COSMOS_CONTAINER);

export default async function (context, req) {
  try {
    const album = req.query.album;
    if (!album) {
      context.res = { status: 400, body: { error: "album query param required" } };
      return;
    }

    const query = {
      query: "SELECT c.id, c.album, c.name, c.url, c.tags, c.caption, c.createdAt FROM c WHERE c.album = @album ORDER BY c.createdAt DESC",
      parameters: [{ name: "@album", value: album }]
    };

    const { resources } = await container.items.query(query).fetchAll();
    context.res = { status: 200, body: resources };

  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: e.message } };
  }
}
