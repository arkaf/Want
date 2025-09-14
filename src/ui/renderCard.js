import { withProxy } from '../utils/url.js';

export function renderCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.itemId = item.id;

    const img = document.createElement('img');
    img.className = 'card-image';
    img.alt = item.title || item.domain;
    img.src = item.image ? withProxy(item.image) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.onerror = () => { 
        if (item.image) img.src = item.image; 
    };

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title || 'Untitled';

    const price = document.createElement('div');
    price.className = 'card-price';
    price.textContent = item.price || '';

    const domain = document.createElement('div');
    domain.className = 'card-site';
    domain.textContent = item.domain || '';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('data-action', 'delete');
    deleteBtn.setAttribute('data-id', item.id);
    deleteBtn.innerHTML = '×';

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(domain);
    card.appendChild(deleteBtn);

    return card;
}
