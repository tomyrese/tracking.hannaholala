function getApiBaseUrl() {
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3000';
  }

  return window.location.origin;
}

export async function fetchFeaturedProducts() {
  const url = new URL('/.netlify/functions/bnb-products', getApiBaseUrl());
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error('Khong the tai san pham');
  }

  return payload;
}
