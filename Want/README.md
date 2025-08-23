# Want - Personal Wishlist PWA

A super-simple, offline-first Progressive Web App for managing your personal wishlist. Built with vanilla JavaScript and IndexedDB for local storage.

## Features

- 📱 **PWA Ready** - Installable to home screen, works offline
- 🎯 **Simple Grid** - Clean 1:1 square cards showing your items
- 🔗 **Quick Add** - Add items via URL parameters or form
- 💾 **Local Storage** - All data stored locally using IndexedDB
- 🖼️ **Auto Images** - Automatically fetches images from URLs
- 📱 **Mobile First** - Responsive design that works on all devices
- 🚫 **No Backend** - Completely client-side, no server required

## Usage

### Adding Items

1. **Via Form**: Click the "+ Add" button and fill out the form
2. **Via URL**: Use `add.html?url=...&title=...&price=...` for quick adding
3. **Bookmarklet**: Create a bookmarklet for one-click adding

### Quick Add URL Format

```
add.html?url=https://example.com&title=Item Name&price=$99.99&image=https://example.com/image.jpg
```

### Bookmarklet

Create a bookmark with this JavaScript:

```javascript
javascript:(function(){
  var url = window.location.href;
  var title = document.title;
  window.open('add.html?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title), '_blank');
})();
```

## File Structure

```
/
├── index.html          # Main app page
├── add.html            # Quick add page
├── styles.css          # All styles
├── app.js              # Main app logic
├── db.js               # IndexedDB operations
├── add.js              # Quick add logic
├── manifest.webmanifest # PWA manifest
├── sw.js               # Service worker
├── vendor/
│   └── idb.min.js      # IndexedDB helper library
└── assets/
    ├── icon-192.png    # App icon (192x192)
    └── icon-512.png    # App icon (512x512)
```

## Data Schema

Each item in the database has this structure:

```javascript
{
  id: string,           // Unique identifier
  url: string,          // Item URL
  title: string,        // Item title
  price: string,        // Price (optional)
  image: string,        // Image URL (optional)
  domain: string,       // Extracted domain
  createdAt: number     // Timestamp
}
```

## Deployment

This app is designed to work on any static hosting service:

- **GitHub Pages**: Just push to a repository and enable Pages
- **Netlify**: Drag and drop the folder
- **Vercel**: Connect your repository
- **Any static host**: Upload all files

## Browser Support

- Chrome/Edge (full PWA support)
- Firefox (full PWA support)
- Safari (basic PWA support)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development

1. Clone or download the files
2. Open `index.html` in a browser
3. For PWA testing, serve via HTTPS (required for service worker)

### Local Development Server

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

## License

MIT License - feel free to use and modify as needed.
