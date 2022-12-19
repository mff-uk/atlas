const SCHEMA_TYPE = "https://ofn.gov.cz/slovník/pim/Schema";

const SPECIFICATION_LIST = "https://backend.dataspecer.com/data-specification";

export async function fetchProjects(filter = (entry) => true) {
  const response = await fetchAsJson(SPECIFICATION_LIST);
  const result = [];
  const requests = response.map(async item => {
    if (!filter(item)) {
      return;
    }
    for (const storeEntry of item.pimStores) {
      // We can ignore read only stores.
      if (storeEntry.isReadOnly) {
        continue;
      }
      const storeData = await fetchAsJson(storeEntry.url);
      const schemaResource = storeData.resources[item.pim];
      if (schemaResource === undefined) {
        continue;
      }
      // We have the right resource.
      result.push({
        'iri': item.iri,
        "tags": item.tags,
        "label": schemaResource.pimHumanLabel,
        'pimStore': storeEntry.url
      });
    }
  });
  await Promise.all(requests);
  return result;
}

async function fetchAsJson(url) {
  return await (await fetch(url)).json();
}

export function selectLangString(value) {
  return nonEmpty(value["en"]) ?? nonEmpty(value["cs"]) ?? "Project without name";
}

function nonEmpty(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  } else {
    return value;
  }
}
