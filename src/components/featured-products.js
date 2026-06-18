import { fetchFeaturedProducts } from '../services/bnb-api.js';

const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fffaf7" />
          <stop offset="100%" stop-color="#f4e8e1" />
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#g)" />
      <rect x="120" y="120" width="360" height="360" rx="32" fill="#ffffff" opacity="0.92" />
      <path d="M220 350h160M220 290h160M220 230h95" stroke="#8b6f65" stroke-width="20" stroke-linecap="round" />
      <text x="300" y="430" text-anchor="middle" font-size="36" font-family="Arial, sans-serif" fill="#6f625d">San pham</text>
    </svg>
  `);

function formatVnd(value) {
  if (!value) return '';
  return `${Number(value).toLocaleString('vi-VN')}d`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCard(product) {
  const showPricing = Boolean(product.price || product.comparePrice);

  return `
    <article class="featured-products__card" data-product-card data-product-url="${escapeHtml(product.url)}" tabindex="0" role="link" aria-label="${escapeHtml(product.name)}">
      <div class="featured-products__media">
        ${product.discount ? `<span class="featured-products__badge">-${escapeHtml(product.discount)}%</span>` : ''}
        <img
          src="${escapeHtml(product.image || FALLBACK_IMAGE)}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
          decoding="async"
          data-product-image
        >
      </div>
      <div class="featured-products__body">
        <h3>${escapeHtml(product.name)}</h3>
        ${showPricing ? `
          <div class="featured-products__pricing">
            ${product.price ? `<strong>${escapeHtml(formatVnd(product.price))}</strong>` : ''}
            ${product.comparePrice ? `<span>${escapeHtml(formatVnd(product.comparePrice))}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function skeletonMarkup(count = 5) {
  return Array.from({ length: count }, () => `
    <article class="featured-products__card featured-products__card--skeleton" aria-hidden="true">
      <div class="featured-products__media"><div class="featured-products__skeleton featured-products__skeleton--image"></div></div>
      <div class="featured-products__body">
        <div class="featured-products__skeleton featured-products__skeleton--title"></div>
        <div class="featured-products__skeleton featured-products__skeleton--price"></div>
      </div>
    </article>
  `).join('');
}

function injectProductSchema(products) {
  const previous = document.getElementById('featured-products-schema');
  if (previous) previous.remove();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((product, index) => {
      const item = {
        '@type': 'Product',
        name: product.name,
        url: product.url,
      };

      if (product.image) item.image = [product.image];
      if (product.price) {
        item.offers = {
          '@type': 'Offer',
          priceCurrency: 'VND',
          price: product.price,
          availability: 'https://schema.org/InStock',
          url: product.url,
        };
      }

      return {
        '@type': 'ListItem',
        position: index + 1,
        item,
      };
    }),
  };

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'featured-products-schema';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function attachCardEvents(root) {
  root.querySelectorAll('[data-product-card]').forEach((card) => {
    const url = card.getAttribute('data-product-url');
    if (!url) return;

    const openProduct = () => window.open(url, '_blank', 'noopener');

    card.addEventListener('click', openProduct);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProduct();
      }
    });
  });

  root.querySelectorAll('[data-product-image]').forEach((image) => {
    image.addEventListener('error', () => {
      image.src = FALLBACK_IMAGE;
    }, { once: true });
  });
}

function initSlider(root, grid) {
  const btnLeft = root.querySelector('[data-products-arrow-left]');
  const btnRight = root.querySelector('[data-products-arrow-right]');
  if (!btnLeft || !btnRight) return;

  const updateArrows = () => {
    const scrollLeft = grid.scrollLeft;
    const maxScroll = grid.scrollWidth - grid.clientWidth;
    
    btnLeft.disabled = scrollLeft <= 2;
    btnRight.disabled = scrollLeft >= maxScroll - 2;
  };

  btnLeft.addEventListener('click', () => {
    // Scroll by roughly 3 items (192px each including gap)
    grid.scrollBy({ left: -192 * 3, behavior: 'smooth' });
  });

  btnRight.addEventListener('click', () => {
    // Scroll by roughly 3 items (192px each including gap)
    grid.scrollBy({ left: 192 * 3, behavior: 'smooth' });
  });

  grid.addEventListener('scroll', updateArrows, { passive: true });
  
  // Use ResizeObserver to update arrow status on screen resize
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => {
      updateArrows();
    });
    observer.observe(grid);
  }

  // Initial update
  updateArrows();
}

export async function mountFeaturedProducts() {
  const root = document.querySelector('[data-featured-products]');
  if (!root) return;

  const grid = root.querySelector('[data-featured-products-grid]');
  if (!grid) return;

  grid.innerHTML = skeletonMarkup(5);

  try {
    const payload = await fetchFeaturedProducts();
    // Do not slice to 5, allow all loaded products (up to 12) to be displayed
    const products = Array.isArray(payload?.products) ? payload.products : [];

    if (!payload?.ok || products.length === 0) {
      throw new Error(payload?.message || 'Khong the tai san pham');
    }

    grid.innerHTML = products.map(createCard).join('');

    attachCardEvents(grid);
    injectProductSchema(products);
    initSlider(root, grid);
  } catch (error) {
    grid.innerHTML = '';
  }
}
