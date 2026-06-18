import { handleDiscountRequest } from '../../src/discountHandler.mjs';

export async function handler(event) {
  return handleDiscountRequest({
    method: event.httpMethod,
    query: event.queryStringParameters || {},
    body: event.body || '',
    env: process.env,
  });
}
