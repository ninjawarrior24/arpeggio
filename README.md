# Arpeggio — streamlined static site

This workspace contains the rebuilt static site. Key changes:

- Unified stylesheet: `css/style.css` (header, hero, features, forms, responsive)
- Consistent header and footer across pages: `index.html`, `team.html`, `portfolio.html`, `contact.html`
- Removed the legacy `oldindex.html` duplicate

Local testing:

1. Open the HTML files directly in a browser (double-click `index.html`).
2. Or serve locally with Python from the site root:

```powershell
python -m http.server 8000
# then open http://localhost:8000
```

Deploy to GitHub Pages as usual (push to a repo and enable Pages in settings).

