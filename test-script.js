  // ===== STATE =====
  var currentProductIndex = 0;
  var currentPhotoIndex = 0;
  var productPhotos = [];
  var cart = [];
  var allProducts = [];
  var whatsappNumber = null;
  try {
    allProducts = [[{"id":"AgACAgEAAxkBAAIBgWnAzmTiRvoVR-fTdRXcOF7YfG76AAJPDGsbAAGPCUZsGutYb5zf_wEAAwIAA3kAAzoE","url":"https://localhost:3001/api/photos?id=AgACAgEAAxkBAAIBgWnAzmTiRvoVR-fTdRXcOF7YfG76AAJPDGsbAAGPCUZsGutYb5zf_wEAAwIAA3kAAzoE"}],[{"id":"AgACAgEAAxkBAAICI2nBqLfJHIS65_cnVO0FsV_qaSf0AALYC2sb4NcRRmxK_Vkm7FX7AQADAgADeQADOgQ","url":"https://localhost:3001/api/photos?id=AgACAgEAAxkBAAICI2nBqLfJHIS65_cnVO0FsV_qaSf0AALYC2sb4NcRRmxK_Vkm7FX7AQADAgADeQADOgQ"}],[{"id":"AgACAgEAAxkBAAIBZ2nAueooTvF7x28UQsHTjSNe5K9iAAJHDGsbAAGPCUYnZRDM3lrOBgEAAwIAA3kAAzoE","url":"https://localhost:3001/api/photos?id=AgACAgEAAxkBAAIBZ2nAueooTvF7x28UQsHTjSNe5K9iAAJHDGsbAAGPCUYnZRDM3lrOBgEAAwIAA3kAAzoE"}],[{"id":"AgACAgEAAxkBAAIBSWnAifgLw9Y9Ar5K7HO9FAGALlHjAAI2DGsbAAGPCUYWxU5NAAH-tkkBAAMCAAN5AAM6BA","url":"https://localhost:3001/api/photos?id=AgACAgEAAxkBAAIBSWnAifgLw9Y9Ar5K7HO9FAGALlHjAAI2DGsbAAGPCUYWxU5NAAH-tkkBAAMCAAN5AAM6BA"}],[{"id":"AgACAgEAAxkBAAIBomnA1uSMNEVYBlMxzGbPgJ1OmnIMAAJQDGsbAAGPCUbED0mTYIlfdwEAAwIAA3kAAzoE","url":"https://localhost:3001/api/photos?id=AgACAgEAAxkBAAIBomnA1uSMNEVYBlMxzGbPgJ1OmnIMAAJQDGsbAAGPCUbED0mTYIlfdwEAAwIAA3kAAzoE"}]];
    whatsappNumber = "584121882008";
  } catch(e) {
    console.error('Init error:', e);
  }

  // ===== THEME =====
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');

    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    darkIcon.style.display = isDark ? 'none' : 'block';
    lightIcon.style.display = isDark ? 'block' : 'none';
  }

  // Initialize theme
  (function() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    darkIcon.style.display = theme === 'dark' ? 'block' : 'none';
    lightIcon.style.display = theme === 'light' ? 'block' : 'none';
  })();

  // ===== TABS =====
  function show(tab) {
    var tabs = document.querySelectorAll('.tab');
    document.getElementById('sec-now').classList.remove('visible');
    document.getElementById('sec-order').classList.remove('visible');
    tabs.forEach(function(t) { t.className = 'tab'; });

    if (tab === 'now') {
      document.getElementById('sec-now').classList.add('visible');
      tabs[0].className = 'tab active-now';
    } else {
      document.getElementById('sec-order').classList.add('visible');
      tabs[1].className = 'tab active-order';
    }
  }

  // ===== CATEGORY FILTER =====
  function filterByCategory(category) {
    document.querySelectorAll('.category-chip').forEach(function(chip) {
      chip.classList.toggle('active', chip.textContent.toLowerCase().includes(category.toLowerCase()) ||
        (category === 'all' && chip.textContent.toLowerCase().includes('todos')));
    });

    var cards = document.querySelectorAll('.card');
    cards.forEach(function(card) {
      var cardCategory = card.getAttribute('data-category') || '';
      if (category === 'all' || cardCategory.includes(category.toLowerCase())) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // ===== LIGHTBOX =====
  function openLightbox(productIndex, photoIndex) {
    currentProductIndex = productIndex;
    currentPhotoIndex = photoIndex;
    productPhotos = allProducts[productIndex] || [];

    if (productPhotos.length === 0) return;

    updateLightboxImage();
    document.getElementById('lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(event) {
    if (event.target.closest('.lightbox-nav') || event.target.closest('.lightbox-counter')) return;
    document.getElementById('lightbox').classList.remove('active');
    document.body.style.overflow = '';
  }

  function updateLightboxImage() {
    const photo = productPhotos[currentPhotoIndex];
    if (!photo) return;

    document.getElementById('lightbox-img').src = photo.url;
    document.getElementById('lightbox-counter').textContent =
      productPhotos.length > 1
        ? (currentPhotoIndex + 1) + ' / ' + productPhotos.length
        : '';

    document.getElementById('btn-prev').disabled = currentPhotoIndex === 0;
    document.getElementById('btn-next').disabled = currentPhotoIndex === productPhotos.length - 1;
  }

  function prevPhoto(event) {
    event.stopPropagation();
    if (currentPhotoIndex > 0) {
      currentPhotoIndex--;
      updateLightboxImage();
    }
  }

  function nextPhoto(event) {
    event.stopPropagation();
    if (currentPhotoIndex < productPhotos.length - 1) {
      currentPhotoIndex++;
      updateLightboxImage();
    }
  }

  // ===== CART =====
  function addToCart(productIndex, event) {
    event.stopPropagation();
    var btn = event.currentTarget;
    var data = JSON.parse(btn.getAttribute('data-product').replace(/&#39;/g, "'"));

    var existingItem = cart.find(function(item) { return item.index === productIndex; });
    if (existingItem) {
      existingItem.quantity++;
    } else {
      cart.push({
        index: productIndex,
        nombre: data.nombre,
        precio: data.precio,
        foto: data.foto,
        quantity: 1
      });
    }

    // Visual feedback
    btn.classList.add('added');
    setTimeout(function() { btn.classList.remove('added'); }, 500);

    updateCartUI();
    openCart();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
  }

  function updateCartQuantity(index, delta) {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    updateCartUI();
  }

  function updateCartUI() {
    var countEl = document.getElementById('cart-count');
    var itemsEl = document.getElementById('cart-items');
    var emptyEl = document.getElementById('cart-empty');
    var totalEl = document.getElementById('cart-total-count');
    var checkoutBtn = document.getElementById('btn-checkout');

    var totalItems = cart.reduce(function(sum, item) { return sum + item.quantity; }, 0);

    countEl.textContent = totalItems;
    countEl.classList.toggle('visible', totalItems > 0);

    if (cart.length === 0) {
      emptyEl.style.display = 'block';
      itemsEl.innerHTML = '';
      itemsEl.appendChild(emptyEl);
      checkoutBtn.disabled = true;
    } else {
      emptyEl.style.display = 'none';
      checkoutBtn.disabled = false;

      itemsEl.innerHTML = cart.map(function(item, i) {
        return '<div class="cart-item">' +
          '<img src="' + item.foto + '" alt="' + item.nombre + '" class="cart-item-img" onerror="this.remove()">' +
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + item.nombre + '</div>' +
            '<div class="cart-item-price">' + item.precio + '</div>' +
            '<div class="cart-item-qty">' +
              '<button class="qty-btn" onclick="updateCartQuantity(' + i + ', -1)">-</button>' +
              '<span>' + item.quantity + '</span>' +
              '<button class="qty-btn" onclick="updateCartQuantity(' + i + ', 1)">+</button>' +
            '</div>' +
          '</div>' +
          '<button class="cart-item-remove" onclick="removeFromCart(' + i + ')">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<polyline points="3 6 5 6 21 6"></polyline>' +
              '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1 2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>' +
            '</svg>' +
          '</button>' +
        '</div>';
      }).join('');

      itemsEl.appendChild(emptyEl);
    }

    totalEl.textContent = totalItems + ' item' + (totalItems !== 1 ? 's' : '');
  }

  function openCart() {
    document.getElementById('cart-overlay').classList.add('active');
    document.getElementById('cart-sidebar').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    document.getElementById('cart-overlay').classList.remove('active');
    document.getElementById('cart-sidebar').classList.remove('active');
    document.body.style.overflow = '';
  }

  function checkoutWhatsApp() {
    if (!whatsappNumber || cart.length === 0) return;

    var itemsText = cart.map(function(item) {
      return '- ' + item.quantity + 'x ' + item.nombre + ' (' + item.precio + ')';
    }).join('\n');

    var message = 'Hola BJ Prestige, me interesa consultar disponibilidad de:\n\n' + itemsText + '\n\nGracias!';

    var url = 'https://wa.me/' + whatsappNumber + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
  }

  // ===== KEYBOARD NAVIGATION =====
  document.addEventListener('keydown', function(e) {
    // Close lightbox on Escape
    if (e.key === 'Escape') {
      if (document.getElementById('lightbox').classList.contains('active')) {
        document.getElementById('lightbox').classList.remove('active');
        document.body.style.overflow = '';
      }
      if (document.getElementById('cart-sidebar').classList.contains('active')) {
        closeCart();
      }
    }
    // Navigate lightbox with arrows
    if (document.getElementById('lightbox').classList.contains('active')) {
      if (e.key === 'ArrowLeft') prevPhoto(e);
      if (e.key === 'ArrowRight') nextPhoto(e);
    }
  });

  // Initialize cart UI
  updateCartUI();
