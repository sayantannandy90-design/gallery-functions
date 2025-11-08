import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const {
  COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER,
  STORAGE_CONNECTION_STRING, STORAGE_CONTAINER
} = process.env;

const cosmos = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
const container = cosmos.database(COSMOS_DB).container(COSMOS_CONTAINER);

export default async function (context, req) {
  try {
    const { album, name } = req.body || {};

    if (!album || !name) {
      context.res = { status: 400, body: { error: "album + name required" } };
      return;
    }

    // Blob deletion
    const blobService = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
    const containerClient = blobService.getContainerClient(STORAGE_CONTAINER);
    const blobClient = containerClient.getBlobClient(`${album}/${name}`);
    await blobClient.deleteIfExists();

    // Cosmos deletion
    const id = `${album}::${name}`;
    await container.item(id, album).delete();   // partition key = album

    context.res = { status: 200, body: { ok: true, deleted: id } };

  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: e.message } };
  }
}
