import { handleReviewRequest } from '../../src/reviewHandler.mjs';

export async function handler(event) {
  return handleReviewRequest({
    method: event.httpMethod,
    query: event.queryStringParameters || {},
    body: event.body || '',
    env: process.env,
  });
}
