import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBnbProductsFromHtml } from '../src/utils/parser.js';

const cardHtml = `
  <form data-id="product-actions-1072968360" class="bg-background relative z-10 m-0 h-full">
    <div class="card-product__top">
      <picture>
        <source media="(max-width: 600px)" srcset="//cdn.example.com/product-mobile.jpg">
        <img src="//cdn.example.com/product.jpg" alt="Am dien">
      </picture>
    </div>
    <a class="link" href="/products/am-dien-swf17s18avn-vn" title="Am dien/SWF17S18AVN/VN/">
      <div class="card-product__body">
        <div class="card-product__title">Am dien/SWF17S18AVN/VN/</div>
        <div class="price-box flex justify-between items-center">
          <div class="flex flex-col gap-1">
            <span class="price text-h6">453,000đ</span>
            <div class="inline-flex items-center gap-1">
              <span class="compare-price line-through text-xs">860,000đ</span>
              <div class="badge sale-badge font-semibold text-xs">-48%</div>
            </div>
          </div>
        </div>
      </div>
    </a>
  </form>
`;

test('parseBnbProductsFromHtml extracts normalized product cards', () => {
  const products = parseBnbProductsFromHtml(cardHtml, 'https://bepngocbao.vn/collections/hot-products');

  assert.equal(products.length, 1);
  assert.deepEqual(products[0], {
    id: '1072968360',
    name: 'Am dien/SWF17S18AVN/VN/',
    price: '453000',
    comparePrice: '860000',
    discount: '48',
    image: 'https://cdn.example.com/product.jpg',
    url: 'https://bepngocbao.vn/products/am-dien-swf17s18avn-vn',
  });
});

test('parseBnbProductsFromHtml derives missing values from JSON-like source', () => {
  const jsonHtml = `
    <script type="application/json">
      {
        "products": [
          {
            "id": 2001,
            "title": "Noi com dien",
            "price": 1299000,
            "compare_at_price": 1599000,
            "url": "/products/noi-com-dien",
            "featured_image": "//cdn.example.com/rice-cooker.jpg"
          }
        ]
      }
    </script>
  `;

  const products = parseBnbProductsFromHtml(jsonHtml, 'https://bepngocbao.vn/collections/hot-products');

  assert.equal(products.length, 1);
  assert.equal(products[0].id, '2001');
  assert.equal(products[0].name, 'Noi com dien');
  assert.equal(products[0].price, '1299000');
  assert.equal(products[0].comparePrice, '1599000');
  assert.equal(products[0].discount, '19');
  assert.equal(products[0].image, 'https://cdn.example.com/rice-cooker.jpg');
  assert.equal(products[0].url, 'https://bepngocbao.vn/products/noi-com-dien');
});

test('parseBnbProductsFromHtml ignores invalid entries without url or name', () => {
  const html = `
    <form data-id="product-actions-1">
      <span class="price">100,000đ</span>
    </form>
    <script type="application/json">
      { "products": [{ "id": 3, "price": 1000 }] }
    </script>
  `;

  const products = parseBnbProductsFromHtml(html, 'https://bepngocbao.vn/collections/hot-products');
  assert.deepEqual(products, []);
});
