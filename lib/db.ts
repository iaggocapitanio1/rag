import { DataAPIClient } from '@datastax/astra-db-ts';
import { PuppeteerWebBaseLoader } from '@langchain/community/document_loaders/web/puppeteer';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import OpenAI from 'openai';
import Settings from './settings';

type SimilarityDistance = 'cosine' | 'euclidean' | 'dot_product';

export const openai = new OpenAI({
  apiKey: Settings.openAIKey,
});

const f1Data = [
  'https://www.formula1.com/en/latest/all',
  'https://en.wikipedia.org/wiki/Formula_One',
];

// Initialize the client
const client = new DataAPIClient(Settings.astraDbApplicationToken);

export const db = client.db(Settings.astraDbUrl, {
  keyspace: Settings.astraDbKeyspace,
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const createCollection = async (
  distance: SimilarityDistance = 'dot_product'
) => {
  const collections = await db.listCollections();
  const exists = collections.some(
    (col) => col.name === Settings.astraDbCollection
  );

  if (exists) {
    console.log(`Collection '${Settings.astraDbCollection}' already exists.`);
    return db.collection(Settings.astraDbCollection); // return the existing collection
  }

  const collection = await db.createCollection(Settings.astraDbCollection, {
    vector: {
      dimension: 1536,
      metric: distance,
    },
  });

  console.log('Collection created:', collection);
  return collection;
};

const splitText = async (text: string) => {
  const chunks = await splitter.splitText(text);
  return chunks;
};

const loadSampleData = async () => {
  const collection = db.collection(Settings.astraDbCollection);

  for await (const url of f1Data) {
    const content = await scrapPage(url);
    const chunks = await splitText(content);
    for await (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
        encoding_format: 'float',
      });
      const vector = embedding.data[0].embedding;
      const res = await collection.insertOne({
        $vector: vector,
        text: chunk,
      });

      console.log(`Inserted chunk ${chunk} with ID: ${res.insertedId}`);
    }
  }
};

const scrapPage = async (url: string): Promise<string> => {
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },
    gotoOptions: {
      waitUntil: 'domcontentloaded',
    },
    evaluate: async (page, browser) => {
      const text = await page.evaluate(() => {
        const unwantedTags = [
          'script',
          'style',
          'noscript',
          'header',
          'footer',
          'nav',
          'aside',
        ];
        unwantedTags.forEach((tag) => {
          document.querySelectorAll(tag).forEach((el) => el.remove());
        });

        // Prefer main content if available
        const target = document.querySelector('article, main') || document.body;
        const rawText = target.textContent || '';

        // Cleanup:
        return rawText
          .split('\n') // split by line
          .map((line) => line.trim()) // trim each line
          .filter((line) => line.length > 0) // remove empty lines
          .join('\n'); // re-join clean lines
      });

      await browser.close();
      return text;
    },
  });

  return await loader.scrape();
};

createCollection()
  .then(() => loadSampleData())
  .catch((err) => {
    console.error('Error loading sample data:', err);
  });
