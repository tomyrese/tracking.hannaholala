export async function handler(event) {
  const query = event.queryStringParameters || {};
  const points = query.points || '';

  if (!points) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ ok: false, message: 'Missing points parameter' }),
    };
  }

  const urls = [
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${points}?overview=full&geometries=geojson`,
    `https://router.project-osrm.org/route/v1/driving/${points}?overview=full&geometries=geojson`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(data),
        };
      } else {
        console.warn(`Upstream routing URL returned status ${response.status}: ${url}`);
      }
    } catch (err) {
      console.error(`Error requesting upstream route URL ${url}:`, err.message);
    }
  }

  return {
    statusCode: 502,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ ok: false, message: 'Failed to fetch route from upstream services' }),
  };
}
