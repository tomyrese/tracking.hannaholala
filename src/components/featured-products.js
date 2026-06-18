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

function initSlider(root, grid, N, cloneCount) {
  const btnLeft = root.querySelector('[data-products-arrow-left]');
  const btnRight = root.querySelector('[data-products-arrow-right]');
  if (!btnLeft || !btnRight || N === 0) return;

  const cardWidth = 192; // 184px width + 8px gap
  let targetScroll = cloneCount * cardWidth;
  let animationFrameId = null;

  // Set initial scroll position to skip prepended clones and start on the first real item
  grid.scrollLeft = targetScroll;

  const handleWrapAround = () => {
    const current = grid.scrollLeft;
    const minBound = (cloneCount - 1) * cardWidth;
    const maxBound = (cloneCount + N) * cardWidth;
    const loopWidth = N * cardWidth;

    if (current < minBound) {
      grid.scrollLeft = current + loopWidth;
      targetScroll = grid.scrollLeft;
    } else if (current >= maxBound) {
      grid.scrollLeft = current - loopWidth;
      targetScroll = grid.scrollLeft;
    }
  };

  const animateToTarget = () => {
    const start = grid.scrollLeft;
    const change = targetScroll - start;
    const duration = 300; // Fast 300ms for continuous response
    let startTime = null;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    function step(currentTime) {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad for smooth snapping deceleration
      const ease = progress * (2 - progress);
      grid.scrollLeft = start + change * ease;

      if (elapsed < duration) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        grid.scrollLeft = targetScroll;
        animationFrameId = null;
        handleWrapAround();
      }
    }

    animationFrameId = requestAnimationFrame(step);
  };

  const onButtonClick = (direction) => {
    const loopWidth = N * cardWidth;
    const minBound = cloneCount * cardWidth;
    const maxBound = (cloneCount + N) * cardWidth;

    // Shift coordinate space instantly if target already went beyond boundaries due to fast spam clicks
    if (targetScroll >= maxBound) {
      grid.scrollLeft -= loopWidth;
      targetScroll -= loopWidth;
    } else if (targetScroll < minBound) {
      grid.scrollLeft += loopWidth;
      targetScroll += loopWidth;
    }

    targetScroll += direction * cardWidth;
    animateToTarget();
  };

  // Enable buttons (they should never be disabled in infinite loop)
  btnLeft.disabled = false;
  btnRight.disabled = false;

  btnLeft.addEventListener('click', (e) => {
    e.preventDefault();
    onButtonClick(-1);
  });

  btnRight.addEventListener('click', (e) => {
    e.preventDefault();
    onButtonClick(1);
  });

  grid.addEventListener('scroll', () => {
    if (!animationFrameId) {
      const current = grid.scrollLeft;
      const minBound = (cloneCount - 1) * cardWidth;
      const maxBound = (cloneCount + N) * cardWidth;
      const loopWidth = N * cardWidth;

      if (current < minBound) {
        grid.scrollLeft = current + loopWidth;
        targetScroll = grid.scrollLeft;
      } else if (current >= maxBound) {
        grid.scrollLeft = current - loopWidth;
        targetScroll = grid.scrollLeft;
      } else {
        targetScroll = current;
      }
    }
  }, { passive: true });
}

export async function mountFeaturedProducts() {
  const root = document.querySelector('[data-featured-products]');
  if (!root) return;

  const grid = root.querySelector('[data-featured-products-grid]');
  if (!grid) return;

  grid.innerHTML = skeletonMarkup(5);

  try {
    const payload = await fetchFeaturedProducts();
    const products = Array.isArray(payload?.products) ? payload.products : [];

    if (!payload?.ok || products.length === 0) {
      throw new Error(payload?.message || 'Khong the tai san pham');
    }

    // Build prepended and appended clones for infinite looping
    const cloneCount = Math.min(5, products.length);
    const prependedClones = products.slice(-cloneCount);
    const appendedClones = products.slice(0, cloneCount);
    const displayedProducts = [...prependedClones, ...products, ...appendedClones];

    grid.innerHTML = displayedProducts.map(createCard).join('');

    attachCardEvents(grid);
    injectProductSchema(products);
    initSlider(root, grid, products.length, cloneCount);
  } catch (error) {
    grid.innerHTML = '';
  }
}
