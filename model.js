// Dataspecer data specification endpoint
const API_ENDPOINT = "https://backend.dataspecer.com/data-specification";

// MM-evocat schema categories endpoint
const MM_API_ENDPOINT = "https://nosql.ms.mff.cuni.cz/mmcat-api/schema-categories";

// Change this to use multiple independent instances under the same DS backend
// Used as a key to store MM project ID in DS
const DATASPECER_MM_METADATA = "http://nosql.ms.mff.cuni.cz/mmcat/dataspecer-self-metadata";



const CREATE_SPECIFICATION_PAYLOAD = {
  "type": "http://dataspecer.com/vocabularies/data-specification/documentation",
  "tags": []
};

export async function fetchProjects(filter = (entry) => true) {
  const response = await fetchAsJson(API_ENDPOINT);
  const result = [];
  const requests = response.map(async item => {
    if (!filter(item)) {
      return;
    }
    const store = selectWritablePimStore(item);
    if (store == null) {
      console.warning("Missing store.", item);
      return;
    }
    const storeData = await fetchAsJson(store.url);
    const schemaResource = storeData?.resources?.[item.pim];
    // We have the right resource.
    result.push({
      ...item,
      'iri': item.iri,
      'mmId': item.artefactConfiguration?.[DATASPECER_MM_METADATA]?.projectId ?? null,
      "tags": item.tags,
      "label": schemaResource?.pimHumanLabel,
      'pimStore': store.url
    });
  });
  await Promise.all(requests);
  return result;
}

async function fetchAsJson(url) {
  return await (await fetch(url)).json();
}

function selectWritablePimStore(entry) {
  for (const storeEntry of entry.pimStores) {
    // We can ignore read only stores.
    if (storeEntry.isReadOnly) {
      continue;
    }
    return storeEntry;
  }
  console.error("Missing writable store for project.", entry);
  return null;
}

export function selectLangString(value) {
  return nonEmpty(value?.["en"]) ?? nonEmpty(value?.["cs"]) ?? "Project without name";
}

function nonEmpty(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  } else {
    return value;
  }
}

export async function createStandardSpecification(label) {
  let project =
    await fetchPostJson(API_ENDPOINT, CREATE_SPECIFICATION_PAYLOAD);
  const store = selectWritablePimStore(project);
  if (store == null) {
    throw new Error("Can't create project.");
  }
  await initializeProject(store, project.pim, label);
  return project;
}

async function fetchPostJson(url, content, method = "POST") {
  return await (await fetch(url, {
    "method": method,
    "headers": {
      "Content-Type": "application/json",
    },
    "body": JSON.stringify(content),
  })).json();
}

async function initializeProject(store, pimResourceIri, label) {
  const createId = uuid();
  const setLabelId = uuid();
  const setDescriptionId = uuid();

  const requestContent = {
    "operations": [
      {
        "types": [
          "core-operation",
          "https://ofn.gov.cz/slovník/pim/CreateSchema"
        ],
        "iri": `https://ofn.gov.cz/operation/${createId}`,
        "parent": null,
        "pimNewIri": null,
        "pimHumanLabel": null,
        "pimHumanDescription": null
      }, {
        "types": [
          "core-operation",
          "https://ofn.gov.cz/slovník/pim/SetHumanLabel"
        ],
        "iri": `https://ofn.gov.cz/operation/${setLabelId}`,
        "parent": `https://ofn.gov.cz/operation/${createId}`,
        "pimResource": pimResourceIri,
        "pimHumanLabel": { "en": label }
      }, {
        "types": [
          "core-operation",
          "https://ofn.gov.cz/slovník/pim/SetHumanDescription"
        ],
        "iri": `https://ofn.gov.cz/operation/${setDescriptionId}`,
        "parent": `https://ofn.gov.cz/operation/${setLabelId}`,
        "pimResource": pimResourceIri,
        "pimHumanDescription": {}
      }],
    "resources": {
      [pimResourceIri]: {
        "types": [
          "https://ofn.gov.cz/slovník/pim/Schema"
        ],
        "iri": pimResourceIri,
        "pimHumanLabel": { "en": label },
        "pimHumanDescription": {},
        "pimParts": []
      }
    }
  };
  return await await fetch(store.url, {
    "method": "PUT",
    "headers": {
      "Content-Type": "application/json",
    },
    "body": JSON.stringify(requestContent),
  });
}

/**
 * Time based identifier.
 */
function uuid() {
  const head = Date.now();
  const tail =  ([1e3]+-4e3+-8e3).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
  return `${head}-${tail}`;
};

export async function createAndSetMmProject(dataSpecification) {
  // Create new MM project
  const {id: mmToolId} = await fetchPostJson(MM_API_ENDPOINT, {
    jsonValue: JSON.stringify({label: dataSpecification.label})
  });

  // Update the data specification locally
  dataSpecification.artefactConfiguration = {
    ...dataSpecification.artefactConfiguration,
    [DATASPECER_MM_METADATA]: {
      ...dataSpecification.artefactConfiguration?.[DATASPECER_MM_METADATA],
      projectId: mmToolId
    }
  }
  dataSpecification.mmId = mmToolId;

  // Modify the data specification on the server
  await fetchPostJson(API_ENDPOINT, {
    dataSpecificationIri: dataSpecification.iri,
    update: {
      artefactConfiguration: dataSpecification.artefactConfiguration,
    }
  }, "PUT");
}

export async function unlinkMmProject(dataSpecification) {
  // Update the data specification locally
  dataSpecification.artefactConfiguration = {
    ...dataSpecification.artefactConfiguration,
    [DATASPECER_MM_METADATA]: {
      ...dataSpecification.artefactConfiguration?.[DATASPECER_MM_METADATA],
      projectId: null
    }
  }
  dataSpecification.mmId = null;

  // Modify the data specification on the server
  await fetchPostJson(API_ENDPOINT, {
    dataSpecificationIri: dataSpecification.iri,
    update: {
      artefactConfiguration: dataSpecification.artefactConfiguration,
    }
  }, "PUT");
}