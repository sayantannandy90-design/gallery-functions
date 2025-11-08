import fetch from "node-fetch";
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const {
  VISION_ENDPOINT, VISION_KEY,
  COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER,
  STORAGE_CONNECTION_STRING, STORAGE_CONTAINER,
  SAS_READ_EXPIRY_MINUTES = "60"
} = process.env;

const cosmos = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
const container = cosmos.database(COSMOS_DB).container(COSMOS_CONTAINER);

export default async function (context, req) {
  try {
    const { album, name } = req.body || {};
    if (!album || !name) {
      context.res = { status: 400, body: { error: "album and name required" } };
      return;
    }

    // Build blob client
    const blobService = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
    const containerClient = blobService.getContainerClient(STORAGE_CONTAINER);
    const blobClient = containerClient.getBlobClient(`${album}/${name}`);

    // Build SAS token
    const { accountName, accountKey } = parseConnString(STORAGE_CONNECTION_STRING);
    const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + Number(SAS_READ_EXPIRY_MINUTES) * 60 * 1000);

    const sas = generateBlobSASQueryParameters({
      containerName: STORAGE_CONTAINER,
      blobName: `${album}/${name}`,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(Date.now() - 60 * 1000),
      expiresOn,
      protocol: SASProtocol.Https
    }, sharedKey).toString();

    const blobSasUrl = `${blobClient.url}?${sas}`;

    // Vision API
    const visionUrl = `${VISION_ENDPOINT}vision/v3.2/analyze?visualFeatures=Tags,Description`;

    const visionRes = await fetch(visionUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": VISION_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: blobSasUrl })
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      context.res = { status: 502, body: { error: "Vision API failed", detail: errText } };
      return;
    }

    const vision = await visionRes.json();
    const tags = (vision.tags || []).map(t => t.name);
    const caption = vision.description?.captions?.[0]?.text || null;

    // Save to Cosmos
    const doc = {
      id: `${album}::${name}`,
      album,
      name,
      url: blobClient.url,
      tags,
      caption,
      createdAt: new Date().toISOString()
    };

    await container.items.upsert(doc);

    context.res = { status: 200, body: { ok: true, doc } };

  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: { error: e.message } };
  }
};

function parseConnString(cs) {
  const parts = Object.fromEntries(cs.split(";").map(p => p.split("=")));
  return { accountName: parts.AccountName, accountKey: parts.AccountKey };
}
