import Settings from '@/lib/settings';
import { openai as openaiProvider } from '@ai-sdk/openai';
import { DataAPIClient } from '@datastax/astra-db-ts';
import { streamText } from 'ai';
import OpenAI from 'openai';
export const openai = new OpenAI({
  apiKey: Settings.openAIKey,
});

export const maxDuration = 30; // seconds

const client = new DataAPIClient(Settings.astraDbApplicationToken);

export const db = client.db(Settings.astraDbUrl, {
  keyspace: Settings.astraDbKeyspace,
});

const instructions = `
- Answer the user naturally, as a well-informed human.
- If the context doesn't answer it, rely on your own knowledge.
- Don't mention sources or context explicitly.
- Use Markdown formatting.
- Never return images or audio.`;

const generateTemplate = (context: string, question: string) => `
You are an AI expert on Formula 1.

Context:
${context}

Instructions:
${instructions}

Question:
${question}
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body;
    const question = messages[messages.length - 1]?.content;

    if (!question || typeof question !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid question' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const collection = db.collection(Settings.astraDbCollection);

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
      encoding_format: 'float',
    });

    const vector = embeddingResponse?.data?.[0]?.embedding;

    if (!vector || !Array.isArray(vector)) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate embedding' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const cursor = collection.find(
      {},
      {
        limit: 5,
        sort: {
          $vector: vector,
        },
      }
    );

    const docs = await cursor.toArray();

    console.log('Found documents:', docs);

    const results = docs.map((doc) => ({
      id: doc._id,
      text: doc.text,
    }));

    const context = results.map((doc) => doc.text).join('\n\n');
    const template = generateTemplate(context, question);

    const streamResult = streamText({
      model: openaiProvider('gpt-4o'),
      maxTokens: 300,
      messages: [{ role: 'system', content: template }, ...messages],
    });

    return streamResult.toDataStreamResponse({
      status: 200,
      statusText: 'OK',
      getErrorMessage(error) {
        console.error('Error in stream:', error);
        return 'Internal Server Error';
      },
    });
  } catch (error) {
    console.error('Error in POST /api', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
