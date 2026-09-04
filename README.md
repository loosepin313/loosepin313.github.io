# Personal Website

Personal website and blog for [loosepin313](https://github.com/loosepin313), built with [Jekyll](https://jekyllrb.com/) and hosted on GitHub Pages.

## Features

- Minimal, dependency-free design (JetBrains Mono, light/dark mode with system-preference detection and manual toggle)
- Blog via Jekyll posts + RSS feed (`jekyll-feed`)
- About and contact pages

## Development

```sh
gem install jekyll bundler
bundle install
bundle exec jekyll serve    # http://localhost:4000
```

## Structure

| Path | Purpose |
| --- | --- |
| `_config.yml` | Site metadata and build settings |
| `_layouts/` | HTML layouts (`default`, `page`, `post`) |
| `_posts/` | Blog posts (`YYYY-MM-DD-title.md`) |
| `assets/css/style.css` | All styling — theme design tokens at the top |
| `assets/js/theme.js` | Light/dark theme toggle |
| `index.md` / `about.md` / `contact.md` / `404.html` | Pages |

## Deployment

Push to the `main` branch of the `loosepin313.github.io` repository — GitHub Pages builds it automatically.

## License

[MIT](./LICENSE)
