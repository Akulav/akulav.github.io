<div align="center">

<img src="assets/icon.png" alt="akulav" width="128" height="128">

# akulav.github.io

**The home page of every project made by Akulav.**

No frameworks. No build step. No trackers. Plain HTML, CSS and JavaScript, published straight from `main`.

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fakulav.github.io&style=for-the-badge&label=akulav.github.io&color=7c5cff)](https://akulav.github.io)
[![Check](https://img.shields.io/github/actions/workflow/status/Akulav/akulav.github.io/check.yml?branch=main&style=for-the-badge&label=links)](https://github.com/Akulav/akulav.github.io/actions/workflows/check.yml)

![HTML](https://img.shields.io/badge/HTML-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-source--available-5c6270?style=flat-square)

### [🌐 Open the site](https://akulav.github.io)

</div>

---

## ✨ What's on it

<table>
<tr>
<td width="50%" valign="top">

### ★ Featured work
Aura Portfolio, Lumen, Security Modeler, Hyve, Akulav Launcher, AkulavBox and AutoNode, each with
its features, platforms and a **Download** button straight to the latest release.

</td>
<td width="50%" valign="top">

### 🧰 More on GitHub
Tsukimi, SeePass, Fast File Recovery, Fast Disk Eraser, IPTrail, Akulav Tracker, FleetView and e-Management ANSC.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📦 How they ship
The rules every desktop app follows: one file per system that installs and updates itself, everything kept in the
folder you choose, SHA-256-verified updates, no telemetry.

</td>
<td width="50%" valign="top">

### 🎨 The page itself
An aurora background, a star constellation that reacts to the cursor, tilt-and-spotlight cards and a typing tagline.
Respects `prefers-reduced-motion`.

</td>
</tr>
</table>

## 🚀 Run it locally

```bash
npx http-server -p 5173 -c-1
```

Then open `http://localhost:5173`. Any static file server works.

<details>
<summary><b>🛠️ For maintainers: adding a project and publishing</b></summary>

### Adding or changing a project

Everything is data at the top of [`script.js`](script.js):

- `pinned`: the large **Featured** cards (title, icon, language, platforms, accent colour, description, five features).
- `more`: the small cards.
- `release: true` adds a **Download** button that links to the repository's latest release.

### Publishing

GitHub Pages publishes `main` as is. The [check workflow](.github/workflows/check.yml) runs on every push and weekly:
it makes sure the script parses, every linked repository exists and every file `index.html` references is present.

### Icon

`node tools/make-icon.js` redraws `assets/icon.svg` and `assets/icon.png` (no dependencies).

</details>

---

<div align="center">

**Made with ❤️ by [Akulav](https://github.com/Akulav)**

<sub>© 2026 Akulav. Source-available under the <a href="LICENSE">Akulav Source-Available License</a>.</sub>

</div>
